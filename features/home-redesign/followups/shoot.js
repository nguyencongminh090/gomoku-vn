// #360 / #361 mockups: each one patches the REAL built M4 home (ui/home-sentence) in the browser, then screenshots.
// Needs an isolated server: PORT=3101 GOMOKU_DB_PATH=<scratch>/x.db node server/index.js
// Usage: node features/home-redesign/followups/shoot.js
const path = require('path');
const { chromium } = require('playwright');
const B = 'http://localhost:3101';
const OUT = path.join(__dirname, 'shots');

const ICON = (n) => `<svg class="icon" aria-hidden="true"><use href="assets/icons/phosphor-sprite.svg#ph-regular-${n}"></use></svg>`;
const LINKS = [['target', 'Học'], ['chat-circle', 'Diễn đàn'], ['trophy', 'Giải đấu'], ['users-three', 'Hội nhóm']];
const PEOPLE = [['Lan Anh', 'Bạn bè', 1712, true], ['quang.dv', 'Bạn bè', 1655, true], ['Khánh Linh', 'Đang online', 1820, false], ['tuan_caro', 'Đang online', 1540, false], ['Hà Mi', 'Đang online', 1498, false]];

// Each mockup = { css, js(args) run in the page }. js gets { ICON-html map, LINKS, PEOPLE }.
const MOCKS = {
  // ── #360: where the 4 secondary links go on phones ──
  'n1-bottom-row': { w: [375], css: `
    @media (max-width:860px){ body.zen-lobby .hq-hello .hub-more{display:none} .mk-more{order:5;display:grid;grid-template-columns:repeat(4,1fr);gap:4px;padding:8px 0 4px;border-top:1px solid var(--c-border)}
    .mk-more a{display:grid;justify-items:center;gap:6px;padding:10px 0;color:var(--c-ink-2);text-decoration:none;font-size:var(--text-sm);font-weight:700;border-radius:12px}
    .mk-more a .icon{width:24px;height:24px}.mk-more a:active{background:var(--c-fill)} }`,
    js: ({ links, icon }) => { const n = document.createElement('nav'); n.className = 'mk-more'; n.innerHTML = links.map(([i, l]) => `<a href="#">${icon[i]}<span>${l}</span></a>`).join(''); document.getElementById('screen-home').appendChild(n); } },
  'n2-tiles-after-code': { w: [375], css: `
    @media (max-width:860px){ body.zen-lobby .hq-hello .hub-more{display:none} .mk-tiles{order:3;display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .mk-tiles a{display:flex;align-items:center;gap:10px;min-height:52px;padding:0 14px;border-radius:14px;background:var(--c-surface);border:1px solid var(--c-border);color:var(--c-ink);text-decoration:none;font-weight:800;box-shadow:var(--shadow-card)}
    .mk-tiles a .icon{width:22px;height:22px;color:var(--c-brand-text)} body.zen-lobby .hq > #home-mine-card{order:4} body.zen-lobby .hq > .hq-side{order:5} }`,
    js: ({ links, icon }) => { const n = document.createElement('nav'); n.className = 'mk-tiles'; n.innerHTML = links.map(([i, l]) => `<a href="#">${icon[i]}<span>${l}</span></a>`).join(''); document.getElementById('screen-home').appendChild(n); } },
  'n3-explore-button': { w: [375], states: ['', 'open'], css: `
    @media (max-width:860px){ body.zen-lobby .hq-hello .hub-more{display:none} .mk-xbtn{margin-left:auto;display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 12px;border-radius:999px;border:1px solid var(--c-border);background:var(--c-surface);color:var(--c-ink);font:inherit;font-weight:800;font-size:var(--text-sm)}
    .mk-xbtn .icon{width:18px;height:18px}
    .mk-sheet{position:fixed;left:0;right:0;bottom:0;z-index:70;padding:16px 12px 20px;border-radius:18px 18px 0 0;background:var(--c-surface);box-shadow:0 0 0 100vmax rgba(0,0,0,.45);display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .mk-sheet h3{grid-column:1/-1;margin:0 4px 4px;font-size:var(--text-sm);text-transform:uppercase;letter-spacing:.08em;color:var(--c-ink-2)}
    .mk-sheet a{display:flex;align-items:center;gap:10px;min-height:56px;padding:0 14px;border-radius:14px;background:var(--c-surface-2);color:var(--c-ink);text-decoration:none;font-weight:800}.mk-sheet a .icon{width:22px;height:22px;color:var(--c-brand-text)} }`,
    js: ({ links, icon, state }) => { const h = document.querySelector('.hq-hello'); const b = document.createElement('button'); b.className = 'mk-xbtn'; b.innerHTML = icon['grid-four'] + '<span>Khám phá</span>'; h.appendChild(b);
      if (state === 'open') { const s = document.createElement('div'); s.className = 'mk-sheet'; s.innerHTML = '<h3>Khám phá</h3>' + links.map(([i, l]) => `<a href="#">${icon[i]}<span>${l}</span></a>`).join(''); document.body.appendChild(s); } } },

  // ── #361: Thách đấu on Home ──
  't1-second-sentence': { w: [1280, 375], states: ['', 'open'], css: `
    #qm-friend{display:none!important}
    .mk-ch{margin-top:30px}.mk-ch__q{margin:0;font-family:var(--font-display);font-size:clamp(26px,1.8vw + 8px,36px);line-height:1.3;font-weight:900;letter-spacing:-.02em;color:var(--c-ink)}
    .mk-ch__q .hq-blank{font-size:inherit}.mk-ch__q .mk-ph{color:var(--c-ink-2);background:var(--c-fill);border-bottom-color:var(--c-ink-3)}
    .mk-ch__go{margin-top:14px;display:inline-flex;align-items:center;gap:10px;min-height:56px;padding:0 26px 0 12px;border-radius:999px;border:2px solid var(--c-ink);background:transparent;color:var(--c-ink);font:inherit;font-size:20px;font-weight:900}
    .mk-ch__go .d{display:inline-flex;width:36px;height:36px;border-radius:50%;align-items:center;justify-content:center;background:var(--c-accent);color:#fff}.mk-ch__go .icon{width:20px;height:20px}
    .mk-ch__hint{margin:8px 0 0;font-size:var(--text-sm);color:var(--c-ink-2)}
    @media (max-width:860px){.mk-ch{margin-top:22px}.mk-ch__q{font-size:24px}.mk-ch__go{width:100%;justify-content:center}}`,
    js: ({ icon, state, people }) => { const m = document.querySelector('.hq-main'); const or = m.querySelector('.hq-or'); const d = document.createElement('div'); d.className = 'mk-ch';
      d.innerHTML = `<p class="mk-ch__q">Hoặc thách <button class="hq-blank mk-ph" aria-haspopup="listbox">chọn đối thủ</button> cùng luật trên.</p><button class="mk-ch__go"><span class="d">${icon['sword']}</span>Thách đấu</button><p class="mk-ch__hint">Bạn bè và người đang online · đối thủ có 2 phút để nhận</p>`;
      m.insertBefore(d, or);
      if (state === 'open') window.__mkPicker(d.querySelector('.mk-ph'), people); } },
  't2-twin-buttons': { w: [1280, 375], states: ['', 'open'], css: `
    #qm-friend{display:none!important} .hq-go{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
    .mk-tw{display:inline-flex;align-items:center;gap:12px;min-height:72px;padding:0 30px 0 14px;border-radius:999px;border:2px solid var(--c-ink);background:var(--c-surface);color:var(--c-ink);font:inherit;font-size:22px;font-weight:900;box-shadow:var(--shadow-card)}
    .mk-tw .d{display:inline-flex;width:46px;height:46px;border-radius:50%;align-items:center;justify-content:center;background:var(--c-accent);color:#fff}.mk-tw .icon{width:24px;height:24px}
    @media (max-width:860px){.mk-tw{width:100%;justify-content:center;min-height:56px;font-size:20px}.mk-tw .d{width:36px;height:36px}}`,
    js: ({ icon, state, people }) => { const g = document.querySelector('.hq-go'); const b = document.createElement('button'); b.className = 'mk-tw'; b.innerHTML = `<span class="d">${icon['sword']}</span>Thách đấu`; g.appendChild(b);
      if (state === 'open') window.__mkPicker(b, people, 'Thách với luật: Caro VN · thời gian tự động · xếp hạng'); } },
};

