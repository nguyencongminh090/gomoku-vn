/* Mockup only: moves the REAL Home nodes (listeners intact) into each concept's layout, at desktop widths only. */
(function () {
  if (!matchMedia('(min-width: 861px)').matches) return;
  const concept = document.documentElement.dataset.lx;
  const screen = document.getElementById('screen-home');
  if (!concept || !screen) return;
  document.body.classList.add('lx', 'lx-' + concept);

  const $ = (id) => document.getElementById(id);
  const q = (s) => document.querySelector(s);
  const R = {
    hello: $('home-hello'), news: $('home-news'), mine: $('home-mine-card'), chips: $('home-chips'), pick: $('qm-pick'),
    go: q('.hq-go'), play: $('qm-play'), chal: $('qm-challenge'), search: $('qm-search'), line: $('qm-line'), code: $('home-code'),
    board: q('.hq-board'), more: q('.hub-more'), live: $('home-live-card'),
  };
  const h = (tag, cls, ...kids) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    for (const k of kids) n.append(k);
    return n;
  };
  const img = (src, cls) => { const i = h('img', cls); i.src = '/__luxe/assets/' + src; i.alt = ''; i.decoding = 'async'; return i; };
  const hi = () => { R.hello.classList.add('lx-hi'); return R.hello; };
  const notices = () => h('div', 'lx-notices', R.news, R.mine);
  const options = () => h('div', 'lx-pickwrap', R.pick, R.chips);
  const label = (t) => { const p = h('p', 'lx-label'); p.textContent = t; return p; };
  const hover = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const build = {
    c1() {
      const title = h('h1', 'lx1-title', 'Chơi ', h('em', '', 'ngay'));
      const table = h('div', 'lx-plate lx1-table');
      const ivory = img('c1/stone-ivory.webp', 'lx-plate lx1-ivory');
      const stone = img('c1/stone-black.webp', 'lx-plate lx1-stone');
      const contact = h('div', 'lx-plate lx1-contact');
      const root = h('div', 'lx-root lx1',
        table, h('div', 'lx-plate lx1-shade'), ivory,
        h('div', 'lx1-head', hi(), title), contact, stone,
        h('div', 'lx1-dock', notices(),
          h('div', 'lx1-console',
            h('div', 'lx1-main',
              h('div', 'lx1-play', options(), R.go),
              h('div', 'lx1-code', label('Vào phòng bằng mã'), R.code)),
            R.line,
            h('div', 'lx1-sub', R.board, R.more))));
      screen.prepend(root);
      if (hover && !still) {
        let raf = 0;
        addEventListener('pointermove', (e) => {
          const x = e.clientX / innerWidth - .5, y = e.clientY / innerHeight - .5;
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() => {
            stone.style.translate = (x * -22).toFixed(1) + 'px ' + (y * -12).toFixed(1) + 'px';
            contact.style.translate = stone.style.translate;
            ivory.style.translate = (x * 7).toFixed(1) + 'px ' + (y * 4).toFixed(1) + 'px';
            table.style.translate = (x * 6).toFixed(1) + 'px 0';
          });
        }, { passive: true });
      }
    },

    c2() {
      // The explore links are stones 1-4 of a real diagonal; Chơi nhanh is the winning fifth.
      const links = [...R.more.querySelectorAll('a')];
      const stage = h('div', 'lx2-stage');
      const stoneAt = (col, row, cls, kid) => {
        const s = h(kid ? 'div' : 'span', 'lx2-pt ' + cls);
        s.style.setProperty('--x', col); s.style.setProperty('--y', row);
        if (kid) s.append(kid);
        stage.append(s);
        return s;
      };
      [[2, 7], [6, 2], [8, 3], [9, 1], [2, 4], [7, 8], [4, 6]].forEach(([c, r]) => stoneAt(c, r, 'lx2-foe'));
      links.forEach((a, i) => { a.classList.add('lx2-link'); stoneAt(1 + i, 1 + i, 'lx2-mine', a); });
      R.go.classList.add('lx2-go');
      stoneAt(5, 5, 'lx2-win', R.go);
      const title = h('h1', 'lx2-title', 'Năm quân.', h('br'), h('em', '', 'Một ván thắng.'));
      screen.prepend(h('div', 'lx-root lx2',
        h('div', 'lx-plate lx2-wood'), h('div', 'lx-plate lx2-shade'), stage,
        h('div', 'lx2-copy', hi(), title, notices(),
          h('div', 'lx2-opts', label('Ván của bạn'), options(), R.line),
          h('div', 'lx2-code', label('Vào phòng bằng mã'), R.code),
          h('div', 'lx2-now', R.board))));
    },

    c3() {
      const panel = (cls, ...kids) => {
        const p = h('section', 'lx3-panel ' + cls, h('div', 'lx3-in', ...kids));
        p.addEventListener('pointerenter', () => activate(p));
        p.addEventListener('focusin', () => activate(p));
        if (hover && !still) p.addEventListener('pointermove', (e) => p.style.setProperty('--mx', (e.clientX - p.getBoundingClientRect().left) + 'px'), { passive: true });
        return p;
      };
      const title = (tag, a, b) => h(tag, 'lx3-title', a, h('br'), h('em', '', b));
      const panels = [
        panel('is-open', hi(), title('h1', 'Chơi', 'nhanh'), notices(), options(), R.go, R.line),
        panel('', title('h2', 'Vào', 'phòng'), R.code),
        panel('', title('h2', 'Đang', 'diễn ra'), R.board, R.live, R.more),
      ];
      function activate(p) { panels.forEach((x) => x.classList.toggle('is-open', x === p)); }
      screen.prepend(h('div', 'lx-root lx3', h('div', 'lx-plate lx3-art'), ...panels));
    },
  };
  build[concept]();
})();
