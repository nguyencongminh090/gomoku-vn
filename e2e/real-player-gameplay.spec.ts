import { test, expect, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Full end-to-end simulation of two real players using the product through
 * the actual UI (no direct socket emits, no API shortcuts beyond the guest
 * login endpoint that the login page itself calls): lobby -> create/join room
 * -> sit -> ready -> play a complete game to a five-in-a-row win -> chat ->
 * a real mid-game network drop/reconnect, the same pattern visible in the
 * server log this test was written to investigate (rapid disconnect/grace
 * period/reconnect cycles).
 *
 * Every step is timestamped and durations are measured (room creation, join,
 * ready-up, per-move round-trip latency, reconnect recovery time). Console
 * errors/warnings, failed network responses, and uncaught page errors are
 * captured for both browsers throughout. Everything is written to a
 * Markdown + JSON report under e2e/results/ so the run can be inspected
 * after the fact, in addition to being asserted on inline.
 *
 * Move-latency numbers are only meaningful measured in isolation — run with
 * `npx playwright test e2e/real-player-gameplay.spec.ts --project=chromium`.
 * Under full-suite parallelism (this spec's browsers competing with
 * reconnect-banner.spec.ts's 48s offline simulation etc. for CPU) individual
 * step timeouts can be a lot slower than real-world latency.
 */

type LogEntry = { tMs: number; iso: string; actor: string; event: string; detail?: unknown };
type Issue = { actor: string; kind: string; detail: string };

test.describe('real-player gameplay simulation', () => {
  test('two guests play a full game with chat and a mid-game reconnect', async ({ browser }) => {
    test.setTimeout(180_000);

    const t0 = Date.now();
    const log: LogEntry[] = [];
    const issues: Issue[] = [];

    const record = (actor: string, event: string, detail?: unknown) => {
      const now = Date.now();
      log.push({ tMs: now - t0, iso: new Date(now).toISOString(), actor, event, detail });
      // eslint-disable-next-line no-console
      console.log(`[${((now - t0) / 1000).toFixed(2)}s] [${actor}] ${event}${detail ? ' ' + JSON.stringify(detail) : ''}`);
    };

    function wireDiagnostics(page: Page, actor: string) {
      page.on('console', (msg) => {
        const type = msg.type();
        // Browsers themselves log a console.error for any request that fails
        // while the network is down — expected noise from our own deliberate
        // offline simulation below, not an application issue.
        if ((type === 'error' || type === 'warning') && !msg.text().includes('ERR_INTERNET_DISCONNECTED')) {
          issues.push({ actor, kind: `console.${type}`, detail: msg.text() });
        }
      });
      page.on('pageerror', (err) => {
        issues.push({ actor, kind: 'pageerror', detail: err.message });
      });
      page.on('response', (res) => {
        if (res.status() >= 400) {
          issues.push({ actor, kind: 'http', detail: `${res.status()} ${res.url()}` });
        }
      });
      page.on('requestfailed', (req) => {
        // Aborted requests during the deliberate offline simulation are expected.
        if (req.failure()?.errorText !== 'net::ERR_INTERNET_DISCONNECTED') {
          issues.push({ actor, kind: 'requestfailed', detail: `${req.url()} :: ${req.failure()?.errorText}` });
        }
      });
    }

    async function makeGuestPlayer(actor: string) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      wireDiagnostics(page, actor);

      const res = await page.request.post('/api/auth/guest');
      expect(res.ok(), `${actor} guest auth should succeed`).toBeTruthy();
      const { token, displayName } = await res.json();

      await ctx.addInitScript(([t, d]) => {
        localStorage.setItem('gvn_token', t as string);
        localStorage.setItem('gvn_display_name', d as string);
        // Single-tap placement — the default double-tap-confirm mode exists to
        // protect against fat-finger mis-clicks on touch devices; a scripted
        // click is precise, so this just removes an unnecessary extra click
        // per move without touching any server-side behavior.
        localStorage.setItem('gomoku_click_mode', 'single');
      }, [token, displayName]);

      record(actor, 'guest_auth_ok', { displayName });
      return { ctx, page, actor, displayName };
    }

    async function navTiming(page: Page) {
      return page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
        if (!nav) return null;
        return {
          domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
          loadMs: Math.round(nav.loadEventEnd),
          ttfbMs: Math.round(nav.responseStart),
        };
      });
    }

    const results: Record<string, unknown> = {};

    // ── Player A: guest login, create a room via the real "Quick match" flow ──
    const A = await makeGuestPlayer('PlayerA');
    let tStart = Date.now();
    await A.page.goto('/index.html');
    results.lobbyNavTimingA = await navTiming(A.page);
    await expect(A.page.locator('#btn-create')).toBeVisible();
    await A.page.click('#btn-create');
    await expect(A.page.locator('#modal-create')).toHaveClass(/visible|open/).catch(() => {});
    // FINDING: the default lobby UI mode is "lite", whose fixed Quick-Match
    // preset (LITE_DEFAULT_SETTINGS in lobby.js) always turns Wall ON,
    // regardless of what the advanced panel shows. With Wall on, the first
    // move must land in one of the randomly-placed firstMoveZone cells or
    // the server silently rejects it (surfaced only as a chat system line,
    // no board/toast feedback) — this test drives a deterministic win line,
    // so it explicitly turns Wall off rather than special-casing every
    // possible wall layout.
    await A.page.click('#modal-advanced-toggle');
    // #rule-wall is a visually-hidden native input behind a custom
    // toggle-switch slider (zero-size and out of the viewport per the
    // toggle-switch CSS pattern), so Playwright can't click it directly —
    // not even with force. A real user clicks the visible slider label,
    // which the browser delegates to the wrapped input as a native click;
    // reproduce that by flipping the input + firing the same 'change' event
    // the app's onchange="updateSettings()" handler listens for.
    await A.page.locator('#rule-wall').evaluate((el: HTMLInputElement) => {
      if (el.checked) {
        el.checked = false;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await A.page.click('#btn-quick-match');
    await A.page.waitForURL(/room\.html/, { timeout: 15000 });
    await expect(A.page.locator('#room-id-nav')).not.toHaveText('', { timeout: 15000 });
    const roomId = new URL(A.page.url()).searchParams.get('id');
    expect(roomId, 'room id should be present in the URL after creation').toBeTruthy();
    record('PlayerA', 'room_created', { roomId, ms: Date.now() - tStart });

    // ── Player B: guest login, join the room by URL (as a shared link would) ──
    const B = await makeGuestPlayer('PlayerB');
    tStart = Date.now();
    await B.page.goto(`/room.html?id=${encodeURIComponent(roomId!)}`);
    results.roomNavTimingB = await navTiming(B.page);
    await expect(B.page.locator('#room-id-nav')).not.toHaveText('', { timeout: 15000 });
    record('PlayerB', 'room_joined', { roomId, ms: Date.now() - tStart });

    // Both should now see each other in the room (sanity check presence sync).
    await A.page.click('[data-tab="tab-users"]');
    await expect(A.page.locator('#users-list')).toContainText(B.displayName, { timeout: 10000 });
    await A.page.click('[data-tab="tab-chat"]');
    record('system', 'presence_sync_ok', { seenBy: 'PlayerA', of: 'PlayerB' });

    // ── Both sit down in their slots ──
    await A.page.locator('#slot-1 .slot-card__clickable').click();
    record('PlayerA', 'sit_down', { slot: 1 });
    await B.page.locator('#slot-2 .slot-card__clickable').click();
    record('PlayerB', 'sit_down', { slot: 2 });

    // ── Both confirm ready within the start-modal window ──
    await expect(A.page.locator('#start-modal')).toHaveClass(/visible/, { timeout: 15000 });
    await expect(B.page.locator('#start-modal')).toHaveClass(/visible/, { timeout: 15000 });
    tStart = Date.now();
    await A.page.click('#start-modal-btn');
    record('PlayerA', 'ready_confirmed');
    await B.page.click('#start-modal-btn');
    record('PlayerB', 'ready_confirmed');

    await A.page.waitForFunction(() => (window as any).RoomState?.gameState?.status === 'ongoing', null, { timeout: 20000 });
    await B.page.waitForFunction(() => (window as any).RoomState?.gameState?.status === 'ongoing', null, { timeout: 20000 });
    record('system', 'game_started', { readyToStartMs: Date.now() - tStart });

    // ── Figure out who is BLACK/WHITE so the move script targets the right browser ──
    const colorA: string = await A.page.evaluate(() => {
      const st = (window as any).RoomState;
      return st.gameState.players.find((p: any) => p.userId === st.myUser.userId).color;
    });
    const black = colorA === 'BLACK' ? A : B;
    const white = colorA === 'BLACK' ? B : A;
    record('system', 'colors_assigned', { [black.actor]: 'BLACK', [white.actor]: 'WHITE' });

    async function myUserId(p: typeof A) {
      return p.page.evaluate(() => (window as any).RoomState.myUser.userId);
    }
    const blackId = await myUserId(black);
    const whiteId = await myUserId(white);

    async function placeStone(p: typeof A, uid: string, x: number, y: number) {
      await p.page.waitForFunction(
        (id) => (window as any).RoomState?.gameState?.currentTurn === id,
        uid,
        { timeout: 20000 },
      );
      // The board's canvas geometry is computed asynchronously (resize() runs
      // off a requestAnimationFrame) after gameState flips to 'ongoing', so a
      // click immediately on turn-change can race a still-zeroed cellSize and
      // land on a NaN cell that the renderer silently ignores.
      await p.page.waitForFunction(
        () => !!(window as any).RoomState?.boardRenderer?.geo?.cellSize,
        null,
        { timeout: 10000 },
      );
      const geo = await p.page.evaluate(() => {
        const br = (window as any).RoomState.boardRenderer;
        return { cellSize: br.geo.cellSize, originX: br.geo.originX, originY: br.geo.originY };
      });
      const px = geo.originX + (x + 0.5) * geo.cellSize;
      const py = geo.originY + (y + 0.5) * geo.cellSize;
      const beforeCount = await p.page.evaluate(() => (window as any).RoomState.gameState.moveCount);

      const t = Date.now();
      // Real players hover before clicking — exercise the hover-highlight path too.
      await p.page.mouse.move(px - 10, py - 10);
      await p.page.locator('#game-canvas').hover({ position: { x: px, y: py } });
      await p.page.locator('#game-canvas').click({ position: { x: px, y: py } });
      await p.page.waitForFunction(
        (bc) => (window as any).RoomState?.gameState?.moveCount > bc,
        beforeCount,
        { timeout: 20000 },
      );
      const latencyMs = Date.now() - t;
      record(p.actor, 'move_placed', { x, y, latencyMs });
      return latencyMs;
    }

    // ── Vertical five-in-a-row for BLACK at x=5, WHITE plays a harmless
    //    column at x=12 so it never blocks or wins first. ──
    const latencies: number[] = [];
    latencies.push(await placeStone(black, blackId, 5, 5));
    latencies.push(await placeStone(white, whiteId, 12, 5));
    latencies.push(await placeStone(black, blackId, 5, 6));

    // ── Mid-game chat exchange (real player behavior, exercises chat path
    //    while a game is in progress) ──
    await A.page.fill('#chat-input', 'gl hf!');
    await A.page.click('#btn-send');
    await expect(B.page.locator('#chat-messages')).toContainText('gl hf!', { timeout: 10000 });
    record('PlayerA', 'chat_sent_and_received', { text: 'gl hf!' });

    // ── Mid-game network drop + reconnect on WHITE, mirroring the disconnect
    //    /grace-period/reconnect cycle seen repeatedly in the provided server
    //    log. This checks the game survives a real connectivity blip: no
    //    timer runaway, no dropped turn, no loss of board state. ──
    tStart = Date.now();
    const whiteBanner = white.page.locator('#status-banner');
    await white.ctx.setOffline(true);
    record(white.actor, 'network_dropped');
    await expect(whiteBanner).toHaveClass(/visible/, { timeout: 60000 });
    record(white.actor, 'disconnect_banner_shown', { ms: Date.now() - tStart });

    await white.page.waitForTimeout(2000); // simulate a brief real-world connectivity blip
    await white.ctx.setOffline(false);
    record(white.actor, 'network_restored');
    await expect(whiteBanner).not.toHaveClass(/visible/, { timeout: 30000 });
    const reconnectMs = Date.now() - tStart;
    record(white.actor, 'reconnected_and_banner_cleared', { totalMs: reconnectMs });
    results.reconnectRecoveryMs = reconnectMs;

    // Game must still be alive and it must still be WHITE's turn (server-side
    // grace period should have paused the clock, not skipped the turn).
    await white.page.waitForFunction(() => (window as any).RoomState?.gameState?.status === 'ongoing', null, { timeout: 10000 });
    const turnAfterReconnect = await white.page.evaluate(() => (window as any).RoomState.gameState.currentTurn);
    expect(turnAfterReconnect, 'turn should not have been skipped by the disconnect').toBe(whiteId);
    record('system', 'turn_preserved_after_reconnect', { currentTurn: turnAfterReconnect });

    // ── Resume the game to completion ──
    latencies.push(await placeStone(white, whiteId, 12, 6));
    latencies.push(await placeStone(black, blackId, 5, 7));
    latencies.push(await placeStone(white, whiteId, 12, 7));
    latencies.push(await placeStone(black, blackId, 5, 8));
    latencies.push(await placeStone(white, whiteId, 12, 8));
    latencies.push(await placeStone(black, blackId, 5, 9)); // five-in-a-row → BLACK wins

    // ── Verify win detection on both clients ──
    // No more win/lose modal (TODO.md #36 removed #game-overlay) — game end
    // resets both seats to not-ready ("new seat pair") and the Start Modal
    // reappears, ready for a fresh round, since nobody stood up.
    await expect(black.page.locator('#start-modal')).toHaveClass(/visible/, { timeout: 15000 });
    await expect(white.page.locator('#start-modal')).toHaveClass(/visible/, { timeout: 15000 });
    record('system', 'start_modal_reappeared_after_game_end', { [black.actor]: true, [white.actor]: true });

    const finalResult = await black.page.evaluate(() => (window as any).RoomState.gameState.result);
    expect(finalResult?.winner, 'server should report BLACK as the winner').toBe(blackId);
    record('system', 'server_confirms_winner', finalResult);

    // ── Metrics summary ──
    results.roomId = roomId;
    results.moveLatenciesMs = latencies;
    results.avgMoveLatencyMs = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
    results.maxMoveLatencyMs = Math.max(...latencies);
    results.totalTestDurationMs = Date.now() - t0;
    results.finalResult = finalResult;
    results.issueCount = issues.length;

    // ── Write the report before any assertion below can fail the test ──
    writeReport({ roomId, log, issues, results, blackActor: black.actor, whiteActor: white.actor });

    await A.ctx.close();
    await B.ctx.close();

    // Fail loudly if the app logged anything to console.error, threw an
    // uncaught error, or a request came back >=400 during a completely
    // ordinary game — this is the "detect potential issues" gate.
    const hardIssues = issues.filter((i) => i.kind !== 'console.warning');
    if (hardIssues.length > 0) {
      console.log('Issues detected during gameplay simulation:', JSON.stringify(hardIssues, null, 2));
    }
    expect(hardIssues, 'no console errors / uncaught exceptions / failed requests during normal play').toEqual([]);
  });
});

function writeReport(opts: {
  roomId: string | null;
  log: LogEntry[];
  issues: Issue[];
  results: Record<string, unknown>;
  blackActor: string;
  whiteActor: string;
}) {
  const { roomId, log, issues, results, blackActor, whiteActor } = opts;
  const dir = path.join(__dirname, 'results');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = `real-player-gameplay-${stamp}`;

  fs.writeFileSync(path.join(dir, `${base}.json`), JSON.stringify({ roomId, results, log, issues }, null, 2));

  const md: string[] = [];
  md.push(`# Real-player gameplay simulation — ${new Date().toISOString()}`);
  md.push('');
  md.push(`Room: \`${roomId}\` | BLACK = ${blackActor} | WHITE = ${whiteActor}`);
  md.push('');
  md.push('## Summary');
  md.push('');
  md.push(`- Total duration: ${results.totalTestDurationMs} ms`);
  md.push(`- Move latencies (ms): ${JSON.stringify(results.moveLatenciesMs)}`);
  md.push(`- Avg move latency: ${results.avgMoveLatencyMs} ms | Max: ${results.maxMoveLatencyMs} ms`);
  md.push(`- Reconnect recovery time: ${results.reconnectRecoveryMs} ms`);
  md.push(`- Lobby nav timing (PlayerA): ${JSON.stringify(results.lobbyNavTimingA)}`);
  md.push(`- Room nav timing (PlayerB): ${JSON.stringify(results.roomNavTimingB)}`);
  md.push(`- Final result: ${JSON.stringify(results.finalResult)}`);
  md.push(`- Issues detected: ${issues.length}`);
  md.push('');
  md.push('## Timeline');
  md.push('');
  md.push('| t (s) | actor | event | detail |');
  md.push('|---|---|---|---|');
  for (const e of log) {
    md.push(`| ${(e.tMs / 1000).toFixed(2)} | ${e.actor} | ${e.event} | ${e.detail ? '`' + JSON.stringify(e.detail) + '`' : ''} |`);
  }
  md.push('');
  md.push('## Issues (console errors/warnings, page errors, failed requests)');
  md.push('');
  if (issues.length === 0) {
    md.push('None detected.');
  } else {
    md.push('| actor | kind | detail |');
    md.push('|---|---|---|');
    for (const i of issues) {
      md.push(`| ${i.actor} | ${i.kind} | ${i.detail.replace(/\|/g, '\\|')} |`);
    }
  }
  md.push('');
  fs.writeFileSync(path.join(dir, `${base}.md`), md.join('\n'));

  // eslint-disable-next-line no-console
  console.log(`\nReport written to e2e/results/${base}.md (and .json)\n`);
}
