// Tiles v2 mockups (2026-11-13): phone placements for Học / Diễn đàn / Giải đấu / Hội nhóm.
// Patches the REAL home in the browser. Needs: PORT=3101 GOMOKU_DB_PATH=<scratch>/x.db node server/index.js
const path = require('path');
const { chromium } = require('playwright');
const B = 'http://localhost:3101';
const OUT = path.join(__dirname, 'shots');
const ICON = (n) => `<svg class="icon" aria-hidden="true"><use href="assets/icons/phosphor-sprite.svg#ph-regular-${n}"></use></svg>`;
const LINKS = [['target', 'Học'], ['chat-circle', 'Diễn đàn'], ['trophy', 'Giải đấu'], ['users-three', 'Hội nhóm']];
const HIDE = '@media (max-width:860px){ body.zen-lobby .hq-tiles{display:none!important} }';
const nav = (cls, links, icon, label = true) => `<nav class="${cls}" aria-label="Khám phá">${links.map(([i, l]) => `<a href="#" aria-label="${l}">${icon[i]}${label ? `<span>${l}</span>` : ''}</a>`).join('')}</nav>`;
const after = (html) => { document.querySelector('.hq-tiles').insertAdjacentHTML('afterend', html); };

const C_CSS = `@media (max-width:860px){
    .mk-c{margin-top:22px;display:grid;grid-template-columns:repeat(4,1fr);padding:8px 4px;border-radius:16px;background:var(--c-surface);border:1px solid var(--c-border);box-shadow:var(--shadow-card)}
    .mk-c a{display:grid;justify-items:center;gap:6px;padding:10px 0;color:var(--c-ink);text-decoration:none;font-size:var(--text-sm);font-weight:800}
    .mk-c a + a{border-left:1px solid var(--c-border)}
    .mk-c a .icon{width:26px;height:26px;color:var(--c-brand-text)} }`;
