/**
 * #424 "Một ngọn đèn": the desktop Home table (≥861px). One lamp lights the wood; the board grid and the
 * decorative stones exist only inside its light. The stones never move, only the light does.
 *
 * Every frame changes `transform` on a few layers and nothing else, so a lamp move repaints nothing:
 * .hl-win is the round window (it moves with the lamp), .hl-under holds the board and moves the opposite way
 * so the board stays still, .hl-pool is the falloff and the four .hl-d plates are the dark around it.
 */

export const LAMP_MQ = '(min-width: 861px)';
const FOLLOW = 0.085;     // share of the remaining distance covered per frame
const SETTLED_PX = 0.6;
const ROWS = 13;          // grid rows that fit the table height
const STONE_TRIES = 40;
const CONTROLS = '#qm-play, #qm-search, #hub-rooms';

export function lampCell(height) { return Math.max(1, Math.round(height / ROWS)); }

/** Grid offset that centres the leftover pixels on both axes. */
export function lampOrigin(width, height, cell) { return { x: (width % cell) / 2, y: (height % cell) / 2 }; }

/** The pointer steers the lamp along the table band, so the heading above it stays in the dark. */
export function clampLampY(y, height) { return Math.max(height * 0.36, Math.min(height * 0.84, y)); }

/** Fixed sample position: same layout on every load, one stone per intersection, colours alternate. */
export function lampStones(width, height, cell) {
  const columns = Math.max(1, Math.floor(width / cell) - 3);
  const seen = new Set();
  const stones = [];
  let v = 17;
  for (let i = 0; i < STONE_TRIES; i++) {
    v = (v * 73 + 41) % 1009;
    const col = 2 + (v % columns);
    v = (v * 73 + 41) % 1009;
    const row = 4 + (v % 8);
    const key = col + ',' + row;
    if (seen.has(key) || row * cell >= height) continue;
    seen.add(key);
    stones.push({ col, row, black: stones.length % 2 === 0 });
  }
  return stones;
}

/** Nearest whole device pixel, in CSS px. */
export function snapToDevice(value, dpr = 1) { return Math.round(value * dpr) / dpr; }

/** Whole device pixels, so neighbouring plates never open a hairline or double up their alpha at 125% or 150% zoom. */
export function lampTransforms(lampX, lampY, radius, dpr = 1) {
  const x = snapToDevice(lampX, dpr);
  const y = snapToDevice(lampY, dpr);
  const at = (a, b) => `translate3d(${a}px, ${b}px, 0)`;
  return {
    window: at(x, y),
    under: at(-x, -y),
    top: at(0, y - radius),
    bottom: at(0, y + radius),
    left: at(x - radius, y - radius),
    right: at(x + radius, y - radius),
  };
}

export function mountLamp(doc = document, win = window) {
  const scene = doc.getElementById('home-lamp');
  const home = doc.getElementById('screen-home');
  if (!scene || !home) return null;
  const q = (s) => scene.querySelector(s);
  const parts = { window: q('.hl-win'), under: q('.hl-under'), top: q('.hl-d--t'), bottom: q('.hl-d--b'), left: q('.hl-d--l'), right: q('.hl-d--r'), pool: q('.hl-pool') };
  const stonesHost = q('.hl-stones');
  const desktop = win.matchMedia(LAMP_MQ);
  const still = win.matchMedia('(prefers-reduced-motion: reduce)');
  const canHover = win.matchMedia('(hover: hover) and (pointer: fine)');
  let x = 0, y = 0, targetX = 0, targetY = 0, radius = 0, frame = 0, width = 0, height = 0;

  const paint = () => {
    const t = lampTransforms(x, y, radius, win.devicePixelRatio || 1);
    parts.window.style.transform = t.window;
    parts.pool.style.transform = t.window;
    parts.under.style.transform = t.under;
    parts.top.style.transform = t.top;
    parts.bottom.style.transform = t.bottom;
    parts.left.style.transform = t.left;
    parts.right.style.transform = t.right;
  };
  const step = () => {
    x += (targetX - x) * FOLLOW;
    y += (targetY - y) * FOLLOW;
    if (Math.abs(targetX - x) + Math.abs(targetY - y) <= SETTLED_PX) { x = targetX; y = targetY; frame = 0; } else frame = win.requestAnimationFrame(step);
    paint();
  };
  const aim = (nextX, nextY) => {
    targetX = nextX;
    targetY = nextY;
    if (still.matches) { x = nextX; y = nextY; paint(); } else if (!frame) frame = win.requestAnimationFrame(step);
  };
  const centre = (node) => {
    const a = node.getBoundingClientRect();
    const b = home.getBoundingClientRect();
    return [a.left - b.left + a.width / 2, a.top - b.top + a.height / 2];
  };
  const restNode = () => { const play = doc.getElementById('qm-play'); return play && !play.hidden ? play : doc.getElementById('qm-search'); };
  const rest = () => { const n = restNode(); if (n) aim(...centre(n)); };

  const layout = () => {
    if (!desktop.matches) return;
    const w = home.clientWidth;
    const h = home.clientHeight;
    if (!w || !h) return; // Home is hidden behind another tab: lay out when it comes back
    if (w === width && h === height) return;
    width = w;
    height = h;
    scene.classList.add('is-lit'); // the window has no size until it is displayed
    scene.style.removeProperty('--hl-lamp');
    radius = snapToDevice(parts.window.offsetWidth / 2, win.devicePixelRatio || 1);
    scene.style.setProperty('--hl-lamp', radius + 'px');
    const cell = lampCell(h);
    const origin = lampOrigin(w, h, cell);
    scene.style.setProperty('--hl-cell', cell + 'px');
    scene.style.setProperty('--hl-x0', origin.x + 'px');
    scene.style.setProperty('--hl-y0', origin.y + 'px');
    parts.under.style.width = w + 'px';
    parts.under.style.height = h + 'px';
    stonesHost.replaceChildren(...lampStones(w, h, cell).map((s) => {
      const n = doc.createElement('i');
      n.className = s.black ? 'is-b' : 'is-w';
      n.style.transform = `translate(${origin.x + s.col * cell}px, ${origin.y + s.row * cell}px)`;
      return n;
    }));
    const n = restNode();
    if (n) { [x, y] = centre(n); targetX = x; targetY = y; }
    paint();
  };

  home.addEventListener('pointermove', (e) => {
    if (!desktop.matches || still.matches || !canHover.matches) return;
    const control = e.target.closest && e.target.closest(CONTROLS);
    if (control) { aim(...centre(control)); return; }
    const b = home.getBoundingClientRect();
    aim(e.clientX - b.left, clampLampY(e.clientY - b.top, b.height));
  });
  home.addEventListener('pointerleave', () => { if (desktop.matches) rest(); });
  home.addEventListener('focusin', (e) => {
    const control = desktop.matches && e.target.closest && e.target.closest(CONTROLS);
    if (control) aim(...centre(control));
  });
  home.addEventListener('focusout', (e) => { if (desktop.matches && e.target.closest && e.target.closest(CONTROLS)) rest(); });

  if (win.ResizeObserver) new win.ResizeObserver(layout).observe(home);
  win.addEventListener('resize', layout);
  if (desktop.addEventListener) desktop.addEventListener('change', layout);
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(() => { width = 0; layout(); });
  layout();
  return { layout };
}

if (typeof document !== 'undefined' && document.getElementById('home-lamp')) mountLamp();
