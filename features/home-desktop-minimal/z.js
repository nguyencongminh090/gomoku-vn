/* Mockup only: moves the REAL Home nodes (listeners intact) into each concept, at desktop widths only. */
(function () {
  if (!matchMedia('(min-width: 861px)').matches) return;
  const concept = document.documentElement.dataset.z;
  const screen = document.getElementById('screen-home');
  if (!concept || !screen) return;
  document.body.classList.add('z', 'z-' + concept);
  const $ = (id) => document.getElementById(id);
  const q = (s) => document.querySelector(s);
  const R = { hello: $('home-hello'), news: $('home-news'), mine: $('home-mine-card'), chips: $('home-chips'), pick: $('qm-pick'), go: q('.hq-go'), play: $('qm-play'), chal: $('qm-challenge'), line: $('qm-line'), rooms: $('hub-rooms') };
  const SVG = 'http://www.w3.org/2000/svg';
  const h = (tag, cls, ...kids) => { const n = document.createElement(tag); if (cls) n.className = cls; n.append(...kids); return n; };
  const s = (tag, attrs) => { const n = document.createElementNS(SVG, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
  const hover = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const playText = R.play.querySelector('[data-i18n]');
  playText.removeAttribute('data-i18n'); playText.textContent = 'Chơi ngay'; playText.className = 'z-play__t';
  const icon = R.rooms.querySelector('svg');
  const liveNum = h('b'); liveNum.dataset.z = 'live';
  R.rooms.className = 'z-rooms';
  R.rooms.replaceChildren(h('span', 'z-rooms__t', 'Phòng chơi'), h('span', 'z-rooms__live', h('i'), liveNum, ' ván đang chơi'), icon);
  R.rooms.setAttribute('aria-label', 'Phòng chơi');
  R.hello.classList.add('z-hi');
  const sync = () => document.querySelectorAll('[data-z="live"]').forEach((n) => { n.textContent = $('home-s-live').textContent; });
  new MutationObserver(sync).observe($('home-s-live'), { childList: true, characterData: true, subtree: true }); sync();

  const opts = () => h('div', 'z-opts', h('div', 'z-pickwrap', R.pick, R.chips), R.chal);
  const notices = () => h('div', 'z-notices', R.news, R.mine);
  const title = (t, tag = 'h1') => { const n = h(tag, 'z-title'); n.innerHTML = t; return n; };
  const plate = (cls) => h('div', 'z-plate ' + cls);
  const mount = (cls, ...kids) => { const r = h('div', 'z-root ' + cls, ...kids); screen.prepend(r); return r; };

  // Decorative sample positions; the real live thumbnails come first where a concept shows them.
  function sampleBoard(seed) {
    const P = 12, N = 9, svg = s('svg', { viewBox: `0 0 ${N * P} ${N * P}`, 'aria-hidden': 'true' });
    let d = ''; for (let i = 0; i < N; i++) d += `M${i * P + 6} 6V${N * P - 6}M6 ${i * P + 6}H${N * P - 6}`;
    svg.append(s('path', { class: 'zg', d }));
    let v = seed * 7 + 3, x = 4, y = 4;
    for (let i = 0; i < 9 + seed % 5; i++) {
      v = (v * 31 + 11) % 97; x = Math.max(1, Math.min(7, x + (v % 3) - 1)); y = Math.max(1, Math.min(7, y + ((v >> 2) % 3) - 1));
      svg.append(s('circle', { class: i % 2 ? 'zw' : 'zb', cx: x * P + 6, cy: y * P + 6, r: 4.8 }));
    }
    return svg;
  }
  let cloneId = 0;
  const liveBoards = () => [...document.querySelectorAll('#home-live svg.hh-mini--real')].map((svg) => { const t = document.createElement('template'); const n = ++cloneId; t.innerHTML = svg.outerHTML.replace(/hm\d+/g, (m) => m + 'c' + n); return t.content.firstChild; });
  const mini = (node) => h('span', 'z-mini', node);
  function fillBoards(host, count) {
    const draw = () => { const live = liveBoards(); host.replaceChildren(...Array.from({ length: count }, (_, i) => mini(live[i] || sampleBoard(i + 1)))); };
    draw();
    let last = $('home-live').innerHTML;
    new MutationObserver(() => { if ($('home-live').innerHTML !== last) { last = $('home-live').innerHTML; draw(); } }).observe($('home-live'), { childList: true, subtree: true });
  }

  const build = {
    m1() {
      mount('z1', plate('z1-bg'),
        h('div', 'z1-stage', h('div', 'z1-corona'), R.rooms, R.go),
        h('div', 'z1-dock', h('div', 'z1-left', R.hello, notices()), h('div', 'z1-mid', opts(), R.line)));
    },
    m2() {
      const vb = s('svg', { class: 'z-plate z2-lines', 'aria-hidden': 'true' });
      const lineA = s('path', { pathLength: 1 }), lineB = s('path', { pathLength: 1 });
      const dotA = s('circle', { r: 30 }), dotB = s('circle', { r: 18 });
      vb.append(lineA, lineB, dotA, dotB);
      const pic = h('img', 'z-plate z2-photo'); pic.src = '/__min/assets/photo/touch.webp'; pic.alt = '';
      const spot = plate('z2-spot');
      const root = mount('z2', pic, spot, plate('z2-scrim'), vb, h('div', 'z2-copy', R.hello, title('Đến lượt<br><em>bạn.</em>'), notices(), opts(), R.line), R.go, R.rooms);
      const place = () => {
        const W = root.clientWidth, H = root.clientHeight, k = Math.max(W / 2000, H / 1333), ox = (W - 2000 * k) / 2, oy = (H - 1333 * k) / 2;
        const A = [1033 * 1 * k + ox, 697 * k + oy], B = [1448 * k + ox, 400 * k + oy];
        const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
        const pw = R.go.offsetWidth, ph = R.go.offsetHeight, rw = R.rooms.offsetWidth, rh = R.rooms.offsetHeight;
        const px = clamp(A[0] + W * .1, 24, W - pw - 28), py = clamp(A[1] - ph * .2, 90, H - ph - 30);
        const rx = clamp(B[0] + W * .045, 24, W - rw - 28), ry = clamp(B[1] - rh * 1.25, 84, py - rh - 34);
        R.go.style.translate = `${px}px ${py}px`; R.rooms.style.translate = `${rx}px ${ry}px`;
        vb.setAttribute('viewBox', `0 0 ${W} ${H}`);
        dotA.setAttribute('cx', A[0]); dotA.setAttribute('cy', A[1]); dotB.setAttribute('cx', B[0]); dotB.setAttribute('cy', B[1]);
        lineA.setAttribute('d', `M${A[0] + 30} ${A[1]}H${px}`.replace(/H.*/, `L${px} ${py + ph / 2}`));
        const endX = rx > B[0] ? rx : rx + rw / 2, endY = rx > B[0] ? ry + rh / 2 : ry + rh;
        lineB.setAttribute('d', `M${B[0]} ${B[1] - 18}L${endX} ${endY}`);
        root.style.setProperty('--ax', A[0] + 'px'); root.style.setProperty('--ay', A[1] + 'px'); root.style.setProperty('--bx', B[0] + 'px'); root.style.setProperty('--by', B[1] + 'px');
      };
      place(); addEventListener('resize', place); document.fonts.ready.then(place);
    },
    m3() {
      const stone = plate('z3-stone');
      const boards = h('span', 'z3-boards'); fillBoards(boards, 3);
      R.rooms.insertBefore(boards, R.rooms.lastChild);
      mount('z3', h('div', 'z3-top', R.hello, opts()), R.go, R.rooms, stone, h('div', 'z3-foot', R.line, notices()));
    },
    m4() {
      const inside = h('span', 'z4-boards'); fillBoards(inside, 2);
      R.rooms.prepend(inside);
      mount('z4', plate('z4-art'), plate('z4-mist'), plate('z4-mist z4-mist--b'),
        h('div', 'z4-head', R.hello, title('Bàn đã mở. <em>Mời bạn vào.</em>')),
        h('div', 'z4-doors', h('div', 'z4-door z4-door--play', R.go), h('div', 'z4-door z4-door--rooms', R.rooms)),
        h('div', 'z4-foot', notices(), opts(), R.line));
    },
    m5() {
      const W = 1600, H = 1000, A = { x: 545, y: 610, rx: 305, ry: 225, f: (t) => 1 + .07 * Math.sin(2 * t + .6) + .045 * Math.sin(3 * t + 2) }, B = { x: 1160, y: 345, rx: 212, ry: 160, f: (t) => 1 + .06 * Math.sin(2 * t + 2.4) + .05 * Math.sin(3 * t + .4) };
      const path = (p, d) => { let o = ''; for (let i = 0; i < 90; i++) { const t = i / 90 * Math.PI * 2, r = p.f(t); o += (i ? 'L' : 'M') + (p.x + (p.rx * r + d) * Math.cos(t)).toFixed(1) + ' ' + (p.y + (p.ry * r + d) * Math.sin(t)).toFixed(1); } return o + 'Z'; };
      const svg = s('svg', { class: 'z5-svg', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
      const defs = s('defs', {});
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy), nx = dx / L, ny = dy / L, tx = -ny, ty = nx, F = 4000;
      const half = (sg) => [[mx + tx * F, my + ty * F], [mx - tx * F, my - ty * F], [mx - tx * F + sg * nx * F, my - ty * F + sg * ny * F], [mx + tx * F + sg * nx * F, my + ty * F + sg * ny * F]].map((p) => p.map((v) => v.toFixed(0)).join(',')).join(' ');
      [['z5a', -1], ['z5b', 1]].forEach(([id, sg]) => { const c = s('clipPath', { id }); c.append(s('polygon', { points: half(sg) })); defs.append(c); });
      defs.innerHTML += '<radialGradient id="z5d" cx="36%" cy="28%" r="80%"><stop offset="0" stop-color="#4b443c"/><stop offset=".55" stop-color="#27221d"/><stop offset="1" stop-color="#14110e"/></radialGradient><radialGradient id="z5l" cx="36%" cy="28%" r="82%"><stop offset="0" stop-color="#fffdf7"/><stop offset=".62" stop-color="#efe6d6"/><stop offset="1" stop-color="#cfc2ac"/></radialGradient><filter id="z5s" x="-30%" y="-30%" width="170%" height="170%"><feDropShadow dx="-16" dy="24" stdDeviation="20" flood-color="#4d3a22" flood-opacity=".42"/></filter>';
      svg.append(defs);
      [[A, 'z5a'], [B, 'z5b']].forEach(([p, id]) => {
        const g = s('g', { 'clip-path': `url(#${id})`, class: 'z5-rings' });
        for (let i = 0; i < 52; i++) { const d = 20 + i * 21; g.append(s('path', { class: 'z5-hi', d: path(p, d), transform: 'translate(0 1.6)' }), s('path', { class: 'z5-lo', d: path(p, d) })); }
        svg.append(g);
      });
      const waveA = s('path', { class: 'z5-wave', d: path(A, 8) }), waveB = s('path', { class: 'z5-wave', d: path(B, 8) });
      svg.append(waveA, waveB, s('path', { d: path(A, 0), fill: 'url(#z5d)', filter: 'url(#z5s)' }), s('path', { d: path(B, 0), fill: 'url(#z5l)', filter: 'url(#z5s)' }));
      const stage = h('div', 'z5-stage', svg, R.go, R.rooms);
      const ripple = (el, w) => { const on = () => { w.classList.remove('is-on'); void w.getBoundingClientRect(); w.classList.add('is-on'); }; el.addEventListener('pointerenter', on); el.addEventListener('focusin', on); };
      ripple(R.go, waveA); ripple(R.rooms, waveB);
      mount('z5', plate('z5-sand'), stage, plate('z5-gobo'), h('div', 'z5-hi-wrap', R.hello, notices()), h('div', 'z5-foot', opts(), R.line));
    },
    m6() {
      const N = 14, ring = h('div', 'z6-ring'); fillBoards(ring, N);
      const root = mount('z6', plate('z6-bg'), h('div', 'z6-scene', ring),
        h('div', 'z6-centre', R.hello, title('Luôn có một bàn <em>đang chờ.</em>'), h('div', 'z6-cta', R.go, R.rooms), opts(), R.line), h('div', 'z6-notes', notices()));
      let angle = .22, speed = .07, want = .07, last = 0;
      const blurs = new Map();
      const draw = () => {
        const Rd = Math.min(root.clientWidth * .47, 720);
        [...ring.children].forEach((c, i) => {
          const a = angle + i / N * Math.PI * 2, x = Math.sin(a) * Rd, z = Math.cos(a) * Rd, d = (z + Rd) / (2 * Rd);
          c.style.transform = `translate3d(${x.toFixed(1)}px,0,${z.toFixed(1)}px) rotateY(${(Math.sin(a) * 34).toFixed(1)}deg)`;
          c.style.opacity = (.3 + .7 * d).toFixed(2);
          const b = Math.round((1 - d) * 8) / 2; if (blurs.get(c) !== b) { blurs.set(c, b); c.style.filter = b ? `blur(${b}px)` : 'none'; }
        });
      };
      const tick = (t) => { const dt = Math.min(.05, (t - last) / 1000 || 0); last = t; speed += (want - speed) * .05; angle -= speed * dt; draw(); requestAnimationFrame(tick); };
      draw(); new MutationObserver(draw).observe(ring, { childList: true }); addEventListener('resize', draw);
      if (!still) requestAnimationFrame(tick);
      if (hover) { R.rooms.addEventListener('pointerenter', () => { want = .34; root.classList.add('is-rooms'); }); R.rooms.addEventListener('pointerleave', () => { want = .07; root.classList.remove('is-rooms'); }); R.go.addEventListener('pointerenter', () => { want = .015; }); R.go.addEventListener('pointerleave', () => { want = .07; }); }
    },
    m7() {
      const layer = h('div', 'z7-stones'), ghost = h('i', 'z7-stone z7-ghost');
      const head = h('div', 'z7-head', R.hello, title('Trang này là bàn cờ.<br><em>Cứ đặt thử.</em>'));
      const foot = h('div', 'z7-foot', opts(), R.line), notes = notices(); notes.classList.add('z7-notes');
      const root = mount('z7', plate('z7-wood'), plate('z7-grid'), layer, ghost, head, R.go, R.rooms, foot, notes);
      let C = 60, X0 = 0, Y0 = 0; const stones = new Map(); let black = true;
      const put = (col, row, isBlack, quiet) => { const k = col + ',' + row; if (stones.has(k)) return false; const n = h('i', 'z7-stone ' + (isBlack ? 'is-b' : 'is-w') + (quiet ? '' : ' is-new')); n.dataset.c = col; n.dataset.r = row; pos(n, col, row); layer.append(n); stones.set(k, isBlack); return true; };
      const pos = (n, c, r) => { n.style.translate = `${X0 + c * C}px ${Y0 + r * C}px`; };
      const box = (el, c, r, w, ht) => { el.style.translate = `${X0 + c * C}px ${Y0 + r * C}px`; el.style.width = w * C + 'px'; el.style.height = ht * C + 'px'; };
      const layout = () => {
        const W = root.clientWidth, H = root.clientHeight; C = Math.floor(Math.min(W / 24, H / 15)); X0 = Math.round((W - 24 * C) / 2); Y0 = Math.round((H - 15 * C) / 2);
        root.style.setProperty('--c', C + 'px'); root.style.setProperty('--x0', X0 + 'px'); root.style.setProperty('--y0', Y0 + 'px');
        box(head, 2, 3, 11, 3); box(R.go, 2, 7, 8, 4); box(R.rooms, 11, 8, 6, 3); box(foot, 2, 12, 13, 2); box(notes, 18, 10, 5, 3);
        layer.querySelectorAll('.z7-stone').forEach((n) => pos(n, +n.dataset.c, +n.dataset.r));
      };
      layout(); addEventListener('resize', layout);
      [[19, 5, 1], [20, 6, 0], [20, 5, 1], [21, 6, 1], [19, 7, 0], [21, 4, 0], [18, 6, 0], [20, 7, 1], [18, 8, 1], [21, 8, 0]].forEach(([c, r, b]) => put(c, r, !!b, true));
      const free = (e) => !e.target.closest('a, button, input, ul, .z-notices, .pnav');
      const cell = (e) => { const b = root.getBoundingClientRect(); return [Math.round((e.clientX - b.left - X0) / C), Math.round((e.clientY - b.top - Y0) / C)]; };
      const onTile = (c, r) => (c >= 2 && c <= 10 && r >= 7 && r <= 11) || (c >= 11 && c <= 17 && r >= 8 && r <= 11);
      if (hover) root.addEventListener('pointermove', (e) => { const [c, r] = cell(e); const ok = free(e) && r >= 1 && !onTile(c, r) && !stones.has(c + ',' + r); ghost.classList.toggle('is-on', ok); ghost.classList.toggle('is-b', black); ghost.classList.toggle('is-w', !black); if (ok) pos(ghost, c, r); });
      root.addEventListener('pointerleave', () => ghost.classList.remove('is-on'));
      root.addEventListener('click', (e) => { if (!free(e)) return; const [c, r] = cell(e); if (r < 1 || onTile(c, r) || !put(c, r, black)) return; black = !black; ghost.classList.remove('is-on'); });
    },
    m8() {
      const P = [[72, 0], [70.6, 6], [71.2, 11], [69.4, 17], [70.5, 24], [67.8, 31], [68.3, 37], [65.6, 44], [66.8, 51], [63.9, 57], [64.4, 63], [61, 70], [61.9, 78], [59.2, 86], [59.7, 92], [57.4, 100]];
      const seam = P.map(([x, y]) => `${x}% ${y}%`).join(',');
      const svg = s('svg', { class: 'z-plate z8-seam', 'aria-hidden': 'true' });
      const paths = ['z8-shade', 'z8-glow', 'z8-core', 'z8-run'].map((c) => s('path', { class: c, pathLength: 1 }));
      svg.append(...paths);
      const root = mount('z8', R.go, R.rooms, svg, h('div', 'z8-ui z8-top', R.hello, notices()), h('div', 'z8-ui z8-foot', opts(), R.line));
      root.style.setProperty('--cl', `polygon(0 0,${seam},0 100%)`);
      root.style.setProperty('--cr', `polygon(${seam},100% 100%,100% 0)`);
      const draw = () => { const W = root.clientWidth, H = root.clientHeight; svg.setAttribute('viewBox', `0 0 ${W} ${H}`); const d = 'M' + P.map(([x, y]) => `${(x * W / 100).toFixed(1)} ${(y * H / 100).toFixed(1)}`).join('L'); paths.forEach((p) => p.setAttribute('d', d)); };
      draw(); addEventListener('resize', draw);
    },
    m9() {
      const stones = h('div', 'z9-stones');
      const root = mount('z9', plate('z9-wood'), h('div', 'z-plate z9-hidden', plate('z9-grid'), stones), plate('z9-shade'),
        h('div', 'z9-head', R.hello, title('Bàn vẫn <em>sáng đèn.</em>'), notices()),
        h('div', 'z9-line', R.go, h('i', 'z9-rule'), R.rooms), h('div', 'z9-foot', opts(), R.line));
      let x = 0, y = 0, tx = 0, ty = 0, raf = 0;
      const apply = () => { root.style.setProperty('--lx', x.toFixed(1) + 'px'); root.style.setProperty('--ly', y.toFixed(1) + 'px'); };
      const centre = (el) => { const a = el.getBoundingClientRect(), b = root.getBoundingClientRect(); return [a.left - b.left + a.width / 2, a.top - b.top + a.height / 2]; };
      const step = () => { x += (tx - x) * .085; y += (ty - y) * .085; apply(); raf = Math.abs(tx - x) + Math.abs(ty - y) > .6 ? requestAnimationFrame(step) : 0; };
      const aim = (a, b) => { tx = a; ty = b; if (still) { x = a; y = b; apply(); } else if (!raf) raf = requestAnimationFrame(step); };
      const rest = () => aim(...centre(R.go));
      const layout = () => {
        const W = root.clientWidth, H = root.clientHeight, C = Math.round(H / 13), X0 = (W % C) / 2, Y0 = (H % C) / 2;
        root.style.setProperty('--c', C + 'px'); root.style.setProperty('--x0', X0 + 'px'); root.style.setProperty('--y0', Y0 + 'px');
        let v = 17; const seen = new Set(), out = [];
        for (let i = 0; i < 40; i++) { v = (v * 73 + 41) % 1009; const c = 2 + v % Math.max(1, Math.floor(W / C) - 3); v = (v * 73 + 41) % 1009; const r = 4 + v % 8, k = c + ',' + r; if (seen.has(k)) continue; seen.add(k); const n = h('i', out.length % 2 ? 'is-w' : 'is-b'); n.style.translate = `${X0 + c * C}px ${Y0 + r * C}px`; out.push(n); }
        stones.replaceChildren(...out);
        [x, y] = centre(R.go); tx = x; ty = y; apply();
      };
      layout(); addEventListener('resize', layout); document.fonts.ready.then(layout);
      [R.go, R.rooms].forEach((el) => { el.addEventListener('pointerenter', () => aim(...centre(el))); el.addEventListener('focusin', () => aim(...centre(el))); });
      R.rooms.addEventListener('focusout', rest);
      if (hover && !still) { root.addEventListener('pointermove', (e) => { if (e.target.closest('.hq-go, #hub-rooms')) return; const b = root.getBoundingClientRect(), H = b.height; aim(e.clientX - b.left, Math.max(H * .36, Math.min(H * .84, e.clientY - b.top))); }); root.addEventListener('pointerleave', rest); }
    },
    m10() {
      const stones = h('div', 'z10-stones', ...['b', 'w', 'b', 'b', 'w'].map((c) => h('i', 'is-' + c)));
      mount('z10', plate('z10-wall'), plate('z10-floor'),
        h('div', 'z10-head', R.hello, title('Kéo ra là <em>có ván.</em>')), h('div', 'z10-notes', notices()),
        h('div', 'z10-board', stones, h('div', 'z10-slab', R.go, R.rooms), h('div', 'z10-legs', h('i'), h('i'), h('i'))),
        h('div', 'z10-foot', opts(), R.line));
    },
    m11() {
      const stone = (c, l, t, w) => { const n = h('img', 'z11-stone'); n.src = `/__min/assets/m1/stone-${c}.webp`; n.alt = ''; n.style.cssText = `left:${l}%;top:${t}%;width:${w}%`; return n; };
      const pitA = h('div', 'z11-pit', stone('black', 1, 8, 8), stone('ivory', 8, 2, 7.4), stone('black', 14, 16, 8), stone('ivory', 3, 44, 7.6), stone('black', 10, 40, 8.2), stone('ivory', 17, 52, 7.4), stone('black', 2, 72, 7.8), stone('ivory', 11, 74, 7.6));
      const pitB = h('div', 'z11-pit z11-pit--b'); fillBoards(pitB, 2);
      mount('z11', plate('z11-table'), h('div', 'z11-head', R.hello, notices()),
        h('div', 'z11-box', h('div', 'z11-slot z11-slot--a', pitA, R.go), h('div', 'z11-slot z11-slot--b', pitB, R.rooms)),
        h('div', 'z11-foot', opts(), R.line));
    },
    m12() {
      const sign = (cls, node) => h('div', 'z12-hang ' + cls, h('i', 'z12-rope'), h('i', 'z12-rope z12-rope--r'), node);
      mount('z12', plate('z12-wall'), plate('z12-beam'), sign('z12-a', R.go), sign('z12-b', R.rooms),
        h('div', 'z12-foot', h('div', 'z12-note', R.hello, notices()), h('div', 'z12-ctl', opts(), R.line)));
    },
    m13() {
      const IW = 2560, IH = 1600, A = [.36, .525, .32], B = [.72, .37, .19];
      const pic = h('img', 'z-plate z13-pic'); pic.src = '/__min/assets/m13/bowls.webp'; pic.alt = '';
      const root = mount('z13', pic, plate('z13-dim z13-dim--a'), plate('z13-dim z13-dim--b'), h('div', 'z13-head', R.hello, title('Bốc một quân, <em>ván bắt đầu.</em>')), h('div', 'z13-notes', notices()), R.go, R.rooms, h('div', 'z13-foot', opts(), R.line));
      const place = () => {
        const W = root.clientWidth, H = root.clientHeight, k = Math.max(W / IW, H / IH), ox = (W - IW * k) / 2, oy = (H - IH * k) / 2;
        [['a', A], ['b', B]].forEach(([n, p]) => { root.style.setProperty(`--${n}x`, (p[0] * IW * k + ox).toFixed(1) + 'px'); root.style.setProperty(`--${n}y`, (p[1] * IH * k + oy).toFixed(1) + 'px'); root.style.setProperty(`--${n}r`, (p[2] * IH * k).toFixed(1) + 'px'); });
      };
      place(); addEventListener('resize', place);
    },
  };
  build[concept]();
})();