const MOCKS = {
  '0-hien-tai': { css: '', js: () => {} },
  // A: icon-only, 4 round buttons on one row after the code (labels only for screen readers + long-press title).
  'a-icon-only': { css: HIDE + `@media (max-width:860px){
    .mk-a{display:flex;justify-content:space-between;margin-top:24px;padding:0 6px}
    .mk-a a{display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:50%;background:var(--c-surface);border:1px solid var(--c-border);color:var(--c-brand-text)}
    .mk-a .icon{width:26px;height:26px} }`,
    js: ({ links, icon }) => { document.querySelector('.hq-tiles').insertAdjacentHTML('afterend', `<nav class="mk-a" aria-label="Khám phá">${links.map(([i, l]) => `<a href="#" aria-label="${l}" title="${l}">${icon[i]}</a>`).join('')}</nav>`); } },
  // B: app-dock row — icon in a soft square + short caption under it, no card; hairline above.
  'b-dock': { css: HIDE + `@media (max-width:860px){
    .mk-b{display:grid;grid-template-columns:repeat(4,1fr);margin-top:22px;padding-top:14px;border-top:1px solid var(--c-border)}
    .mk-b a{display:grid;justify-items:center;gap:6px;padding:6px 0;color:var(--c-ink-2);text-decoration:none;font-size:var(--text-sm);font-weight:700}
    .mk-b a .icon{box-sizing:content-box;width:24px;height:24px;padding:12px;border-radius:16px;background:var(--c-fill);color:var(--c-brand-text)} }`,
    js: ({ links, icon }) => { document.querySelector('.hq-tiles').insertAdjacentHTML('afterend', `<nav class="mk-b" aria-label="Khám phá">${links.map(([i, l]) => `<a href="#">${icon[i]}<span>${l}</span></a>`).join('')}</nav>`); } },
  // C: one card "Khám phá" holding 4 columns — same card family as the two count cards, same 14px gap.
  'c-one-card': { css: HIDE + `@media (max-width:860px){
    .mk-c{margin-top:22px;display:grid;grid-template-columns:repeat(4,1fr);padding:8px 4px;border-radius:16px;background:var(--c-surface);border:1px solid var(--c-border);box-shadow:var(--shadow-card)}
    .mk-c a{display:grid;justify-items:center;gap:6px;padding:10px 0;border-radius:12px;color:var(--c-ink);text-decoration:none;font-size:var(--text-sm);font-weight:800}
    .mk-c a + a{border-left:1px solid var(--c-border);border-radius:0}
    .mk-c a .icon{width:26px;height:26px;color:var(--c-brand-text)} }`,
    js: ({ links, icon }) => { document.querySelector('.hq-tiles').insertAdjacentHTML('afterend', `<nav class="mk-c" aria-label="Khám phá">${links.map(([i, l]) => `<a href="#">${icon[i]}<span>${l}</span></a>`).join('')}</nav>`); } },
  // D: icon-only back in the greeting row (= desktop), phone-sized 44px; tiles removed.
  'd-icons-top': { css: HIDE + `@media (max-width:860px){
    body.zen-lobby .hq-hello .hub-more{display:flex!important;gap:2px} body.zen-lobby .hub-ico{width:44px;height:44px} }`,
    js: () => {} },
  // E: two cards of ONE family — "Đang diễn ra" (both counts split by a divider) + "Khám phá" (4 columns); same width, radius, gap.
  'e-two-panels': { css: HIDE + C_CSS + `@media (max-width:860px){
    body.zen-lobby .hq-side{grid-template-columns:1fr!important;gap:0;padding:0;border-radius:16px;background:var(--c-surface);border:1px solid var(--c-border);box-shadow:var(--shadow-card);overflow:hidden}
    body.zen-lobby .hq-side{display:grid!important;grid-template-columns:1fr 1fr!important}
    body.zen-lobby .hq-side .hq-card{border:0;box-shadow:none;border-radius:0;background:none}
    body.zen-lobby .hq-side .hq-card + .hq-card{border-left:1px solid var(--c-border)}
    .mk-c{margin-top:0} body.zen-lobby .hq > .hq-main{order:2} .mk-c-wrap{order:5} body.zen-lobby .hq>.hq-side{order:4} }`,
    js: ({ links, icon }) => { const sec = document.getElementById('screen-home'); sec.insertAdjacentHTML('beforeend', `<div class="mk-c-wrap"><nav class="mk-c" aria-label="Khám phá">${links.map(([i, l]) => `<a href="#">${icon[i]}<span>${l}</span></a>`).join('')}</nav></div>`); } },
  // F: counts leave the cards and become a status line under the two play buttons (they describe Chơi nhanh); one "Khám phá" card below.
  'f-status-line': { css: HIDE + C_CSS + `@media (max-width:860px){
    body.zen-lobby .hq-side{display:none!important}
    .mk-f{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;margin:12px 4px 0;font-size:var(--text-sm);color:var(--c-ink-2)}
    .mk-f b{font-size:var(--text-md);font-weight:900;color:var(--c-ink);font-variant-numeric:tabular-nums}
    .mk-f .dot{width:8px;height:8px;border-radius:50%;background:var(--c-state-playing)} .mk-f .sep{width:1px;height:14px;background:var(--c-border)} }`,
    js: ({ links, icon }) => { const n1 = document.getElementById('home-n-search').textContent.replace('–', '0'), n2 = document.getElementById('home-n-live').textContent.replace('–', '0');
      document.querySelector('.hq-go').insertAdjacentHTML('afterend', `<p class="mk-f"><span class="dot"></span><span><b>${n1}</b> người đang tìm trận</span><span class="sep"></span><span><b>${n2}</b> ván đang chơi</span></p>`);
      document.querySelector('.hq-tiles').insertAdjacentHTML('afterend', `<nav class="mk-c" aria-label="Khám phá">${links.map(([i, l]) => `<a href="#">${icon[i]}<span>${l}</span></a>`).join('')}</nav>`); } },
  // G: labelled sections in the same eyebrow style as "HOẶC VÀO PHÒNG BẰNG MÃ": KHÁM PHÁ (dock row) then ĐANG DIỄN RA (one split card).
  'g-sections': { css: HIDE + `@media (max-width:860px){
    .mk-h{display:flex;align-items:center;gap:14px;margin:22px 0 12px;font-size:var(--text-sm);font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--c-ink-2)}
    .mk-h::after{content:'';flex:1;height:1px;background:var(--c-border)}
    .mk-g{display:grid;grid-template-columns:repeat(4,1fr)}
    .mk-g a{display:grid;justify-items:center;gap:6px;padding:4px 0;color:var(--c-ink);text-decoration:none;font-size:var(--text-sm);font-weight:700}
    .mk-g a .icon{box-sizing:content-box;width:24px;height:24px;padding:14px;border-radius:50%;background:var(--c-surface);border:1px solid var(--c-border);color:var(--c-brand-text)}
    body.zen-lobby .hq-side{display:grid!important;grid-template-columns:1fr 1fr!important;gap:0;border-radius:16px;background:var(--c-surface);border:1px solid var(--c-border);box-shadow:var(--shadow-card);overflow:hidden}
    body.zen-lobby .hq-side .hq-card{border:0;box-shadow:none;border-radius:0;background:none}
    body.zen-lobby .hq-side .hq-card + .hq-card{border-left:1px solid var(--c-border)}
    body.zen-lobby .hq-side .hq-card__h{font-size:var(--text-xs)} body.zen-lobby .hq{gap:0} }`,
    js: ({ links, icon }) => { document.querySelector('.hq-tiles').insertAdjacentHTML('afterend', `<p class="mk-h">Khám phá</p><nav class="mk-g" aria-label="Khám phá">${links.map(([i, l]) => `<a href="#">${icon[i]}<span>${l}</span></a>`).join('')}</nav><p class="mk-h">Đang diễn ra</p>`);
      const h = document.querySelectorAll('.mk-h')[1]; document.querySelector('.hq-main').appendChild(h); document.querySelector('.hq-main').appendChild(document.getElementById('home-stats')); } },
  // H: hybrid per the 2026-11-13 review — G's labelled sections, E's compact split card; ĐANG DIỄN RA before KHÁM PHÁ; tighter rhythm.
  'h-hybrid': { css: HIDE + `@media (max-width:860px){
    .mk-h{display:flex;align-items:center;gap:14px;margin:22px 0 10px;font-size:var(--text-sm);font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--c-ink-2)}
    .mk-h::after{content:'';flex:1;height:1px;background:var(--c-border)}
    .mk-g{display:grid;grid-template-columns:repeat(4,1fr)}
    .mk-g a{display:grid;justify-items:center;gap:6px;min-height:76px;padding:4px 0;border-radius:14px;color:var(--c-ink);text-decoration:none;font-size:var(--text-sm);font-weight:700}
    .mk-g a:active{background:var(--c-fill)}
    .mk-g a .icon{box-sizing:content-box;width:24px;height:24px;padding:12px;border-radius:50%;background:var(--c-surface);border:1px solid var(--c-border);color:var(--c-brand-text)}
    body.zen-lobby .hq-side{display:grid!important;grid-template-columns:1fr 1fr!important;gap:0;padding:0;border-radius:16px;background:var(--c-surface);border:1px solid var(--c-border);box-shadow:var(--shadow-card);overflow:hidden}
    body.zen-lobby .hq-side .hq-card{gap:6px;padding:12px 14px;border:0;box-shadow:none;border-radius:0;background:none}
    body.zen-lobby .hq-side .hq-card + .hq-card{border-left:1px solid var(--c-border)}
    body.zen-lobby .hq-side .hq-card__h{font-size:var(--text-xs)} body.zen-lobby .hq-num b{font-size:26px}
    body.zen-lobby .hq{gap:0} body.zen-lobby .hq-or{margin-top:20px} }`,
    js: ({ links, icon }) => { const main = document.querySelector('.hq-main');
      main.insertAdjacentHTML('beforeend', '<p class="mk-h">Đang diễn ra</p>'); main.appendChild(document.getElementById('home-stats'));
      main.insertAdjacentHTML('beforeend', `<p class="mk-h">Khám phá</p><nav class="mk-g" aria-label="Khám phá">${links.map(([i, l]) => `<a href="#">${icon[i]}<span>${l}</span></a>`).join('')}</nav>`); } },
};

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.HOME + '/.local/share/ms-playwright/chromium-1243/chrome-linux64/chrome' });
  const ctx = await browser.newContext({ locale: 'vi-VN', deviceScaleFactor: 2 });
  const u = 'mk' + Date.now().toString(36);
  const r = await ctx.request.post(B + '/api/auth/register', { data: { username: u, password: 'Passw0rd!x', displayName: 'minhcaro' }, headers: { origin: B } });
  const j = await r.json();
  await ctx.addInitScript((usr) => { localStorage.setItem('gvn_user', JSON.stringify(usr)); localStorage.removeItem('gvn_quickmatch'); }, { userId: j.user.userId, displayName: 'minhcaro', isGuest: false });
  const page = await ctx.newPage();
  const icon = Object.fromEntries(['target', 'chat-circle', 'trophy', 'users-three'].map((n) => [n, ICON(n)]));
  for (const [id, m] of Object.entries(MOCKS).filter(([k]) => !process.env.ONLY || process.env.ONLY.split(',').includes(k))) for (const mode of ['light', 'dark']) {
    await page.setViewportSize({ width: 390, height: +(process.env.H || 844) });
    await page.addInitScript((md) => localStorage.setItem('gvn_color_mode', md), mode);
    await page.goto(B + '/index.html'); await page.waitForTimeout(1200);
    await page.addStyleTag({ content: m.css + 'body.zen-lobby .hq>*{animation:none!important}' });
    await page.evaluate(m.js, { links: LINKS, icon });
    await page.waitForTimeout(300);
    const name = `${id}-${mode}.png`;
    await page.screenshot({ path: path.join(OUT, name), fullPage: !process.env.H });
    process.stdout.write(name + ' ');
  }
  await browser.close();
})();
