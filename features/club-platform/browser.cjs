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
    } else throw new Error('Unknown slice');
  } finally {
    try { if (browser) await browser.close(); } finally { app.kill('SIGTERM'); }
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
