/**
 * avatar-crop.js — avatar editor modal (B211 follow-up): pick a photo, drag to move, zoom, then crop to a
 * square on a canvas. Resolves with a Blob for POST /api/profile/avatar (the server still resizes to 256×256),
 * or null when cancelled. The pure geometry lives in AvatarCrop.math so it is unit-testable without a canvas.
 * Builds DOM with textContent only. Keyboard: arrows move, +/- zoom, Enter saves, Escape cancels.
 */
(function (root) {
  'use strict';

  const VIEW = 280;        // CSS px of the square viewport
  const OUT = 512;         // exported edge in px
  const MAX_ZOOM = 4;      // × the "cover" scale
  const MAX_BYTES = 2 * 1024 * 1024; // server limit (routes/profile.js)

  /** Pure geometry. `st` = { w, h, s, x, y }: source size, px-per-source-px, image top-left in viewport px. */
  const math = {
    minScale: (w, h, view = VIEW) => view / Math.min(w, h),
    clamp(st, view = VIEW) {
      const x = Math.min(0, Math.max(view - st.w * st.s, st.x));
      const y = Math.min(0, Math.max(view - st.h * st.s, st.y));
      return { ...st, x, y };
    },
    /** Start state: cover-fit, centred. */
    init(w, h, view = VIEW) {
      const s = math.minScale(w, h, view);
      return math.clamp({ w, h, s, x: (view - w * s) / 2, y: (view - h * s) / 2 }, view);
    },
    /** Zoom to `level` (1 … MAX_ZOOM × cover) keeping the viewport centre fixed. */
    zoom(st, level, view = VIEW) {
      const base = math.minScale(st.w, st.h, view);
      const s = base * Math.min(MAX_ZOOM, Math.max(1, level));
      const c = view / 2;
      return math.clamp({ ...st, s, x: c - (c - st.x) * (s / st.s), y: c - (c - st.y) * (s / st.s) }, view);
    },
    move: (st, dx, dy, view = VIEW) => math.clamp({ ...st, x: st.x + dx, y: st.y + dy }, view),
    /** Source-pixel square that the viewport shows. */
    cropRect: (st, view = VIEW) => ({ sx: -st.x / st.s, sy: -st.y / st.s, size: view / st.s }),
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
   * @param {{decode?: Function}} [opts]
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
    return new Promise((resolve) => {
      let st = math.init(img.width, img.height);
      const prevFocus = document.activeElement;

      const overlay = el('div', undefined, 'pcrop');
      const dlg = el('div', undefined, 'pcrop__dlg');
      dlg.setAttribute('role', 'dialog');
      dlg.setAttribute('aria-modal', 'true');
      dlg.setAttribute('aria-labelledby', 'pcrop-title');
      const title = el('h2', t('avatar.crop_title'), 'ph2');
      title.id = 'pcrop-title';
      const view = el('div', undefined, 'pcrop__view');
      view.tabIndex = 0;
      view.setAttribute('aria-label', t('avatar.crop_hint'));
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = VIEW;
      const ring = el('div', undefined, 'pcrop__ring');
      view.append(canvas, ring);
      const hint = el('p', t('avatar.crop_hint'), 'pnote');
      const zoom = document.createElement('input');
      zoom.type = 'range'; zoom.min = '1'; zoom.max = String(MAX_ZOOM); zoom.step = '0.01'; zoom.value = '1';
      zoom.className = 'pcrop__zoom';
      zoom.setAttribute('aria-label', t('avatar.zoom'));
      const zoomRow = el('label', undefined, 'pcrop__zoomrow');
      zoomRow.append(el('span', t('avatar.zoom')), zoom);
      const save = el('button', t('avatar.crop_save'), 'pbtn pbtn--primary');
      save.type = 'button';
      const cancel = el('button', t('avatar.crop_cancel'), 'pbtn pbtn--ghost');
      cancel.type = 'button';
      dlg.append(title, view, hint, zoomRow, el('div', undefined, 'pform__row pcrop__actions'));
      dlg.lastChild.append(save, cancel);
      overlay.appendChild(dlg);
      document.body.appendChild(overlay);

      function draw() {
        const g = canvas.getContext('2d');
        if (!g) return;
        g.fillStyle = '#000';
        g.fillRect(0, 0, VIEW, VIEW);
        g.drawImage(img.source, st.x, st.y, img.width * st.s, img.height * st.s);
        zoom.value = String(math.level(st));
      }

      function close(result) {
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
        if (prevFocus && prevFocus.focus) prevFocus.focus();
        resolve(result);
      }

      async function commit() {
        save.disabled = true;
        const { sx, sy, size } = math.cropRect(st);
        const out = document.createElement('canvas');
        out.width = out.height = OUT;
        const g = out.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(img.source, sx, sy, size, size, 0, 0, OUT, OUT);
        const blob = await encode(out);
        close(blob || null);
      }

      function onKey(e) {
        if (!overlay.isConnected) return;
        const step = e.shiftKey ? 30 : 10;
        const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
        if (e.key === 'Escape') { e.preventDefault(); close(null); }
        else if (e.key === 'Enter' && document.activeElement !== cancel) { e.preventDefault(); commit(); }
        else if (moves[e.key] && document.activeElement === view) { e.preventDefault(); st = math.move(st, ...moves[e.key]); draw(); }
        else if ((e.key === '+' || e.key === '=') && document.activeElement === view) { st = math.zoom(st, math.level(st) + 0.2); draw(); }
        else if (e.key === '-' && document.activeElement === view) { st = math.zoom(st, math.level(st) - 0.2); draw(); }
        else if (e.key === 'Tab') { // keep focus inside the dialog
          const f = [view, zoom, save, cancel];
          const i = f.indexOf(document.activeElement);
          const next = f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length];
          e.preventDefault();
          next.focus();
        }
      }

      let drag = null;
      view.addEventListener('pointerdown', (e) => {
        drag = { x: e.clientX, y: e.clientY };
        if (view.setPointerCapture) view.setPointerCapture(e.pointerId);
        view.classList.add('is-drag');
      });
      view.addEventListener('pointermove', (e) => {
        if (!drag) return;
        st = math.move(st, e.clientX - drag.x, e.clientY - drag.y);
        drag = { x: e.clientX, y: e.clientY };
        draw();
      });
      const end = () => { drag = null; view.classList.remove('is-drag'); };
      view.addEventListener('pointerup', end);
      view.addEventListener('pointercancel', end);
      view.addEventListener('wheel', (e) => {
        e.preventDefault();
        st = math.zoom(st, math.level(st) * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
        draw();
      }, { passive: false });
      zoom.addEventListener('input', () => { st = math.zoom(st, parseFloat(zoom.value)); draw(); });
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
