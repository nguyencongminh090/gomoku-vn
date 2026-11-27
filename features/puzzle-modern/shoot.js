// Real-server pass for the Puzzle area (#504/#506/#507 + redesign): shots + measurements + task-2 behaviour checks.
// Server: PORT=3108 GOMOKU_DB_PATH=<temp>.db node server/index.js   (never the real gomoku.db)
// Usage:  LABEL=before|after node features/puzzle-modern/shoot.js   → shots/<label>-<page>-<w>x<h>-<mode>.png + shots/<label>-measure.json
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:3108';
const LABEL = process.env.LABEL || 'before';
const OUT = path.join(__dirname, 'shots');
const VIEWS = [[1366, 900], [390, 844]];
const MODES = ['dark', 'light'];
fs.mkdirSync(OUT, { recursive: true });

const PUZZLE = (title) => ({
  title, prompt: 'Đen đi trước, tìm nước thắng ngay.', rule: 'freestyle', boardSize: 15, toMove: 'BLACK', mode: 'final_move', level: 'easy', tags: ['attack', 'vcf'],
  stones: [[7, 7, 'BLACK'], [8, 7, 'BLACK'], [9, 7, 'BLACK'], [10, 7, 'BLACK'], [7, 9, 'WHITE'], [8, 9, 'WHITE'], [9, 10, 'WHITE'], [4, 4, 'WHITE']].map(([x, y, color]) => ({ x, y, color })),
  layout: { walls: [], portals: [] }, answers: [[{ x: 6, y: 7 }], [{ x: 11, y: 7 }]],
});

const { MEASURE } = require('./measure.js');

async function focusRing(p) {
  const primary = await p.$('main .pz-btn--primary:not([hidden]), main button[type=submit]');
  if (!primary) return null;
  await p.keyboard.press('Tab'); // switch to keyboard modality
  await primary.focus();
  return primary.evaluate((el) => { const s = getComputedStyle(el); return s.boxShadow !== 'none' || (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0); });
}

const { execFileSync } = require('child_process');
const DB = process.env.GOMOKU_DB_PATH;
if (!DB || /server\/db\/gomoku\.db$/.test(DB)) { console.error('GOMOKU_DB_PATH must point at the temp DB the test server uses'); process.exit(1); }
const sql = (q) => execFileSync('sqlite3', [DB, q]).toString().trim();

