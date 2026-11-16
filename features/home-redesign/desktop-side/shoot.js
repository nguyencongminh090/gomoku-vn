// Desktop side mockups (2026-11-13): greeting row (online + Học/Diễn đàn/Giải đấu/Hội nhóm icons) + right count cards.
// Patches the REAL home in the browser, desktop only (≥861px). Phone untouched.
// Needs: PORT=3101 GOMOKU_DB_PATH=<scratch>/x.db node server/index.js
// Sample data (same in every shot, incl. "hiện tại"): 24 online, 3 searching, 5 playing, 1 live game, learn 12/240, 1 forum thread, 2 tournaments.
const path = require('path');
const { chromium } = require('playwright');
const B = 'http://localhost:3101';
const OUT = path.join(__dirname, 'shots');
const D = {
  online: 24, searching: 3, playing: 5,
  live: { t: 'minhcaro vs Tuấn Anh', m: '23 nước' },
  learn: '12/240 thế cờ đã giải', forum: '“Khai cuộc Hoa Nguyệt” · 4 trả lời', tour: '2 giải đang mở đăng ký', club: 'Tìm hội cùng chơi',
};
const LINKS = [['target', 'Học', 'learn'], ['chat-circle', 'Diễn đàn', 'forum'], ['trophy', 'Giải đấu', 'tour'], ['users-three', 'Hội nhóm', 'club']];
const W = (css) => `@media (min-width:861px){ ${css} }`;
// Shared: hide the current pieces the mockup replaces.
const HIDE_ALL = W('body.zen-lobby .hq-hello .hub-more, body.zen-lobby .hq-hello .hq-online, body.zen-lobby .hq > .hq-side { display:none!important }');

