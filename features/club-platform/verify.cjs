'use strict';
// One-off verification for #465/#466/#467 (2026-11-25). Run from the repo root:
// PLAYWRIGHT_BROWSERS_PATH=... node features/club-platform/verify.cjs <light|en|e2e|e2e2>  (temp GOMOKU_DB_PATH)
// e2e2 = English, real moves (five in a row), draw by agreement, server restart mid-game, sub-tabs at 320 px.
const REPO = process.cwd();
const req = require('node:module').createRequire(REPO + '/package.json');
const { chromium } = req('@playwright/test');
const { spawn } = require('node:child_process');
const { mkdtempSync, mkdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const net = require('node:net');

const SHOTS = path.join(REPO, 'features/club-platform/screenshots/verify');
mkdirSync(SHOTS, { recursive: true });
const PW = 'local-qa-123';

async function run() {
  const probe = net.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port; await new Promise((r) => probe.close(r));
  const dir = mkdtempSync(path.join(tmpdir(), 'club-verify-'));
  const base = 'http://127.0.0.1:' + port;
  const env = { ...process.env, NODE_ENV: 'test', PORT: String(port), LISTEN_HOST: '127.0.0.1',
    JWT_SECRET: randomBytes(48).toString('hex'), GOMOKU_DB_PATH: path.join(dir, 'browser.db') };
  let app;
  async function startServer() {
    app = spawn(process.execPath, ['server/index.js'], { cwd: REPO, env, stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Server startup timeout')), 15000);
      app.stdout.on('data', (d) => { if (d.toString().includes('listening on')) { clearTimeout(timer); resolve(); } });
      app.once('exit', () => { clearTimeout(timer); reject(new Error('Server exited')); });
    });
  }
  async function stopServer() { const p = once(app, 'exit'); app.kill('SIGTERM'); await p; }
  await startServer();
  let browser;
  const mode = process.argv[2];
  try {
    browser = await chromium.launch({ executablePath: path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium-1243/chrome-linux64/chrome') });
    async function user(username, displayName, init) {
      const ctx = await browser.newContext({ viewport: { width: 1365, height: 900 } });
      if (init) await init(ctx);
      assert.ok((await ctx.request.post(base + '/api/auth/register', { data: { username, password: PW, displayName } })).ok());
      const page = await ctx.newPage(); page.setDefaultTimeout(10000);
      await page.goto(base + '/login.html');
      await page.locator('#login-username').fill(username);
      await page.locator('#login-password').fill(PW);
      await page.locator('#btn-login').click();
      await page.waitForURL((u) => !u.pathname.includes('login'));
      return { ctx, page };
    }
    async function shoot(page, name) {
      for (const [device, width, height] of [['desktop', 1365, 900], ['mobile', 390, 844]]) {
        await page.setViewportSize({ width, height });
        await page.screenshot({ path: path.join(SHOTS, name + '-' + device + '.png'), animations: 'disabled' });
      }
      await page.setViewportSize({ width: 1365, height: 900 });
    }
    const light = async (ctx) => ctx.addCookies([{ name: 'gvn_mode', value: 'light', url: base }]);
    const english = async (ctx) => ctx.addInitScript(() => { try { localStorage.setItem('play3cr_lang', 'en'); } catch (e) {} });

    if (mode === 'light') {
      const own = await user('trucmai', 'Trúc Mai', light);
      const club = await (await own.page.request.post(base + '/api/clubs', { data: { name: 'Kỳ Hội Mùa Thu', joinPolicy: 'open' } })).json();
      const m = await browser.newContext();
      await m.request.post(base + '/api/auth/register', { data: { username: 'hoamai', password: PW, displayName: 'Hoa Mai' } });
      await m.request.post(base + '/api/clubs/' + club.slug + '/join');
      await own.page.goto(base + '/c/' + club.slug);
      assert.equal(await own.page.evaluate(() => document.documentElement.getAttribute('data-mode')), 'light');
      await own.page.locator('#cb-ch-members').click();
      await own.page.locator('#cb-member-search').waitFor();
      await shoot(own.page, 'light-members');
      const styles = await own.page.evaluate(() => [...document.querySelectorAll('.cl-filter input, .cl-filter select')].map((el) => {
        const cs = getComputedStyle(el); return { id: el.id || el.className, bg: cs.backgroundColor, color: cs.color, border: cs.borderColor, h: el.getBoundingClientRect().height };
      }));
      console.log('LIGHT filter controls', JSON.stringify(styles));
      await own.page.locator('#cb-member-search').fill('hoa');
      await shoot(own.page, 'light-members-filtered');
    } else if (mode === 'en' || mode === 'e2e' || mode === 'e2e2') {
      const init = mode !== 'e2e' ? english : null;
      const P = {};
      P.trucmai = await user('trucmai', 'Trúc Mai', init);
      P.uyenvy = await user('uyenvy', 'Uyên Vy', init);
      P.baonam = await user('baonam', 'Bảo Nam', init);
      P.lananh = await user('lananh', 'Lan Anh', init);
      const club1 = await (await P.trucmai.page.request.post(base + '/api/clubs', { data: { name: 'Kỳ Hội Mùa Thu', joinPolicy: 'open' } })).json();
      const club2 = await (await P.baonam.page.request.post(base + '/api/clubs', { data: { name: 'Kỳ Hội Mùa Xuân', joinPolicy: 'open', tag: 'XUÂN', color: 'teal' } })).json();
      assert.ok((await P.uyenvy.page.request.post(base + '/api/clubs/' + club1.slug + '/join')).ok());
      assert.ok((await P.lananh.page.request.post(base + '/api/clubs/' + club2.slug + '/join')).ok());
      const page = P.trucmai.page;
      await page.goto(base + '/c/' + club1.slug);
      await page.locator('#cb-ch-tournaments').click();
      await page.locator('#cb-tournament-new').click();
      await page.waitForURL((u) => u.pathname.includes('index.html'));
      await page.locator('#modal-create-tournament.visible').waitFor();
      await page.locator('#tournament-name').fill('Đại Chiến Hội Quán');
      await page.locator('label[for="tf-team"]').click();
      await page.locator('#t-board-count').fill('2');
      await page.locator('#t-team-rounds').fill('2');
      await page.locator('#modal-tournament-confirm').click();
      const card = page.locator('.tournament-card', { hasText: 'Đại Chiến Hội Quán' });
      await card.waitFor();
      const tid = await card.getAttribute('data-tournament-id');
      const TURL = base + '/tournament.html?id=' + encodeURIComponent(tid);
      for (const cap of [P.trucmai.page, P.baonam.page]) {
        await cap.goto(TURL);
        const boxes = cap.locator('#team-member-list input[type="checkbox"]');
        await boxes.first().waitFor();
        await boxes.nth(0).check(); await boxes.nth(1).check();
        if (mode === 'en' && cap === page) await shoot(page, 'en-team-roster');
        await cap.locator('#btn-submit-team-roster').click();
        await cap.locator('#team-registered-panel .team-club-tag, #team-registered-panel').first().waitFor();
      }
      await page.goto(TURL);
      await page.locator('#btn-start-team-tournament').click();
      await page.locator('#team-scoreboard').waitFor();

      const cardWith = (pg, action) => pg.locator('.pairing-card').filter({ has: pg.locator(`[data-action="${action}"]`) }).first();
      const score = async (pg) => (await pg.locator('.team-scoreboard__center').innerText()).replace(/\s+/g, '');
      // a reports, b confirms, both ready, loser resigns; everyone returns to the tournament page.
      async function play(a, b, loser, { stopBeforeReady = false } = {}) {
        for (const x of [a, b]) await x.page.goto(TURL);
        await cardWith(a.page, 'report').locator('[data-action="report"]').click();
        const whenLocal = new Date(Date.now() + 600_000 - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
        await a.page.locator('#report-time-input').fill(whenLocal);
        await a.page.locator('#btn-submit-report-time').click();
        b.page.once('dialog', (d) => d.accept());
        await cardWith(b.page, 'confirm').locator('[data-action="confirm"]').click();
        await cardWith(a.page, 'ready').waitFor();
        if (stopBeforeReady) return;
        await ready(a, b, loser);
      }
      async function ready(a, b, loser) {
        await cardWith(a.page, 'ready').locator('[data-action="ready"]').click();
        await cardWith(b.page, 'ready').locator('[data-action="ready"]').click();
        await a.page.waitForURL((u) => u.pathname.includes('tournament-match.html'));
        await b.page.waitForURL((u) => u.pathname.includes('tournament-match.html'));
        await loser.page.locator('#btn-resign').waitFor();
        loser.page.once('dialog', (d) => d.accept());
        await loser.page.locator('#btn-resign').click();
        await (loser === a ? b : a).page.locator('#match-result-overlay.visible').waitFor();
        for (const x of [a, b]) await x.page.goto(TURL);
      }
      // Click a board cell twice (default click mode 'double' = preview then confirm).
      async function clickCell(pg, x, y) {
        await pg.waitForFunction(() => { const g = document.querySelector('#board-wrap svg')?.__gboard; return g && g.isMyTurn && g.interactive; });
        const pt = await pg.evaluate(([cx, cy]) => {
          const svg = document.querySelector('#board-wrap svg'); const g = svg.__gboard;
          const v = g._view(); const r = svg.getBoundingClientRect();
          return { x: r.left + (g._center(cx) - v.x) * r.width / v.w, y: r.top + (g._center(cy) - v.y) * r.height / v.h, n: g.boardSize };
        }, [x, y]);
        const hit = await pg.evaluate(([px, py]) => document.querySelector('#board-wrap svg').__gboard._cellFromClient(px, py), [pt.x, pt.y]);
        if (!hit || hit.x !== x || hit.y !== y) console.log('MISAIM', x, y, JSON.stringify(hit));
        await pg.mouse.click(pt.x, pt.y); await pg.waitForTimeout(150); await pg.mouse.click(pt.x, pt.y);
        for (let k = 0; k < 3; k++) {
          await pg.waitForTimeout(600);
          const st = await pg.evaluate(([cx, cy]) => { const g = document.querySelector('#board-wrap svg').__gboard; return { placed: !g._isEmpty({ x: cx, y: cy }), pend: g._pendingCell }; }, [x, y]);
          if (st.placed) break;
          console.log('RETRY click', x, y, JSON.stringify(st));
          await pg.mouse.click(pt.x, pt.y);
        }
        try { await pg.waitForFunction(([cx, cy]) => { const g = document.querySelector('#board-wrap svg').__gboard; return !g._isEmpty({ x: cx, y: cy }); }, [x, y]); }
        catch (e) { await pg.screenshot({ path: path.join(SHOTS, 'debug-click.png') }); console.log('DEBUG', JSON.stringify(pt), await pg.evaluate(() => { const g = document.querySelector('#board-wrap svg').__gboard; return JSON.stringify({ turn: g.isMyTurn, pend: g._pendingCell, mode: g.clickMode }); })); throw e; }
        return pt.n;
      }
      async function enterBoth(a, b) {
        await cardWith(a.page, 'ready').locator('[data-action="ready"]').click();
        await cardWith(b.page, 'ready').locator('[data-action="ready"]').click();
        await a.page.waitForURL((u) => u.pathname.includes('tournament-match.html'));
        await b.page.waitForURL((u) => u.pathname.includes('tournament-match.html'));
        await a.page.locator('#match-canvas, #board-wrap svg').first().waitFor();
        await b.page.locator('#board-wrap svg').waitFor();
        await a.page.waitForTimeout(1000); // .board-area-shell fadeUp (0.7 s + delay) moves the board 12 px
      }
      if (mode === 'e2e2') {
        const gamesOf = async () => (await (await page.request.get(base + '/api/tournaments/' + encodeURIComponent(tid) + '/games')).json().catch(() => null));
        // R1 B1: Trúc Mai (black) makes five in a row on row 7; Bảo Nam answers on row 9.
        await play(P.trucmai, P.baonam, null, { stopBeforeReady: true });
        await enterBoth(P.trucmai, P.baonam);
        const probe = async (pg, tag) => console.log('PROBE', tag, await pg.evaluate(() => { const svg = document.querySelector('#board-wrap svg'); const r = svg.getBoundingClientRect(); const p = svg.parentElement; const a = document.getElementById('board-area'); return JSON.stringify({ svg: [Math.round(r.left), Math.round(r.top), Math.round(r.width)], wrap: [p.clientWidth, p.clientHeight], area: a ? [a.clientWidth, a.clientHeight] : null }); }));
        for (let k = 0; k < 4; k++) { await probe(P.trucmai.page, 't' + k * 500); await P.trucmai.page.waitForTimeout(500); }
        if (process.env.PROBE_ONLY) {
          await P.trucmai.page.setViewportSize({ width: +(process.env.PROBE_W || 1366), height: +(process.env.PROBE_H || 900) }); await P.trucmai.page.waitForTimeout(500); await probe(P.trucmai.page, 'after-resize');
          await P.trucmai.page.reload(); await P.trucmai.page.waitForTimeout(1500); await probe(P.trucmai.page, 'after-reload');
          await P.trucmai.page.screenshot({ path: path.join(SHOTS, 'debug-after-reload.png') });
          const mob = P.baonam.page; await mob.setViewportSize({ width: 390, height: 844 }); await mob.reload(); await mob.waitForTimeout(1500); await probe(mob, 'mobile-reload');
          return;
        }
        let n;
        for (let i = 0; i < 5; i++) {
          n = await clickCell(P.trucmai.page, 3 + i, 7);
          if (i < 4) await clickCell(P.baonam.page, 3 + i, 9);
        }
        console.log('board size', n);
        await P.trucmai.page.locator('#match-result-overlay.visible').waitFor();
        await P.baonam.page.locator('#match-result-overlay.visible').waitFor();
        console.log('R1B1 overlay:', (await P.trucmai.page.locator('#match-result-overlay').innerText()).replace(/\s+/g, ' '));
        await P.trucmai.page.screenshot({ path: path.join(SHOTS, 'e2e2-five-win-desktop.png') });
        // R1 B2: Lan Anh (black) v Uyên Vy, 4 moves, Lan Anh offers a draw, Uyên Vy accepts.
        await play(P.lananh, P.uyenvy, null, { stopBeforeReady: true });
        await enterBoth(P.lananh, P.uyenvy);
        await clickCell(P.lananh.page, 8, 8); await clickCell(P.uyenvy.page, 9, 9);
        await clickCell(P.lananh.page, 8, 9); await clickCell(P.uyenvy.page, 9, 8);
        await P.lananh.page.locator('#btn-draw').click();
        await P.uyenvy.page.locator('#draw-accept-btn').click();
        await P.lananh.page.locator('#match-result-overlay.visible').waitFor();
        await P.uyenvy.page.locator('#match-result-overlay.visible').waitFor(); await P.uyenvy.page.waitForTimeout(500);
        console.log('R1B2 overlay:', (await P.uyenvy.page.locator('#match-result-overlay').innerText()).replace(/\s+/g, ' '));
        for (const x of Object.values(P)) await x.page.goto(TURL);
        await page.locator('#team-scoreboard').waitFor();
        console.log('after R1 score', await score(page));
        await shoot(page, 'e2e2-r1-done');
        // R2 B1: Bảo Nam (black) v Trúc Mai — restart the server mid-game (InProgress, 3 moves on board).
        await play(P.baonam, P.trucmai, null, { stopBeforeReady: true });
        await enterBoth(P.baonam, P.trucmai);
        await clickCell(P.baonam.page, 5, 5); await clickCell(P.trucmai.page, 6, 6); await clickCell(P.baonam.page, 5, 6);
        const pid = new URL(P.baonam.page.url()).searchParams.get('pairingId');
        await stopServer(); await startServer(); console.log('server restarted mid-game');
        for (const sec of [3, 12]) {
          await P.baonam.page.waitForTimeout(sec === 3 ? 3000 : 9000);
          const st = await P.trucmai.page.evaluate(() => { const g = document.querySelector('#board-wrap svg').__gboard; return { moves: document.querySelectorAll('#moves-list li:not(.moves__empty) span:not(.moves__n):not(:empty)').length, myTurn: g.isMyTurn, interactive: g.interactive, banner: document.getElementById('status-banner')?.innerText.trim(), overlay: document.getElementById('match-result-overlay').className, clocks: [...document.querySelectorAll('.seatcard__clock')].map((e) => e.innerText) }; });
          console.log('match page', sec + 's after restart (Trúc Mai):', JSON.stringify(st), 'url', P.trucmai.page.url().includes('tournament-match'));
        }
        await P.baonam.page.screenshot({ path: path.join(SHOTS, 'e2e2-match-after-restart-desktop.png') });
        console.log('match page after restart moves:', await P.baonam.page.locator('#moves-grid li:not(.moves__empty)').count(),
          'banner:', (await P.baonam.page.locator('#status-banner').innerText().catch(() => '')).trim());
        for (const x of Object.values(P)) await x.page.goto(TURL);
        await page.locator('#team-scoreboard').waitFor();
        const b1 = P.baonam.page.locator('.pairing-card').filter({ has: P.baonam.page.locator('[data-action="ready"]') });
        console.log('R2B1 card after restart:', (await b1.first().innerText()).replace(/\s+/g, ' '));
        await shoot(page, 'e2e2-after-midgame-restart');
        // Replay: both ready again; a fresh board; Trúc Mai resigns.
        await enterBoth(P.baonam, P.trucmai);
        console.log('replay board moves:', await P.baonam.page.locator('#moves-grid li:not(.moves__empty)').count(), 'pairing same:', new URL(P.baonam.page.url()).searchParams.get('pairingId') === pid);
        await clickCell(P.baonam.page, 7, 7);
        P.trucmai.page.once('dialog', (d) => d.accept());
        await P.trucmai.page.locator('#btn-resign').click();
        await P.baonam.page.locator('#match-result-overlay.visible').waitFor();
        // R2 B2: Uyên Vy (black) v Lan Anh, Lan Anh resigns.
        await play(P.uyenvy, P.lananh, P.lananh);
        for (const x of Object.values(P)) await x.page.goto(TURL);
        await page.locator('#team-scoreboard').waitFor();
        console.log('final score', await score(page));
        await shoot(page, 'e2e2-final-pairings');
        await page.locator('#sub-tab-standings').click();
        await page.locator('#team-standings-table').waitFor();
        console.log('final standings\n' + await page.locator('#team-standings-table').innerText());
        await shoot(page, 'e2e2-final-standings');
        await page.locator('#sub-tab-games').click();
        await page.waitForTimeout(800);
        console.log('games history\n' + (await page.locator('.sub-tab-panel.is-active').innerText()).slice(0, 900));
        await shoot(page, 'e2e2-final-games');
        const text = await page.locator('body').innerText();
        const VI = /[àáảãạăắằẳẵặâấầẩẫậđèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵ]/i;
        const names = /Kỳ Hội Mùa (Thu|Xuân)|Trúc Mai|Uyên Vy|Bảo Nam|Lan Anh|Đại Chiến Hội Quán|XUÂN|KỲ/g;
        console.log('EN finished screen: raw keys', JSON.stringify(text.match(/\b(tdetail|tournaments|err|history|game)\.[a-z_]+/g) || []),
          'diacritic lines (names removed):', JSON.stringify(text.split('\n').map((l) => l.replace(names, '')).filter((l) => VI.test(l))));
        // Sub-tabs at narrow widths on the real page (#464).
        await page.locator('#sub-tab-pairings').click();
        for (const [label, w, scale] of [['320', 320, null], ['390-fs130', 390, '1.3'], ['320-fs130', 320, '1.3']]) {
          await page.setViewportSize({ width: w, height: 844 });
          await page.evaluate((sc) => { if (sc) document.documentElement.style.setProperty('--fs-scale', sc); else document.documentElement.style.removeProperty('--fs-scale'); }, scale);
          await page.locator('.sub-tabs').scrollIntoViewIfNeeded();
          const m = await page.evaluate(() => {
            const st = document.querySelector('.sub-tabs');
            return { strip: [st.scrollWidth, st.clientWidth], page: [document.documentElement.scrollWidth, innerWidth],
              heights: [...st.querySelectorAll('.sub-tabs__btn')].map((b) => Math.round(b.getBoundingClientRect().height)),
              lines: [...st.querySelectorAll('.sub-tabs__btn span')].map((s) => s.getClientRects().length) };
          });
          console.log('subtabs', label, JSON.stringify(m));
          await page.screenshot({ path: path.join(SHOTS, 'e2e2-subtabs-' + label + '.png'), animations: 'disabled' });
          if (m.strip[0] > m.strip[1]) {
            await page.evaluate(() => { document.querySelector('.sub-tabs').scrollLeft = 9999; });
            await page.screenshot({ path: path.join(SHOTS, 'e2e2-subtabs-' + label + '-scrolled.png'), animations: 'disabled' });
          }
        }
        console.log('games api', JSON.stringify(await gamesOf()).slice(0, 600));
      } else {
      // Round 1: B1 trucmai(black) v baonam, B2 lananh(black) v uyenvy.
      await play(P.trucmai, P.baonam, P.baonam);
      if (mode === 'en') {
        await page.goto(TURL); await page.locator('#team-scoreboard').waitFor();
        await shoot(page, 'en-team-boards');
        await page.locator('#sub-tab-standings').click();
        await page.locator('#team-standings-table').waitFor();
        await shoot(page, 'en-team-standings');
        const text = await page.locator('main, body').first().innerText();
        const rawKeys = text.match(/\b(tdetail|tournaments|err)\.[a-z_]+/g) || [];
        const viWords = (text.match(/\b(Bàn|Vòng|Cặp đấu|Bảng xếp hạng|Lịch sử|hội nhóm|thắng|hòa|thua|Đấu đội|Đang diễn ra|Quản lý)\b/g) || []);
        console.log('EN raw keys:', JSON.stringify(rawKeys), 'vi words:', JSON.stringify(viWords));
      } else {
        await play(P.uyenvy, P.lananh, P.lananh);
        await page.goto(TURL); await page.locator('#team-scoreboard').waitFor();
        console.log('after R1 score', await score(page));
        await shoot(page, 'e2e-r1-done');
        // Round 2 colours swap: B1 baonam(black) v trucmai, B2 uyenvy(black) v lananh.
        await play(P.baonam, P.trucmai, P.trucmai);
        await play(P.uyenvy, P.lananh, P.lananh, { stopBeforeReady: true });
        await page.goto(TURL); await page.locator('#team-scoreboard').waitFor();
        const before = { score: await score(page), html: await page.locator('#pairings-list, .sub-tab-panel.is-active').first().innerText() };
        console.log('before restart score', before.score);
        await stopServer();
        await startServer();
        console.log('server restarted');
        for (const x of Object.values(P)) await x.page.goto(TURL);
        await page.locator('#team-scoreboard').waitFor();
        const after = { score: await score(page), html: await page.locator('#pairings-list, .sub-tab-panel.is-active').first().innerText() };
        console.log('after restart score', after.score, 'pairings text equal:', before.html === after.html);
        if (before.html !== after.html) console.log('BEFORE\n' + before.html + '\nAFTER\n' + after.html);
        await shoot(page, 'e2e-after-restart');
        await ready(P.uyenvy, P.lananh, P.lananh);
        await page.goto(TURL); await page.locator('#team-scoreboard').waitFor();
        console.log('final score', await score(page));
        await page.locator('#sub-tab-standings').click();
        await page.locator('#team-standings-table').waitFor();
        console.log('final standings\n' + await page.locator('#team-standings-table').innerText());
        await shoot(page, 'e2e-final-standings');
        const t = await (await page.request.get(base + '/api/tournaments/' + encodeURIComponent(tid))).json().catch(() => null);
        console.log('api status', t && (t.status || (t.tournament && t.tournament.status)));
      }
      }
    } else throw new Error('mode?');
  } finally {
    try { if (browser) await browser.close(); } finally { app.kill('SIGTERM'); }
  }
}
run().catch((e) => { console.error(e); process.exitCode = 1; });