// Shared opponent picker (popover under the anchor on desktop, bottom sheet on phone).
const PICKER_CSS = `
  .mk-pk{position:absolute;z-index:70;width:360px;padding:12px;border-radius:16px;background:var(--c-surface);border:1px solid var(--c-border);box-shadow:var(--shadow-lg);display:grid;gap:8px;font-size:var(--text-md)}
  .mk-pk input{min-height:44px;padding:0 12px;border-radius:10px;border:1px solid var(--c-border);background:var(--c-field, var(--c-surface-2));color:var(--c-ink);font:inherit}
  .mk-pk__tabs{display:flex;gap:6px}.mk-pk__tabs b{padding:6px 12px;border-radius:999px;background:var(--c-fill);font-size:var(--text-sm)}.mk-pk__tabs b.on{background:var(--c-ink);color:var(--c-on-ink)}
  .mk-pk ul{list-style:none;margin:0;padding:0;display:grid;gap:2px}
  .mk-pk li{display:flex;align-items:center;gap:10px;min-height:48px;padding:0 10px;border-radius:10px}.mk-pk li.sel{background:var(--c-brand-light)}
  .mk-pk .av{width:30px;height:30px;border-radius:50%;background:var(--c-surface-2);display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;position:relative}
  .mk-pk .av::after{content:'';position:absolute;right:-1px;bottom:-1px;width:9px;height:9px;border-radius:50%;background:var(--c-state-playing);border:2px solid var(--c-surface)}
  .mk-pk .nm{font-weight:800;flex:1}.mk-pk .tg{font-size:var(--text-xs);padding:2px 8px;border-radius:6px;background:var(--c-fill);color:var(--c-ink-2)}.mk-pk .el{font-size:var(--text-sm);color:var(--c-ink-2);font-variant-numeric:tabular-nums}
  .mk-pk__foot{margin:4px 0 0;font-size:var(--text-sm);color:var(--c-ink-2)}
  .mk-pk__send{min-height:48px;border:0;border-radius:999px;background:var(--c-ink);color:var(--c-on-ink);font:inherit;font-weight:900}
  @media (max-width:860px){.mk-pk{position:fixed;left:0!important;right:0;top:auto!important;bottom:0;width:auto;border-radius:18px 18px 0 0;box-shadow:0 0 0 100vmax rgba(0,0,0,.45);padding:14px 12px 18px}}`;