(async () => {
  const br = await chromium.launch({ executablePath: process.env.HOME + '/.local/share/ms-playwright/chromium-1243/chrome-linux64/chrome' });
  // Seed: one author (made admin), two approved puzzles + one pending.
  const seedCtx = await br.newContext();
  const uname = 'pz' + Date.now().toString(36);
  const reg = await seedCtx.request.post(B + '/api/auth/register', { data: { username: uname, password: 'Passw0rd!x', displayName: 'Tác giả Puzzle' } });
  const user = (await reg.json()).user;
  sql(`UPDATE users SET role='admin' WHERE username='${uname}'`);
  // #508 seed: every level, some solved, one pending, one rejected (shelves + progress need real spread).
  const SPECS = [
    ['Bốn quân mở', 'easy', 'Đen đi trước, tìm nước thắng ngay.'], ['Chặn hay thắng', 'easy', 'Trắng vừa tạo ba mở. Đen chặn hay tấn công trước?'],
    ['Phòng thủ sớm', 'easy', 'Tìm nước duy nhất giữ thế cân bằng.'], ['Đường chéo kép', 'medium', 'Tạo hai đường bốn cùng lúc.'],
    ['Ba mở hai hướng', 'medium', 'Đen đi, thắng trong ba nước.'], ['Bẫy góc', 'hard', 'Dụ Trắng vào góc rồi kết thúc bằng chuỗi bốn.'],
    ['Nước chờ', 'hard', 'Không có nước thắng ngay, hãy tìm nước chuẩn bị.'], ['Cổng dịch chuyển', 'expert', 'Dùng thế cờ để nối hai đường ba.'],
    ['Góc chết', 'reject', 'Đáp án thứ hai chưa thắng.'], ['Thế chờ duyệt', 'pending', 'Bài mới gửi.'],
  ];
  const ids = [];
  for (const [t, level, prompt] of SPECS) {
    const body = { ...PUZZLE(t), prompt };
    body.stones = body.stones.map((st, k) => (k === 7 ? { ...st, x: ids.length % 15, y: 12 + Math.floor(ids.length / 15) } : st)); // distinct positions
    const r = await seedCtx.request.post(B + '/api/puzzles', { data: body });
    const j = await r.json(); if (!r.ok()) throw new Error('create ' + JSON.stringify(j));
    const id = j.id || (j.puzzle && j.puzzle.id);
    ids.push(id);
    if (level === 'pending') continue;
    const decision = level === 'reject' ? { decision: 'reject', note: 'Đáp án thứ hai chưa thắng.' } : { decision: 'approve', level };
    const rv = await seedCtx.request.post(B + `/api/puzzles/${id}/review`, { data: decision });
    if (!rv.ok()) throw new Error('review ' + (await rv.text()));
  }
  // Solved by the viewer: two easy + one medium (ids 0, 2, 3); ids[1] stays unsolved for the solver checks.
  for (const k of [0, 2, 3]) sql(`INSERT INTO puzzle_progress (user_id, puzzle_id, attempts, solved_at) VALUES ('${user.userId}', '${ids[k]}', 1, '2026-11-27T00:00:00.000Z')`);
  const storage = await seedCtx.storageState();
  await seedCtx.close();

  const PAGES = [['puzzles', '/puzzles'], ['puzzle', `/puzzle/${ids[5]}`], ['puzzles-mine', '/puzzles/mine'], ['puzzle-editor', '/puzzles/new']];
  const result = [];
  for (const [name, url] of PAGES) for (const [w, h] of VIEWS) for (const mode of MODES) {
    const c = await br.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 500 ? 2 : 1, locale: 'vi-VN', storageState: storage, reducedMotion: 'reduce' });
    await c.addInitScript(({ m, u }) => { localStorage.setItem('gvn_color_mode', m); localStorage.setItem('gvn_user', JSON.stringify(u)); }, { m: mode, u: { userId: user.userId, displayName: user.displayName, isGuest: false } });
    const p = await c.newPage(); const errs = [];
    p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
    await p.goto(B + url); await p.waitForTimeout(800);
    const m = await p.evaluate(MEASURE);
    m.focusRing = await focusRing(p);
    await p.mouse.move(0, 0); await p.evaluate(() => document.activeElement && document.activeElement.blur());
    const file = `${LABEL}-${name}-${w}x${h}-${mode}.png`;
    await p.screenshot({ path: path.join(OUT, file), fullPage: true });
    result.push({ page: name, view: `${w}x${h}`, mode, ...m, errors: errs, file });
    console.log(name, `${w}x${h}`, mode, `contrast<4.5=${m.lowContrastN} <44px=${m.smallN} motion=${m.transitions} ring=${m.focusRing} hScroll=${m.hScroll}`, errs.length ? 'ERR ' + errs.join(' / ') : '');
    if (m.lowContrastN) console.log('   low:', m.lowContrast.join(' | '));
    if (m.smallN) console.log('   small:', m.small.join(' | '));
    await c.close();
  }

  // Task 2 behaviour in the real browser (desktop dark).
  const c = await br.newContext({ viewport: { width: 1366, height: 900 }, locale: 'vi-VN', storageState: storage });
  await c.addInitScript((u) => { localStorage.setItem('gvn_user', JSON.stringify(u)); }, { userId: user.userId, displayName: user.displayName, isGuest: false });
  const p = await c.newPage(); const errs = []; let alerts = 0;
  p.on('dialog', (d) => { alerts++; d.dismiss(); });
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  // Cell → page point from two known adjacent stones of the seed puzzle: (7,7) and (8,7) are black.
  const cellCenter = async (x, y) => p.$eval('svg.gboard', (svg, a) => {
    const pcs = [...svg.querySelectorAll('.gboard__pcs > *')].map((n) => { const b = n.getBBox(); return { cx: b.x + b.width / 2, cy: b.y + b.height / 2 }; });
    pcs.sort((u, v) => u.cy - v.cy || u.cx - v.cx);
    const row = pcs.filter((q) => Math.abs(q.cy - pcs.find((r) => true).cy) < 1); // top row of stones = y 7 (h8..k8)
    const pitch = row[1].cx - row[0].cx, ox = row[0].cx - 7 * pitch, oy = row[0].cy - 7 * pitch;
    const r = svg.getBoundingClientRect(), k = r.width / svg.viewBox.baseVal.width;
    return { x: r.left + (ox + a.x * pitch) * k, y: r.top + (oy + a.y * pitch) * k };
  }, { x, y });
  const stoneCount = () => p.$$eval('svg.gboard .gboard__pcs > *', (ns) => ns.length);
  const lastMarker = () => p.$$eval('svg.gboard .gboard__lm > *, svg.gboard .gboard__lc > *', (ns) => ns.length);
  const checks = {};
  // Editor
  await p.goto(B + '/puzzles/new'); await p.waitForTimeout(700);
  checks.editorTools = await p.$$eval('#ed-tools .pz-seg__opt', (bs) => bs.map((b) => b.dataset.tool));
  await p.fill('#ed-import', 'h8 i9 h10'); await p.waitForTimeout(450);
  checks.editorLiveStones = await stoneCount();
  await p.fill('#ed-import', 'h8 i99'); await p.waitForTimeout(450);
  checks.editorAlert = await p.$eval('#ed-import-err', (n) => ({ visible: !n.hidden && n.getBoundingClientRect().height > 0, role: n.getAttribute('role'), text: n.textContent }));
  checks.editorKeptStones = await stoneCount();
  checks.editorLastMarker = await lastMarker();
  await p.screenshot({ path: path.join(OUT, `${LABEL}-check-editor-alert.png`) });
  // Solver
  await p.goto(B + `/puzzle/${ids[1]}`); await p.waitForTimeout(700);
  const before = await stoneCount();
  const pt = await cellCenter(2, 2); await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(200);
  checks.solverLockedClickIgnored = (await stoneCount()) === before;
  checks.solverUndo = await p.$('#pz-undo') === null;
  await p.fill('#pz-input', 'G8'); await p.click('#pz-submit'); await p.waitForTimeout(700);
  checks.solverResult = await p.$eval('#pz-result', (n) => n.textContent.trim());
  const after = await stoneCount();
  const pt2 = await cellCenter(2, 2); await p.mouse.click(pt2.x, pt2.y); await p.waitForTimeout(200);
  checks.solverExplorePlaces = (await stoneCount()) === after + 1;
  checks.solverResetVisible = await p.$eval('#pz-reset', (n) => !n.hidden);
  await p.screenshot({ path: path.join(OUT, `${LABEL}-check-solver-explore.png`) });
  await p.click('#pz-reset'); await p.waitForTimeout(200);
  checks.solverResetBack = (await stoneCount()) === before;
  checks.alerts = alerts; checks.errors = errs;
  console.log('checks', JSON.stringify(checks, null, 1));
  await c.close();
  fs.writeFileSync(path.join(OUT, `${LABEL}-measure.json`), JSON.stringify({ result, checks }, null, 1));
  await br.close();
})().catch((e) => { console.error(e); process.exit(1); });

module.exports = { MEASURE, focusRing, VIEWS, MODES, OUT, B, LABEL };
