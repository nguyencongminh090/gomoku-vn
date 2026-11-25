'use strict';
// One-off verification for #465/#466/#467 (2026-11-25). Run from the repo root:
// PLAYWRIGHT_BROWSERS_PATH=... node features/club-platform/verify.cjs <light|en|e2e>  (temp GOMOKU_DB_PATH)
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
    } else if (mode === 'en' || mode === 'e2e') {
      const init = mode === 'en' ? english : null;
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
    } else throw new Error('mode?');
  } finally {
    try { if (browser) await browser.close(); } finally { app.kill('SIGTERM'); }
  }
}
run().catch((e) => { console.error(e); process.exitCode = 1; });
