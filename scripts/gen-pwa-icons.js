'use strict';
// Generates client/assets/pwa/*.png (dark rounded square + white "P"), no dependencies.
// Usage: node scripts/gen-pwa-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const INK = [15, 23, 42], FG = [255, 255, 255];

function crc32(buf) {
  let c, crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x + 0.5, y + 0.5, size);
      raw.set([r, g, b, a], y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// "P" in a unit box: stem + bowl (ring, right half). u = coords in 0..1 of the glyph area.
function inP(u, v) {
  const stem = u >= 0.18 && u <= 0.40 && v >= 0 && v <= 1;
  const cx = 0.44, cy = 0.31, ro = 0.31, ri = 0.115;
  const d = Math.hypot(u - cx, v - cy);
  const bowl = u >= cx && d <= ro && d >= ri;
  const bar = (u >= 0.40 && u <= cx && ((v >= 0 && v <= 0.115) || (v >= 0.505 && v <= 0.62)));
  return stem || bowl || bar;
}
// scale = glyph area as fraction of the icon; round = corner radius fraction (0 = full bleed for maskable)
function make(size, scale, round) {
  return png(size, (x, y) => {
    const n = x / size, m = y / size;
    if (round) {
      const r = round, ex = Math.min(n, 1 - n), ey = Math.min(m, 1 - m);
      if (ex < r && ey < r && Math.hypot(r - ex, r - ey) > r) return [0, 0, 0, 0];
    }
    const g = scale, off = (1 - g) / 2;
    const u = (n - off) / g, v = (m - off) / g;
    const inside = u >= 0 && u <= 1 && v >= 0 && v <= 1 && inP(u, v);
    return inside ? [...FG, 255] : [...INK, 255];
  });
}
const out = path.join(__dirname, '..', 'client', 'assets', 'pwa');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'icon-192.png'), make(192, 0.56, 0.22));
fs.writeFileSync(path.join(out, 'icon-512.png'), make(512, 0.56, 0.22));
fs.writeFileSync(path.join(out, 'icon-maskable-512.png'), make(512, 0.42, 0)); // safe zone: glyph within inner 80%
fs.writeFileSync(path.join(out, 'apple-touch-icon.png'), make(180, 0.56, 0)); // iOS rounds it itself
console.log('wrote', fs.readdirSync(out).join(', '));
