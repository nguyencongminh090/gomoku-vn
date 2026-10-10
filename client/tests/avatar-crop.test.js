/**
 * B211 follow-up — avatar editor: crop geometry (pure) + modal behaviour with a stubbed decoder/canvas.
 *
 * @jest-environment jsdom
 */

'use strict';

const fs = require('fs');
const path = require('path');

function load() {
  jest.resetModules();
  document.body.innerHTML = '';
  window.t = (k) => k;
  window.AvatarCrop = undefined;
  window.eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'avatar-crop.js'), 'utf8'));
  return window.AvatarCrop;
}

describe('AvatarCrop.math', () => {
  const { math, VIEW, MAX_ZOOM } = load();

  it('starts cover-fit and centred: landscape 800×400 → scale 0.7, crop is the middle square', () => {
    const st = math.init(800, 400);
    expect(st.s).toBeCloseTo(VIEW / 400);
    const r = math.cropRect(st);
    expect(r.size).toBeCloseTo(400);
    expect(r.sy).toBeCloseTo(0);
    expect(r.sx).toBeCloseTo(200);
  });

  it('move is clamped so the viewport is always covered (no empty edge), both axes', () => {
    let st = math.init(800, 400);
    st = math.move(st, 9999, 9999);
    expect(st.x).toBe(0);
    expect(st.y).toBeCloseTo(0);
    st = math.move(st, -99999, -99999);
    expect(st.x).toBeCloseTo(VIEW - 800 * st.s);
  });

  it('zoom keeps the viewport centre fixed and is bounded to 1× … MAX_ZOOM× cover', () => {
    const st = math.init(400, 400);
    const centre = (s) => ((VIEW / 2 - s.x) / s.s);
    const z = math.zoom(st, 2);
    expect(centre(z)).toBeCloseTo(centre(st));
    expect(math.level(z)).toBeCloseTo(2);
    expect(math.level(math.zoom(st, 99))).toBeCloseTo(MAX_ZOOM);
    expect(math.level(math.zoom(z, 0.1))).toBeCloseTo(1);
  });

  it('crop rect never leaves the source image (boundary: maximal pan + zoom)', () => {
    let st = math.zoom(math.init(1000, 300), MAX_ZOOM);
    for (const [dx, dy] of [[9999, 9999], [-9999, -9999], [9999, -9999]]) {
      const r = math.cropRect(math.move(st, dx, dy));
      expect(r.sx).toBeGreaterThanOrEqual(-1e-6);
      expect(r.sy).toBeGreaterThanOrEqual(-1e-6);
      expect(r.sx + r.size).toBeLessThanOrEqual(1000 + 1e-6);
      expect(r.sy + r.size).toBeLessThanOrEqual(300 + 1e-6);
    }
  });

  it('a tiny source still covers the viewport (upscales rather than leaving gaps)', () => {
    const st = math.init(40, 60);
    expect(st.s).toBeCloseTo(VIEW / 40);
    expect(math.cropRect(st).size).toBeCloseTo(40);
  });
});

describe('AvatarCrop.open', () => {
  let drawn;
  let AC;
  const img = { width: 800, height: 400, source: { tag: 'img' } };
  const file = { name: 'a.jpg', type: 'image/jpeg' };

  beforeEach(() => {
    AC = load();
    drawn = [];
    HTMLCanvasElement.prototype.getContext = function () {
      return {
        fillRect() {}, set fillStyle(_) {}, set imageSmoothingQuality(_) {},
        drawImage: (...a) => drawn.push(a),
      };
    };
    HTMLCanvasElement.prototype.toBlob = function (cb, type) { cb({ type: type || 'image/png', size: 1000 }); };
  });

  const start = (opts) => { const p = AC.open(file, { decode: () => Promise.resolve(img), ...opts }); return p; };
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it('opens a labelled modal dialog focused on the viewport', async () => {
    const p = start();
    await tick();
    const dlg = document.querySelector('.pcrop [role="dialog"]');
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement.className).toContain('pcrop__view');
    document.querySelector('.pbtn--ghost').click();
    expect(await p).toBeNull();
    expect(document.querySelector('.pcrop')).toBeNull();
  });

  it('Escape and a backdrop click cancel', async () => {
    let p = start();
    await tick();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(await p).toBeNull();
    p = start();
    await tick();
    document.querySelector('.pcrop').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(await p).toBeNull();
  });

  it('save exports a 512×512 webp of the cropped square (centre of a landscape source by default)', async () => {
    const p = start();
    await tick();
    document.querySelector('.pbtn--primary').click();
    const blob = await p;
    expect(blob.type).toBe('image/webp');
    const last = drawn[drawn.length - 1];
    expect(last[0]).toBe(img.source);
    expect(last.slice(1, 5).map((v) => Math.round(v) + 0)).toEqual([200, 0, 400, 400]);
    expect(last.slice(5)).toEqual([0, 0, AC.OUT, AC.OUT]);
  });

  it('arrow keys pan only while the viewport has focus: ArrowLeft moves the image right = window left in the source', async () => {
    const p = start();
    await tick();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    document.querySelector('.pbtn--primary').click();
    await p;
    const last = drawn[drawn.length - 1];
    expect(last[1]).toBeCloseTo(200 - 10 / (280 / 400)); // 10 viewport px at scale 0.7
    expect(last[3]).toBeCloseTo(400);
  });

  it('dragging the viewport pans the crop; the zoom slider shrinks the source window', async () => {
    const p = start();
    await tick();
    const view = document.querySelector('.pcrop__view');
    const ev = (type, x, y) => Object.assign(new Event(type, { bubbles: true }), { clientX: x, clientY: y, pointerId: 1 });
    view.dispatchEvent(ev('pointerdown', 100, 100));
    view.dispatchEvent(ev('pointermove', 70, 100)); // drag left 30px → window moves right
    view.dispatchEvent(ev('pointerup', 70, 100));
    const zoom = document.querySelector('.pcrop__zoom');
    zoom.value = '2';
    zoom.dispatchEvent(new Event('input'));
    document.querySelector('.pbtn--primary').click();
    await p;
    const last = drawn[drawn.length - 1];
    expect(last[3]).toBeCloseTo(200); // 2× zoom → half the source square
    expect(last[1]).toBeGreaterThan(200); // moved right of the original window start
  });

  it('too-large webp falls back to jpeg; unreadable file reports and resolves null', async () => {
    HTMLCanvasElement.prototype.toBlob = function (cb, type) { cb({ type, size: type === 'image/webp' ? 3 * 1024 * 1024 : 1000 }); };
    let p = start();
    await tick();
    document.querySelector('.pbtn--primary').click();
    expect((await p).type).toBe('image/jpeg');
    const onError = jest.fn();
    p = AC.open(file, { decode: () => Promise.reject(new Error('x')), onError });
    expect(await p).toBeNull();
    expect(onError).toHaveBeenCalledWith('avatar.crop_load_error');
    expect(document.querySelector('.pcrop')).toBeNull();
  });
});
