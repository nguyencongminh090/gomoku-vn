'use strict';

const { chromium } = require('@playwright/test');
const { spawn } = require('node:child_process');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const net = require('node:net');

async function run() {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const dir = mkdtempSync(path.join(tmpdir(), 'club-platform-'));
  const base = 'http://127.0.0.1:' + port;
  const app = spawn(process.execPath, ['server/index.js'], { env: { ...process.env,
    NODE_ENV: 'test', PORT: String(port), LISTEN_HOST: '127.0.0.1', JWT_SECRET: randomBytes(48).toString('hex'),
    GOMOKU_DB_PATH: path.join(dir, 'browser.db') }, stdio: ['ignore', 'pipe', 'inherit'] });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Server startup timeout')), 15000);
      app.stdout.on('data', (d) => { if (d.toString().includes('listening on')) { clearTimeout(timer); resolve(); } });
      app.once('exit', () => { clearTimeout(timer); reject(new Error('Server exited')); });
    });
    browser = await chromium.launch({ executablePath: process.env.CHROME || path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium-1243/chrome-linux64/chrome') });
    const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
    page.setDefaultTimeout(8000);
    const credentials = { username: 'trucmai', password: 'local-qa-123', displayName: 'Trúc Mai' };
    assert.ok((await page.request.post(base + '/api/auth/register', { data: credentials })).ok());
    await page.goto(base + '/login.html');
    await page.locator('#login-username').fill(credentials.username);
    await page.locator('#login-password').fill(credentials.password);
    await page.locator('#btn-login').click();
    await page.waitForURL((url) => !url.pathname.includes('login'));
    const result = await page.request.post(base + '/api/clubs', { data: { name: 'Kỳ Hội Mùa Thu', joinPolicy: 'open' } });
    const club = await result.json();
    assert.ok(result.ok(), JSON.stringify(club));
    await page.goto(base + '/c/' + club.slug);
    const input = page.locator('#cb-chat-input');
    async function shoot(name) {
      for (const [device,width,height] of [['desktop',1365,900],['mobile',390,844]]) {
        await page.setViewportSize({ width, height });
        await page.screenshot({ path: path.join(__dirname, 'screenshots', name + '-' + device + '.png') });
      }
      await page.setViewportSize({ width: 1365, height: 900 });
    }
    async function joinMember(username, displayName) {
      const member = await browser.newContext();
      const created = await member.request.post(base + '/api/auth/register', { data: { ...credentials, username, displayName } });
      assert.ok(created.ok(), await created.text());
      const joined = await member.request.post(base + '/api/clubs/' + club.slug + '/join');
      assert.ok(joined.ok(), await joined.text());
      return member;
    }
    const slice = process.argv[2];
    if (slice === 'commands') {
      await input.fill('/help');
      await input.press('Enter');
      await page.locator('#cb-chat-hints').getByText('/ghim', { exact: true }).waitFor();
      await shoot('commands');
      await input.fill('/announce Hẹn gặp cả nhóm tối nay');
      await input.press('Enter');
      await page.locator('#cb-chat-log').getByText('Hẹn gặp cả nhóm tối nay').waitFor();
    } else if (slice === 'forms') {
      await input.fill('/poll Họp ngày nào? | Thứ bảy | Chủ nhật');
      await input.press('Enter');
      await page.locator('#cb-add-option').click();
      await page.locator('#cb-options input').last().fill('Thứ hai');
      await shoot('poll-form');
      await page.locator('#cb-poll-form [type=submit]').click();
      await page.locator('#cb-chat-log').getByText('Họp ngày nào?', { exact: true }).waitFor();
      await input.fill('/calendar 25/12 20:00 Giao lưu cuối năm');
      await input.press('Enter');
      await page.locator('#cb-event-preview').getByText(/Giao lưu cuối năm/).waitFor();
      await shoot('event-form');
      await page.locator('#cb-event-form [type=submit]').click();
      await page.locator('#cb-events').getByText('Giao lưu cuối năm').waitFor();
    } else if (slice === 'moderation') {
      const member = await joinMember('hoamai', 'Hoa Mai');
      await page.reload();
      await page.locator('#cb-ch-members').click();
      await page.locator('#cb-member-search').fill('hoa');
      await page.locator('#cb-members-body input').check();
      page.once('dialog', (dialog) => dialog.accept());
      await page.locator('#cb-bulk button').click();
      await page.locator('#cb-sanctions').getByText(/hoamai/).waitFor();
      await shoot('moderation');
      assert.equal((await member.request.post(base + '/api/clubs/' + club.slug + '/messages', { data: { text: 'xin chào' } })).status(), 403);
      await page.locator('#cb-ch-log').click();
      await page.locator('#cb-log-search').fill('mute');
      await page.locator('#cb-history').getByText(/Hoa Mai/).waitFor();
      await shoot('moderation-log');
    } else if (slice === 'mentions') {
      const member = await joinMember('hoamai', 'Hoa Mai');
      await page.reload();
      await input.fill('Mời @hoa');
      await page.getByRole('option').getByText('@hoamai').waitFor();
      await shoot('mentions');
      await input.press('Tab');
      assert.equal(await input.inputValue(), 'Mời @hoamai ');
      await input.press('Enter');
      const sent = await member.request.post(base + '/api/clubs/' + club.slug + '/messages', { data: { text: 'Chào @officers' } });
      assert.ok(sent.ok());
      await page.reload();
      await page.locator('.is-mentioned').getByText('@officers').waitFor();
      await shoot('mention-received');
    } else if (slice === 'admin') {
      const member = await joinMember('hoamai', 'Hoa Mai');
      await member.request.post(base + '/api/clubs/' + club.slug + '/messages', { data: { text: 'Tin cần xem xét' } });
      await page.reload();
      page.once('dialog', (dialog) => dialog.accept('Nội dung không phù hợp'));
      await page.getByRole('button', { name: 'Báo cáo tin nhắn' }).first().click();
      await page.getByText('Đã gửi báo cáo.').waitFor();
      const db = require('better-sqlite3')(path.join(dir, 'browser.db'), { fileMustExist: true });
      db.prepare("UPDATE users SET role='admin' WHERE username=?").run(credentials.username);
      db.close();
      await page.goto(base + '/admin#clubs');
      await page.locator('#ac-reports').getByText(/Tin cần xem xét/).waitFor();
      await shoot('admin-reports');
      page.once('dialog', (dialog) => dialog.accept());
      await page.getByRole('button', { name: 'Gỡ tin bị báo cáo' }).click();
      await page.locator('#ac-detail h2').waitFor();
      await shoot('admin-club');
      page.once('dialog', (dialog) => dialog.accept());
      await page.getByRole('button', { name: 'Khóa nhóm', exact: true }).click();
      await page.getByRole('button', { name: 'Mở khóa', exact: true }).waitFor();
      assert.equal((await member.request.post(base + '/api/clubs/' + club.slug + '/messages', { data: { text: 'hi' } })).status(), 403);
    } else if (slice === 'activity') {
      await joinMember('hoamai', 'Hoa Mai');
      const db = require('better-sqlite3')(path.join(dir, 'browser.db'), { fileMustExist: true });
      const a = db.prepare('SELECT id FROM users WHERE username=?').get(credentials.username).id;
      const b = db.prepare("SELECT id FROM users WHERE username='hoamai'").get().id;
      const when = new Date().toISOString();
      db.prepare(`INSERT INTO games (id,room_id,black_player_id,white_player_id,black_player_name,white_player_name,winner,winner_color,board_size,started_at,ended_at)
        VALUES ('demo','test',?,?,'Trúc Mai','Hoa Mai',?,'BLACK',15,?,?)`).run(a,b,a,when,when);
      db.close();
      await page.reload();
      await page.locator('#cb-ch-board').click();
      await page.locator('#cb-recent').getByText('Trúc Mai – Hoa Mai').waitFor();
      await page.locator('#cb-activity').scrollIntoViewIfNeeded();
      await shoot('activity');
    } else if (slice === 'team') {
      // 'trucmai' < 'uyenvy' alphabetically so Trúc Mai sits on Board 1 against Bảo Nam ('baonam' < 'lananh').
      const m1 = await joinMember('uyenvy', 'Uyên Vy');
      void m1;
      // Second club led by Bảo Nam with member Lan Anh
      const cap2Ctx = await browser.newContext({ viewport: { width: 1365, height: 900 } });
      assert.ok((await cap2Ctx.request.post(base + '/api/auth/register', { data: { ...credentials, username: 'baonam', displayName: 'Bảo Nam' } })).ok());
      const c2Res = await cap2Ctx.request.post(base + '/api/clubs', { data: { name: 'Kỳ Hội Mùa Xuân', joinPolicy: 'open', tag: 'XUÂN', color: 'teal' } });
      const club2 = await c2Res.json();
      assert.ok(c2Res.ok(), JSON.stringify(club2));
      const m2Ctx = await browser.newContext();
      assert.ok((await m2Ctx.request.post(base + '/api/auth/register', { data: { ...credentials, username: 'lananh', displayName: 'Lan Anh' } })).ok());
      assert.ok((await m2Ctx.request.post(base + '/api/clubs/' + club2.slug + '/join')).ok());

      // Create team tournament from Club 1's giải-đấu channel via the existing organizer workflow
      await page.reload();
      await page.locator('#cb-ch-tournaments').click();
      await page.locator('#cb-tournament-new').click();
      await page.waitForURL((url) => url.pathname.includes('index.html'));
      await page.locator('#modal-create-tournament.visible').waitFor();
      await page.locator('#tournament-name').fill('Đại Chiến Hội Quán');
      await page.locator('label[for="tf-team"]').click();
      await page.locator('#t-board-count').fill('2');
      await page.locator('#t-team-rounds').fill('2');
      await page.locator('#modal-tournament-confirm').click();

      const card = page.locator('.tournament-card', { hasText: 'Đại Chiến Hội Quán' });
      await card.waitFor();
      const tid = await card.getAttribute('data-tournament-id');
      assert.ok(tid);

      // Captain 1 selects Club 1's 2-board roster on tournament.html
      await page.goto(base + '/tournament.html?id=' + encodeURIComponent(tid));
      await page.locator('#team-member-list input[type="checkbox"]').first().waitFor();
      const boxes1 = page.locator('#team-member-list input[type="checkbox"]');
      await boxes1.nth(0).check();
      await boxes1.nth(1).check();
      await shoot('team-roster');
      await page.locator('#btn-submit-team-roster').click();
      await page.locator('#team-registered-panel').getByText('Kỳ Hội Mùa Thu').waitFor();

      // Captain 2 logs in via real UI and registers Club 2's roster
      const cap2Page = await cap2Ctx.newPage();
      cap2Page.setDefaultTimeout(8000);
      await cap2Page.goto(base + '/login.html');
      await cap2Page.locator('#login-username').fill('baonam');
      await cap2Page.locator('#login-password').fill(credentials.password);
      await cap2Page.locator('#btn-login').click();
      await cap2Page.waitForURL((url) => !url.pathname.includes('login'));
      await cap2Page.goto(base + '/tournament.html?id=' + encodeURIComponent(tid));
      await cap2Page.locator('#team-member-list input[type="checkbox"]').first().waitFor();
      await cap2Page.locator('#team-member-list input[type="checkbox"]').nth(0).check();
      await cap2Page.locator('#team-member-list input[type="checkbox"]').nth(1).check();
      await cap2Page.locator('#btn-submit-team-roster').click();
      await cap2Page.locator('#team-registered-panel').getByText('Kỳ Hội Mùa Xuân').waitFor();

      // Organizer starts the team tournament and plays Board 1 to completion
      await page.locator('#btn-start-team-tournament').waitFor();
      await page.locator('#btn-start-team-tournament').click();
      await page.locator('#team-scoreboard').waitFor();
      await page.locator('.pairing-card__board', { hasText: 'Bàn 1' }).waitFor();

      // Check-in and play Board 1 (Trúc Mai vs Bảo Nam) through real PairingLifecycle + TournamentMatchHandler
      await page.locator('.pairing-card', { hasText: 'Bàn 1' }).locator('[data-action="report"]').click();
      const whenLocal = new Date(Date.now() + 600_000 - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
      await page.locator('#report-time-input').fill(whenLocal);
      await page.locator('#btn-submit-report-time').click();

      cap2Page.once('dialog', (d) => d.accept());
      const cap2Board1 = cap2Page.locator('.pairing-card', { hasText: 'Bàn 1' });
      await cap2Board1.locator('[data-action="confirm"]').waitFor();
      await cap2Board1.locator('[data-action="confirm"]').click();

      await page.locator('.pairing-card', { hasText: 'Bàn 1' }).locator('[data-action="ready"]').waitFor();
      await page.locator('.pairing-card', { hasText: 'Bàn 1' }).locator('[data-action="ready"]').click();
      await cap2Board1.locator('[data-action="ready"]').waitFor();
      await cap2Board1.locator('[data-action="ready"]').click();

      // Both players auto-enter tournament-match.html; Bảo Nam resigns so Kỳ Hội Mùa Thu scores 1 point
      await page.waitForURL((url) => url.pathname.includes('tournament-match.html'));
      await cap2Page.waitForURL((url) => url.pathname.includes('tournament-match.html'));
      await cap2Page.locator('#btn-resign').waitFor();
      cap2Page.once('dialog', (d) => d.accept());
      await cap2Page.locator('#btn-resign').click();
      await page.locator('#match-result-overlay.visible').waitFor();

      // Verify Team Standings and Individual Boards on tournament.html
      await page.goto(base + '/tournament.html?id=' + encodeURIComponent(tid));
      await page.locator('#team-scoreboard').waitFor();
      await shoot('team-boards');
      await page.locator('#sub-tab-standings').click();
      await page.locator('#team-standings-table').getByText('Kỳ Hội Mùa Thu').waitFor();
      await shoot('team-standings');

      // Verify BOTH clubs list the event in "Giải của CLB" (giải-đấu channel)
      await page.goto(base + '/c/' + club2.slug + '#ch=tournaments');
      await page.locator('#cb-tournaments').getByText('Đại Chiến Hội Quán').waitFor();
      await page.locator('#cb-tournaments').getByText('Kỳ Hội Mùa Thu đấu Kỳ Hội Mùa Xuân').waitFor();
      await shoot('team-club-channel');

      await cap2Ctx.close();
      await m2Ctx.close();
    } else throw new Error('Unknown slice');
  } finally {
    try { if (browser) await browser.close(); } finally { app.kill('SIGTERM'); }
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