function installPicker() {
  window.__mkPicker = (anchor, people, foot) => {
    const p = document.createElement('div'); p.className = 'mk-pk';
    p.innerHTML = `<input placeholder="Tìm người chơi…"><div class="mk-pk__tabs"><b class="on">Tất cả</b><b>Bạn bè</b><b>Đang online</b></div><ul>${people.map(([n, tag, elo, fr], i) => `<li class="${i === 0 ? 'sel' : ''}"><span class="av">${n.slice(0, 2).toUpperCase()}</span><span class="nm">${n}</span>${fr ? '<span class="tg">Bạn bè</span>' : ''}<span class="el">${elo}</span></li>`).join('')}</ul>${foot ? `<p class="mk-pk__foot">${foot}</p>` : ''}<button class="mk-pk__send">Gửi lời thách tới Lan Anh</button>`;
    document.body.appendChild(p);
    const r = anchor.getBoundingClientRect(); p.style.left = (r.left + scrollX) + 'px'; p.style.top = (r.bottom + scrollY + 8) + 'px';
  };
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.HOME + '/.local/share/ms-playwright/chromium-1243/chrome-linux64/chrome' });
  const ctx = await browser.newContext({ locale: 'vi-VN' });
  const u = 'mk' + Date.now().toString(36);
  const r = await ctx.request.post(B + '/api/auth/register', { data: { username: u, password: 'Passw0rd!x', displayName: 'minhcaro' }, headers: { origin: B } });
  const j = await r.json();
  await ctx.addInitScript((usr) => { localStorage.setItem('gvn_user', JSON.stringify(usr)); localStorage.removeItem('gvn_quickmatch'); }, { userId: j.user.userId, displayName: 'minhcaro', isGuest: false });
  const page = await ctx.newPage();
  const icons = ['target', 'chat-circle', 'trophy', 'users-three', 'grid-four', 'sword'];
  const icon = Object.fromEntries(icons.map((n) => [n, ICON(n)]));
  for (const [id, m] of Object.entries(MOCKS)) {
    for (const w of m.w) for (const mode of ['light', 'dark']) for (const state of (m.states || [''])) {
      if (mode === 'dark' && state) continue;
      await page.setViewportSize({ width: w, height: w > 860 ? 860 : 812 });
      await page.addInitScript((md) => localStorage.setItem('gvn_color_mode', md), mode);
      await page.goto(B + '/index.html'); await page.waitForTimeout(1200);
      await page.addStyleTag({ content: m.css + PICKER_CSS + 'body.zen-lobby .hq>*{animation:none!important}' });
      await page.evaluate(installPicker);
      await page.evaluate(m.js, { links: LINKS, icon, state, people: PEOPLE });
      await page.waitForTimeout(300);
      const name = `${id}-${mode}-${w}${state ? '-' + state : ''}.png`;
      await page.screenshot({ path: path.join(OUT, name), fullPage: w <= 860 && !state });
      process.stdout.write(name + ' ');
    }
  }
  await browser.close();
})();
