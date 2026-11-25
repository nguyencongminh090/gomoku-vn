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
    const slice = process.argv[2];
    if (slice === 'commands') {
      await input.fill('/help');
      await input.press('Enter');
      await page.locator('#cb-chat-hints').getByText('/ghim', { exact: true }).waitFor();
      await shoot('commands');
      await input.fill('/announce Hẹn gặp cả nhóm tối nay');
      await input.press('Enter');
      await page.locator('#cb-chat-log').getByText('Hẹn gặp cả nhóm tối nay').waitFor();
    } else throw new Error('Unknown slice');
  } finally {
    try { if (browser) await browser.close(); } finally { app.kill('SIGTERM'); }
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
