/* Home fill-space mockups (2026-11-12). Injected into the REAL index.html by shoot.js
   (page.evaluate), so nav, background, tokens and hub are the live ones. Every block uses data
   GET /api/home already returns (live, tournaments, forum, learn) — no server change.
   Variant: window.__MK = 'a' | 'b' | 'c'. */
(function () {
  const V = window.__MK;
  const scr = document.getElementById('screen-home');
  const icon = (n) => `<svg class="icon" aria-hidden="true"><use href="assets/icons/phosphor-sprite.svg#ph-regular-${n}"></use></svg>`;
  const row = (title, meta, act) => `<a class="prow hrow" href="#"><div class="prow__body"><div class="prow__t">${title}</div><div class="prow__m hrow__meta">${meta.map((m) => `<span>${m}</span>`).join('')}</div></div>${act ? `<span class="prow__act">${act}</span>` : ''}</a>`;
  const live = `<section class="ppanel mk-panel"><h2 class="ph2 mk-h">${icon('broadcast')} Đang diễn ra <span class="mk-count">3 ván</span></h2><div class="prows mk-rows">
      ${row('minhcaro <span class="mk-vs">vs</span> Lan Anh', ['Caro VN', '30s/nước', '42 nước', '5 người xem'], 'Xem')}
      ${row('tuan_99 <span class="mk-vs">vs</span> hoangbao', ['Free-style', '1+1', '18 nước', '2 người xem'], 'Xem')}
      ${row('Khánh Linh <span class="mk-vs">vs</span> quang.dv', ['Caro VN', '45s/nước', '7 nước'], 'Xem')}
    </div><a class="mk-more" href="#">Tất cả phòng →</a></section>`;
  const tour = `<section class="ppanel mk-panel"><h2 class="ph2 mk-h">${icon('trophy')} Giải đấu</h2><div class="prows mk-rows">
      ${row('Cúp Mùa Đông 2026', ['Swiss', '12 người', 'Đang đăng ký'], 'Đăng ký')}
      ${row('Giải CLB Hà Nội', ['Round robin', '8 người', 'Đang diễn ra'], 'Xem')}
    </div></section>`;
  const forum = `<section class="ppanel mk-panel"><h2 class="ph2 mk-h">${icon('chat-circle')} Diễn đàn</h2><div class="prows mk-rows">
      ${row('Thế cờ hoa mai — chặn thế nào?', ['Chiến thuật', '14 trả lời'])}
      ${row('Góp ý luật Swap2 cho giải tháng 12', ['Góp ý', '6 trả lời'])}
      ${row('Tìm bạn luyện cờ buổi tối', ['Giao lưu', '3 trả lời'])}
    </div></section>`;
  const tile = (ic, title, body, href) => `<a class="mk-tile" href="${href}"><span class="mk-tile__ic">${icon(ic)}</span><span class="mk-tile__t">${title}</span><span class="mk-tile__b">${body}</span></a>`;
  const tiles = `<div class="mk-bento">
      ${tile('target', 'Học & giải đố', '<span>12 / 48 bài đã giải</span><span class="mk-bar"><i style="width:25%"></i></span><span class="mk-tile__go">Giải tiếp →</span>', '/puzzles')}
      ${tile('broadcast', 'Đang diễn ra', '<span><b>minhcaro</b> vs <b>Lan Anh</b></span><span class="mk-muted">Caro VN · 42 nước · 5 xem</span><span class="mk-tile__go">Xem ván →</span>', '#')}
      ${tile('trophy', 'Giải đấu', '<span><b>Cúp Mùa Đông 2026</b></span><span class="mk-muted">Swiss · 12 người · đang đăng ký</span><span class="mk-tile__go">Đăng ký →</span>', '#')}
      ${tile('chat-circle', 'Diễn đàn', '<span>Thế cờ hoa mai — chặn thế nào?</span><span class="mk-muted">14 trả lời · 5 phút trước</span><span class="mk-tile__go">Đọc →</span>', '/forum')}
    </div>`;

  const css = document.createElement('style');
  css.textContent = `
  body.zen-lobby .mk-h { display:flex; align-items:center; gap:8px; font-size:var(--text-md); }
  body.zen-lobby .mk-h .icon { width:20px; height:20px; color:var(--c-brand-text); }
  body.zen-lobby .mk-count { margin-left:auto; font-weight:600; font-size:var(--text-sm); color:var(--c-ink-2); }
  body.zen-lobby .mk-rows { gap:8px; }
  body.zen-lobby .mk-rows a.prow, body.zen-lobby .mk-tile { text-decoration:none; }
  body.zen-lobby .mk-vs { color:var(--c-ink-2); font-weight:400; margin:0 4px; }
  body.zen-lobby .mk-more { display:inline-block; margin-top:12px; color:var(--c-brand-text); font-weight:600; font-size:var(--text-sm); }
  body.zen-lobby .mk-side { display:flex; flex-direction:column; gap:20px; min-width:0; }
  /* B: bento tiles */
  body.zen-lobby .mk-bento { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
  body.zen-lobby .mk-tile { display:flex; flex-direction:column; gap:6px; padding:18px; border-radius:var(--radius-lg); background:var(--c-surface); box-shadow:var(--shadow-card); border:1px solid var(--c-border); color:var(--c-ink); text-decoration:none; font-size:var(--text-sm); min-height:150px; }
  body.zen-lobby .mk-tile:hover { background:var(--c-hover); }
  body.zen-lobby .mk-tile__ic { display:inline-flex; width:40px; height:40px; align-items:center; justify-content:center; border-radius:50%; background:color-mix(in srgb, var(--c-brand) 14%, transparent); color:var(--c-brand-text); }
  body.zen-lobby .mk-tile__ic .icon { width:22px; height:22px; }
  body.zen-lobby .mk-tile__t { font-weight:700; font-size:var(--text-md); }
  body.zen-lobby .mk-tile__b { display:flex; flex-direction:column; gap:4px; flex:1; }
  body.zen-lobby .mk-tile__go { margin-top:auto; color:var(--c-brand-text); font-weight:600; }
  body.zen-lobby .mk-muted { color:var(--c-ink-2); }
  body.zen-lobby .mk-bar { display:block; height:6px; border-radius:99px; background:var(--c-surface-2); overflow:hidden; }
  body.zen-lobby .mk-bar i { display:block; height:100%; background:var(--c-brand); }
  /* C: centred hub + full-width band */
  body.zen-lobby .mk-band { grid-column:1/-1; display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:20px; margin-top:28px; }
  body.zen-lobby.mk-c .zen-hero, body.zen-lobby.mk-c .hstats { justify-content:center; text-align:center; }
  body.zen-lobby.mk-c #screen-home.psplit > :is(.hub, .hub-more) { justify-self:center; }
  /* A/B desktop: hub column left, the new column right */
  @media (min-width: 861px) {
    body.zen-lobby:is(.mk-a,.mk-b) .psplit { grid-template-columns:minmax(0,520px) minmax(0,1fr); column-gap:40px; }
    body.zen-lobby:is(.mk-a,.mk-b) #screen-home > .hstats { grid-row:1; }
    body.zen-lobby:is(.mk-a,.mk-b) #screen-home > .hub { grid-column:1; grid-row:2; }
    body.zen-lobby:is(.mk-a,.mk-b) #screen-home > .hub-more { grid-column:1; grid-row:3; }
    body.zen-lobby:is(.mk-a,.mk-b) #screen-home > #home-mine-card { grid-column:1; grid-row:4; }
    body.zen-lobby:is(.mk-a,.mk-b) #screen-home > .mk-side { grid-column:2; grid-row:2 / span 4; }
  }`;
  document.head.appendChild(css);
  document.body.classList.add('mk-' + V);
  const wrap = document.createElement('div');
  if (V === 'a') { wrap.className = 'mk-side'; wrap.innerHTML = live + tour; scr.querySelector('.hub').after(wrap); }
  if (V === 'b') { wrap.className = 'mk-side'; wrap.innerHTML = tiles; scr.querySelector('.hub').after(wrap); scr.querySelector('.hub-more').hidden = true; scr.querySelector('.hub-more').style.display = 'none'; }
  if (V === 'c') { wrap.className = 'mk-band'; wrap.innerHTML = live + tour + forum; scr.appendChild(wrap); }
})();
