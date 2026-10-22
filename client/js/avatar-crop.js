/**
 * avatar-crop.js — avatar editor modal (B211 follow-up): pick a photo, drag to move, zoom, then crop to a
 * square on a canvas. Resolves with a Blob for POST /api/profile/avatar (the server still resizes to 256×256),
 * or null when cancelled. The pure geometry lives in AvatarCrop.math so it is unit-testable without a canvas.
 * Touch: drag to move, two-finger pinch to zoom around the fingers. Rotate in 90° steps (buttons or R / Shift+R).
 * Builds DOM with textContent only. Keyboard: arrows move, +/- zoom, R rotates, Enter saves, Escape cancels.
 */
(function (root) {
  'use strict';

  const VIEW = 280;        // CSS px of the square viewport
  const WIDE_VIEW = 640;   // CSS px width of the viewport for wide (banner) crops
  const OUT = 512;         // exported edge in px
  const MAX_ZOOM = 4;      // × the "cover" scale
  const MAX_BYTES = 2 * 1024 * 1024; // server limit (routes/profile.js)

  /** Viewport size: a number = square, else {w, h} (banner editor). */
  const dim = (v) => (typeof v === 'number' ? { w: v, h: v } : v);

  /** Pure geometry. `st` = { w, h, s, x, y }: source size, px-per-source-px, image top-left in viewport px. */
  const math = {
    minScale(w, h, view = VIEW) { const d = dim(view); return Math.max(d.w / w, d.h / h); },
    clamp(st, view = VIEW) {
      const d = dim(view);
      const x = Math.min(0, Math.max(d.w - st.w * st.s, st.x));
      const y = Math.min(0, Math.max(d.h - st.h * st.s, st.y));
      return { ...st, x, y };
    },
    /** Start state: cover-fit, centred. */
    init(w, h, view = VIEW) {
      const d = dim(view);
      const s = math.minScale(w, h, view);
      return math.clamp({ w, h, s, x: (d.w - w * s) / 2, y: (d.h - h * s) / 2 }, view);
    },
    /** Zoom to `level` (1 … MAX_ZOOM × cover) keeping the viewport point (px, py) fixed (pinch centre). */
    zoomAt(st, level, px, py, view = VIEW) {
      const base = math.minScale(st.w, st.h, view);
      const s = base * Math.min(MAX_ZOOM, Math.max(1, level));
      return math.clamp({ ...st, s, x: px - (px - st.x) * (s / st.s), y: py - (py - st.y) * (s / st.s) }, view);
    },
    /** Zoom keeping the viewport centre fixed. */
    zoom(st, level, view = VIEW) { const d = dim(view); return math.zoomAt(st, level, d.w / 2, d.h / 2, view); },
    move: (st, dx, dy, view = VIEW) => math.clamp({ ...st, x: st.x + dx, y: st.y + dy }, view),
    /** Source rectangle that the viewport shows (`size` = its width, for square callers). */
    cropRect(st, view = VIEW) {
      const d = dim(view);
      return { sx: -st.x / st.s, sy: -st.y / st.s, size: d.w / st.s, sw: d.w / st.s, sh: d.h / st.s };
    },
    level: (st, view = VIEW) => st.s / math.minScale(st.w, st.h, view),
  };

  const t = (key) => (typeof root.t === 'function' ? root.t(key) : key);

  function el(tag, text, cls) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }

  /**
   * Default decoder. The server CSP is `img-src 'self' data:`, so a blob: URL into <img> is refused —
   * decode the File directly (createImageBitmap applies EXIF orientation), else go through a data: URL.
   */
  async function decode(file) {
    if (typeof root.createImageBitmap === 'function') {
      try {
        const bmp = await root.createImageBitmap(file);
        return { width: bmp.width, height: bmp.height, source: bmp };
      } catch (_) { /* fall through to the data: URL path */ }
    }
    const url = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(new Error('read'));
      fr.readAsDataURL(file);
    });
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight, source: img });
      img.onerror = () => reject(new Error('decode'));
      img.src = url;
    });
  }

  /** `img` turned 90° (cw or ccw) onto a canvas; the editor then treats the canvas as the new source. */
  function rotate90(img, cw) {
    const c = document.createElement('canvas');
    c.width = img.height;
    c.height = img.width;
    const g = c.getContext('2d');
    g.translate(c.width / 2, c.height / 2);
    g.rotate((cw ? 1 : -1) * Math.PI / 2);
    g.drawImage(img.source, -img.width / 2, -img.height / 2);
    return { width: c.width, height: c.height, source: c };
  }

  function toBlob(canvas, type, q) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, q));
  }

  /** webp if the browser can encode it, else png; jpeg when that would exceed the server limit. */
  async function encode(canvas) {
    let blob = await toBlob(canvas, 'image/webp', 0.92);
    if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/png');
    if (!blob || blob.size > MAX_BYTES) blob = await toBlob(canvas, 'image/jpeg', 0.9);
    return blob;
  }

  /**
   * @param {File} file
   * @param {{decode?: Function, aspect?: number, outWidth?: number, titleKey?: string}} [opts]
   *   aspect = viewport width/height (1 = avatar; 4 = club banner, a wider dialog); outWidth = exported width px.
   * @returns {Promise<Blob|null>} cropped image, or null if cancelled / unreadable (onError called)
   */
  async function open(file, opts = {}) {
    let img;
    try {
      img = await (opts.decode || decode)(file);
    } catch (_) {
      if (opts.onError) opts.onError(t('avatar.crop_load_error'));
      return null;
    }
    const aspect = opts.aspect || 1;
    const V = aspect > 1 ? { w: WIDE_VIEW, h: Math.round(WIDE_VIEW / aspect) } : { w: VIEW, h: Math.round(VIEW / aspect) };
    const outW = opts.outWidth || OUT;
    const M = {
      init: (w, h) => math.init(w, h, V),
      level: (a) => math.level(a, V),
      zoom: (a, l) => math.zoom(a, l, V),
      zoomAt: (a, l, x, y) => math.zoomAt(a, l, x, y, V),
      move: (a, dx, dy) => math.move(a, dx, dy, V),
      cropRect: (a) => math.cropRect(a, V),
    };
    return new Promise((resolve) => {
      let st = M.init(img.width, img.height); // `img` is reassigned by rotation
      const prevFocus = document.activeElement;

      const overlay = el('div', undefined, 'pcrop');
      const dlg = el('div', undefined, 'pcrop__dlg' + (aspect > 1 ? ' pcrop__dlg--wide' : ''));
      dlg.setAttribute('role', 'dialog');
      dlg.setAttribute('aria-modal', 'true');
      dlg.setAttribute('aria-labelledby', 'pcrop-title');
      const title = el('h2', t(opts.titleKey || 'avatar.crop_title'), 'ph2');
      title.id = 'pcrop-title';
      const view = el('div', undefined, 'pcrop__view');
      view.style.aspectRatio = V.w + ' / ' + V.h;
      view.tabIndex = 0;
      view.setAttribute('aria-label', t('avatar.crop_hint'));
      const canvas = document.createElement('canvas');
      canvas.width = V.w;
      canvas.height = V.h;
      const ring = el('div', undefined, 'pcrop__ring' + (aspect === 1 ? '' : ' pcrop__ring--rect'));
      view.append(canvas, ring);
      const hint = el('p', t('avatar.crop_hint'), 'pnote');
      const zoom = document.createElement('input');
      zoom.type = 'range'; zoom.min = '1'; zoom.max = String(MAX_ZOOM); zoom.step = '0.01'; zoom.value = '1';
      zoom.className = 'pcrop__zoom';
      zoom.setAttribute('aria-label', t('avatar.zoom'));
      const zoomRow = el('label', undefined, 'pcrop__zoomrow');
      zoomRow.append(el('span', t('avatar.zoom')), zoom);
      const tools = el('div', undefined, 'pcrop__tools');
      const rotBtn = (icon, key) => {
        const b = el('button', undefined, 'pcrop__rot');
        if (window.PlatformShell && window.PlatformShell.icon) b.appendChild(window.PlatformShell.icon(icon));
        b.type = 'button';
        b.title = t(key);
        b.setAttribute('aria-label', t(key));
        tools.appendChild(b);
        return b;
      };
      const rotL = rotBtn('ph-regular-arrow-arc-left', 'avatar.rotate_left');
      const rotR = rotBtn('ph-regular-arrow-arc-right', 'avatar.rotate_right');
      const save = el('button', t('avatar.crop_save'), 'pbtn pbtn--primary');
      save.type = 'button';
      const cancel = el('button', t('avatar.crop_cancel'), 'pbtn pbtn--ghost');
      cancel.type = 'button';
      dlg.append(title, view, hint, tools, zoomRow, el('div', undefined, 'pform__row pcrop__actions'));
      dlg.lastChild.append(save, cancel);
      overlay.appendChild(dlg);
      document.body.appendChild(overlay);

      function draw() {
        const g = canvas.getContext('2d');
        if (!g) return;
        g.fillStyle = '#000';
        g.fillRect(0, 0, V.w, V.h);
        g.drawImage(img.source, st.x, st.y, img.width * st.s, img.height * st.s);
        zoom.value = String(M.level(st));
      }

      function turn(cw) {
        img = rotate90(img, cw);
        st = M.init(img.width, img.height);
        draw();
      }

      function close(result) {
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
        if (prevFocus && prevFocus.focus) prevFocus.focus();
        resolve(result);
      }

      async function commit() {
        save.disabled = true;
        const { sx, sy, sw, sh } = M.cropRect(st);
        const out = document.createElement('canvas');
        out.width = outW;
        out.height = Math.round(outW * V.h / V.w);
        const g = out.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(img.source, sx, sy, sw, sh, 0, 0, out.width, out.height);
        const blob = await encode(out);
        close(blob || null);
      }

      function onKey(e) {
        if (!overlay.isConnected) return;
        const step = e.shiftKey ? 30 : 10;
        const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
        if (e.key === 'Escape') { e.preventDefault(); close(null); }
        else if (e.key === 'Enter' && document.activeElement !== cancel) { e.preventDefault(); commit(); }
        else if (moves[e.key] && document.activeElement === view) { e.preventDefault(); st = M.move(st, ...moves[e.key]); draw(); }
        else if ((e.key === '+' || e.key === '=') && document.activeElement === view) { st = M.zoom(st, M.level(st) + 0.2); draw(); }
        else if (e.key === '-' && document.activeElement === view) { st = M.zoom(st, M.level(st) - 0.2); draw(); }
        else if ((e.key === 'r' || e.key === 'R') && document.activeElement === view) { e.preventDefault(); turn(!e.shiftKey); }
        else if (e.key === 'Tab') { // keep focus inside the dialog
          const f = [view, rotL, rotR, zoom, save, cancel];
          const i = f.indexOf(document.activeElement);
          const next = f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length];
          e.preventDefault();
          next.focus();
        }
      }

      // Pointers on the viewport: one = drag to move, two = pinch (zoom about the midpoint, plus pan with it).
      const pointers = new Map();
      let pinch = null;
      const span = () => { const [a, b] = [...pointers.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
      const toView = (x, y) => { // client px → viewport px (the viewport may be CSS-shrunk below VIEW)
        const r = view.getBoundingClientRect();
        const k = r.width ? V.w / r.width : 1;
        return { x: (x - r.left) * k, y: (y - r.top) * k, k };
      };
      view.addEventListener('pointerdown', (e) => {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (view.setPointerCapture) view.setPointerCapture(e.pointerId);
        view.classList.add('is-drag');
        if (pointers.size === 2) { const sp = span(); pinch = { d: sp.d || 1, level: M.level(st), x: sp.x, y: sp.y }; }
      });
      view.addEventListener('pointermove', (e) => {
        const p = pointers.get(e.pointerId);
        if (!p) return;
        const dx = e.clientX - p.x;
        const dy = e.clientY - p.y;
        p.x = e.clientX;
        p.y = e.clientY;
        if (pointers.size === 2 && pinch) {
          const sp = span();
          const c = toView(sp.x, sp.y);
          st = M.zoomAt(st, pinch.level * (sp.d / pinch.d), c.x, c.y);
          st = M.move(st, (sp.x - pinch.x) * c.k, (sp.y - pinch.y) * c.k);
          pinch.x = sp.x;
          pinch.y = sp.y;
        } else if (pointers.size === 1) {
          st = M.move(st, dx, dy);
        }
        draw();
      });
      const end = (e) => {
        pointers.delete(e.pointerId);
        pinch = null;
        if (!pointers.size) view.classList.remove('is-drag');
      };
      view.addEventListener('pointerup', end);
      view.addEventListener('pointercancel', end);
      view.addEventListener('wheel', (e) => {
        e.preventDefault();
        st = M.zoom(st, M.level(st) * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
        draw();
      }, { passive: false });
      zoom.addEventListener('input', () => { st = M.zoom(st, parseFloat(zoom.value)); draw(); });
      rotL.addEventListener('click', () => turn(false));
      rotR.addEventListener('click', () => turn(true));
      save.addEventListener('click', commit);
      cancel.addEventListener('click', () => close(null));
      overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) close(null); });
      document.addEventListener('keydown', onKey, true);
      draw();
      view.focus();
    });
  }

  root.AvatarCrop = { open, math, VIEW, OUT, MAX_ZOOM };
})(typeof window !== 'undefined' ? window : globalThis);