const MOCKS = {
  '0-hien-tai': { css: '', js: () => {} },

  // A — "Một cột bên": ONE panel = live block (online headline + 2 counts + live game) then Khám phá rows with a data line each.
  'a-mot-cot': { css: HIDE_ALL + W(`
    .mk-rail{display:grid;align-content:start;padding:6px 0 0;}
    .mk-panel{border-radius:18px;background:var(--c-surface);border:1px solid var(--c-border);box-shadow:var(--shadow-card);overflow:hidden}
    .mk-live{padding:18px 18px 14px}
    .mk-on{display:flex;align-items:center;gap:10px;margin:0 0 14px;font-size:var(--text-md);font-weight:800;color:var(--c-ink)}
    .mk-on i{width:10px;height:10px;border-radius:50%;background:var(--c-state-playing);box-shadow:0 0 0 4px color-mix(in srgb,var(--c-state-playing) 25%,transparent)}
    .mk-on b{font-size:22px;font-variant-numeric:tabular-nums}
    .mk-two{display:grid;grid-template-columns:1fr 1fr;border-radius:12px;background:var(--c-surface-2)}
    .mk-two div{display:grid;gap:2px;padding:10px 14px}.mk-two div+div{border-left:1px solid var(--c-border)}
    .mk-two b{font-size:30px;font-weight:900;line-height:1.05;font-variant-numeric:tabular-nums;color:var(--c-ink)}
    .mk-two span{font-size:var(--text-sm);color:var(--c-ink-2)}
    .mk-game{display:flex;align-items:center;gap:10px;margin-top:10px;text-decoration:none;white-space:nowrap;padding:10px 12px;border-radius:12px;border:1px solid var(--c-border);font-size:var(--text-sm)}
    .mk-game .icon{width:20px;height:20px;color:var(--c-accent)} .mk-game b{flex:1;font-weight:800;color:var(--c-ink)} .mk-game span{color:var(--c-ink-2)}
    .mk-sec{margin:0;padding:12px 18px 6px;border-top:1px solid var(--c-border);font-size:var(--text-xs);font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--c-ink-2)}
    .mk-rows{display:grid;padding:0 8px 8px}
    .mk-rows a{display:grid;grid-template-columns:40px 1fr 16px;align-items:center;gap:2px 12px;min-height:56px;padding:6px 10px;border-radius:12px;color:var(--c-ink);text-decoration:none}
    .mk-rows a:hover{background:var(--c-fill)}
    .mk-rows a>.icon:first-child{grid-row:span 2;box-sizing:content-box;width:22px;height:22px;padding:9px;border-radius:50%;background:var(--c-brand-light);color:var(--c-brand-text)}
    .mk-rows b{font-weight:800} .mk-rows small{grid-column:2;font-size:var(--text-sm);color:var(--c-ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .mk-rows a>.icon:last-child{grid-column:3;grid-row:1/span 2;width:16px;height:16px;color:var(--c-ink-3)}`),
    js: ({ D, links, I }) => {
      const rows = links.map(([i, l, k]) => `<a href="#">${I(i)}<b>${l}</b><small>${D[k]}</small>${I('caret-right')}</a>`).join('');
      document.getElementById('screen-home').insertAdjacentHTML('beforeend', `<div class="mk-rail"><div class="mk-panel">
        <div class="mk-live"><p class="mk-on"><i></i><b>${D.online}</b> người đang online</p>
          <div class="mk-two"><div><b>${D.searching}</b><span>đang tìm trận</span></div><div><b>${D.playing}</b><span>ván đang chơi</span></div></div>
          <a class="mk-game" href="#">${I('broadcast')}<b>${D.live.t}</b><span>${D.live.m}</span></a></div>
        <p class="mk-sec">Khám phá</p><nav class="mk-rows" aria-label="Khám phá">${rows}</nav></div></div>`);
    } },

  // B — "Thanh nhịp + ô Khám phá": counts become one status bar beside the greeting; right column = 2×2 labelled tiles with data + live game.
  'b-thanh-nhip': { css: HIDE_ALL + W(`
    .mk-bar{display:inline-flex;align-items:stretch;margin-left:auto;border-radius:999px;background:var(--c-surface);border:1px solid var(--c-border);box-shadow:var(--shadow-card);font-size:var(--text-sm);color:var(--c-ink-2)}
    .mk-bar span{display:inline-flex;align-items:center;gap:8px;padding:8px 18px}.mk-bar span+span{border-left:1px solid var(--c-border)}
    .mk-bar b{font-size:var(--text-md);font-weight:900;color:var(--c-ink);font-variant-numeric:tabular-nums}
    .mk-bar i{width:9px;height:9px;border-radius:50%;background:var(--c-state-playing)}
    .mk-side{display:grid;align-content:start;gap:12px;padding-top:6px}
    .mk-h{margin:0;font-size:var(--text-xs);font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--c-ink-2)}
    .mk-tiles{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .mk-tiles a{display:grid;align-content:start;gap:6px;min-height:118px;padding:14px;border-radius:16px;background:var(--c-surface);border:1px solid var(--c-border);box-shadow:var(--shadow-card);color:var(--c-ink);text-decoration:none;transition:transform var(--duration-fast)}
    .mk-tiles a:hover{transform:translateY(-2px)}
    .mk-tiles .icon{box-sizing:content-box;width:22px;height:22px;padding:9px;border-radius:12px;background:var(--c-brand-light);color:var(--c-brand-text)}
    .mk-tiles b{margin-top:4px;font-size:var(--text-md);font-weight:900} .mk-tiles small{font-size:var(--text-xs);line-height:1.35;color:var(--c-ink-2)}
    .mk-game{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:2px 10px;padding:12px 14px;border-radius:16px;background:var(--c-surface);border:1px solid var(--c-border);font-size:var(--text-sm);color:var(--c-ink-2);text-decoration:none}
    .mk-game .icon{grid-row:span 2;width:22px;height:22px;color:var(--c-accent)} .mk-game b{color:var(--c-ink);font-weight:800}`),
    js: ({ D, links, I }) => {
      document.querySelector('.hq-hello').insertAdjacentHTML('beforeend', `<p class="mk-bar"><span><i></i><b>${D.online}</b> online</span><span><b>${D.searching}</b> đang tìm trận</span><span><b>${D.playing}</b> ván đang chơi</span></p>`);
      document.getElementById('screen-home').insertAdjacentHTML('beforeend', `<div class="mk-side"><p class="mk-h">Khám phá</p><nav class="mk-tiles">${links.map(([i, l, k]) => `<a href="#">${I(i)}<b>${l}</b><small>${D[k]}</small></a>`).join('')}</nav>
        <p class="mk-h">Đang xem nhiều</p><a class="mk-game" href="#">${I('broadcast')}<b>${D.live.t}</b><span>${D.live.m} · bấm để xem</span></a></div>`);
    } },

  // C — "Bảng đen quán cờ" (innovative): an ink scoreboard (dark in both modes) with digit plates; Khám phá as 4 labelled chips under it.
  'c-bang-den': { css: HIDE_ALL + W(`
    .mk-side{display:grid;align-content:start;gap:16px;padding-top:6px}
    .mk-board{position:relative;padding:18px;border-radius:20px;background:#1d1c19;color:#e8e6e1;box-shadow:0 22px 40px -22px rgba(0,0,0,.7);overflow:hidden}
    .mk-board::before{content:'';position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px);background-size:22px 22px;pointer-events:none}
    .mk-board>*{position:relative}
    .mk-top{display:flex;align-items:center;justify-content:space-between;margin:0 0 14px;font-size:var(--text-xs);font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#a8a49b}
    .mk-top em{display:inline-flex;align-items:center;gap:6px;font-style:normal;color:#8bc34a}.mk-top em i{width:8px;height:8px;border-radius:50%;background:#8bc34a;animation:mkp 1.6s infinite}
    @keyframes mkp{50%{opacity:.3}}
    .mk-row{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:14px;padding:10px 0;border-top:1px dashed rgba(255,255,255,.14)}
    .mk-dig{display:inline-flex;gap:3px}.mk-dig b{display:inline-grid;place-items:center;width:30px;height:42px;border-radius:6px;background:#2f2d29;box-shadow:inset 0 -21px 0 rgba(0,0,0,.18);font-size:28px;font-weight:900;font-variant-numeric:tabular-nums;color:#fff}
    .mk-row span{font-weight:700;color:#d6d3cc}.mk-row.is-hot .mk-dig b{color:#8bc34a}
    .mk-tick{display:flex;white-space:nowrap;align-items:center;gap:8px;margin:6px 0 0;padding:10px 12px;border-radius:12px;background:rgba(238,106,32,.14);font-size:var(--text-sm);color:#f3c9a8;text-decoration:none}
    .mk-tick .icon{width:18px;height:18px;color:#ee6a20}.mk-tick b{color:#fff}
    .mk-chips{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .mk-chips a{display:flex;align-items:center;gap:10px;min-height:52px;padding:0 14px;border-radius:999px;background:var(--c-surface);border:1.5px solid var(--c-ink);color:var(--c-ink);font-weight:800;text-decoration:none}
    .mk-chips a:hover{background:var(--c-fill)} .mk-chips .icon{width:22px;height:22px;color:var(--c-brand-text)}`),
    js: ({ D, links, I }) => {
      const dig = (n) => `<span class="mk-dig">${String(n).padStart(2, '0').split('').map((c) => `<b>${c}</b>`).join('')}</span>`;
      document.getElementById('screen-home').insertAdjacentHTML('beforeend', `<div class="mk-side"><div class="mk-board">
        <p class="mk-top">Bảng quán cờ <em><i></i>trực tiếp</em></p>
        <div class="mk-row is-hot">${dig(D.online)}<span>người đang online</span></div>
        <div class="mk-row">${dig(D.searching)}<span>đang tìm trận</span></div>
        <div class="mk-row">${dig(D.playing)}<span>ván đang chơi</span></div>
        <a class="mk-tick" href="#">${I('broadcast')}<span><b>${D.live.t}</b> · ${D.live.m}</span></a></div>
        <nav class="mk-chips">${links.map(([i, l]) => `<a href="#">${I(i)}${l}</a>`).join('')}</nav></div>`);
    } },

  // D — "Kệ dưới": right column = compact live card; Khám phá = full-width shelf of 4 cards along the bottom, filling the empty lower half.
  'd-ke-duoi': { css: HIDE_ALL + W(`
    .mk-side{display:grid;align-content:start;padding-top:6px}
    .mk-card{display:grid;gap:12px;padding:18px;border-radius:18px;background:var(--c-surface);border:1px solid var(--c-border);box-shadow:var(--shadow-card)}
    .mk-on{display:flex;align-items:center;gap:8px;margin:0;font-size:var(--text-xs);font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--c-ink-2)}
    .mk-on i{width:9px;height:9px;border-radius:50%;background:var(--c-state-playing)} .mk-on b{color:var(--c-ink)}
    .mk-n{display:flex;align-items:baseline;gap:10px;margin:0}.mk-n b{min-width:1.3ch;font-size:40px;font-weight:900;line-height:1;font-variant-numeric:tabular-nums;color:var(--c-ink)}.mk-n span{color:var(--c-ink-2)}
    .mk-game{display:flex;align-items:center;gap:8px;white-space:nowrap;padding:10px 12px;border-radius:12px;background:var(--c-surface-2);font-size:var(--text-sm);color:var(--c-ink-2);text-decoration:none}
    .mk-game .icon{width:18px;height:18px;color:var(--c-accent)} .mk-game b{color:var(--c-ink)}
    .mk-shelf{grid-column:1/-1;display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:8px}
    .mk-shelf a{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:2px 14px;padding:16px 18px;border-radius:18px;background:var(--c-surface);border:1px solid var(--c-border);box-shadow:var(--shadow-card);color:var(--c-ink);text-decoration:none;transition:transform var(--duration-fast)}
    .mk-shelf a:hover{transform:translateY(-2px)}
    .mk-shelf .icon{grid-row:span 2;box-sizing:content-box;width:24px;height:24px;padding:12px;border-radius:14px;background:var(--c-brand-light);color:var(--c-brand-text)}
    .mk-shelf b{font-size:var(--text-md);font-weight:900}.mk-shelf small{font-size:var(--text-sm);color:var(--c-ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`),
    js: ({ D, links, I }) => {
      const sec = document.getElementById('screen-home');
      sec.insertAdjacentHTML('beforeend', `<div class="mk-side"><div class="mk-card">
        <p class="mk-on"><i></i>Đang diễn ra · <b>${D.online} online</b></p>
        <p class="mk-n"><b>${D.searching}</b><span>người đang tìm trận</span></p>
        <p class="mk-n"><b>${D.playing}</b><span>ván đang chơi</span></p>
        <a class="mk-game" href="#">${I('broadcast')}<span><b>${D.live.t}</b> · ${D.live.m}</span></a></div></div>
        <nav class="mk-shelf" aria-label="Khám phá">${links.map(([i, l, k]) => `<a href="#">${I(i)}<b>${l}</b><small>${D[k]}</small></a>`).join('')}</nav>`);
    } },
};

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.HOME + '/.local/share/ms-playwright/chromium-1243/chrome-linux64/chrome' });
  const ctx = await browser.newContext({ locale: 'vi-VN', deviceScaleFactor: 1 });
  const u = 'mk' + Date.now().toString(36);
  const r = await ctx.request.post(B + '/api/auth/register', { data: { username: u, password: 'Passw0rd!x', displayName: 'minhcaro' }, headers: { origin: B } });
  const j = await r.json();
  await ctx.addInitScript((usr) => { localStorage.setItem('gvn_user', JSON.stringify(usr)); localStorage.removeItem('gvn_quickmatch'); }, { userId: j.user.userId, displayName: 'minhcaro', isGuest: false });
  const page = await ctx.newPage();
  const sizes = (process.env.SIZES || '1440x900,1280x800').split(',').map((s) => s.split('x').map(Number));
  for (const [id, m] of Object.entries(MOCKS).filter(([k]) => !process.env.ONLY || process.env.ONLY.split(',').includes(k)))
    for (const mode of ['light', 'dark']) for (const [w, h] of sizes) {
      await page.setViewportSize({ width: w, height: h });
      await page.addInitScript((md) => localStorage.setItem('gvn_color_mode', md), mode);
      await page.goto(B + '/index.html'); await page.waitForTimeout(1200);
      await page.addStyleTag({ content: m.css + 'body.zen-lobby .hq>*{animation:none!important} :is(.mk-game,.mk-tick){overflow:hidden;min-width:0} :is(.mk-game,.mk-tick)>:is(b,span){min-width:0;overflow:hidden;text-overflow:ellipsis}' });
      // Same sample numbers in every shot (the scratch server is empty).
      await page.evaluate((D) => {
        const set = (id, v) => { const e = document.getElementById(id); if (e) { e.textContent = v; e.classList.remove('is-zero'); } };
        set('home-n-search', D.searching); set('home-n-live', D.playing);
        const on = document.getElementById('home-online'); if (on) { on.hidden = false; on.innerHTML = `<span class="hq-online__dot"></span><span>${D.online} đang online</span>`; }
        const l1 = document.getElementById('home-n-search-l'); if (l1) l1.innerHTML = '<span>người</span>';
        const l2 = document.getElementById('home-n-live-l'); if (l2) l2.innerHTML = '<span>ván</span>';
        const one = document.getElementById('home-live-one'); if (one) one.innerHTML = `<button type="button" class="hq-live"><span class="hq-live__t">${D.live.t}</span><span class="hq-live__m">${D.live.m}</span></button>`;
      }, D);
      await page.evaluate(`(${m.js.toString()})({ D: ${JSON.stringify(D)}, links: ${JSON.stringify(LINKS)}, I: (n) => '<svg class="icon" aria-hidden="true"><use href="assets/icons/phosphor-sprite.svg#ph-regular-' + n + '"></use></svg>' })`);
      await page.waitForTimeout(300);
      const name = `${id}-${mode}-${w}.png`;
      await page.screenshot({ path: path.join(OUT, name) });
      process.stdout.write(name + ' ');
    }
  await browser.close();
})();
