// Generates a.html / b.html / c.html (shared head, controls; layouts differ). Usage: node features/replay-redesign/mockups/build.js
// Served from the repo by shoot.js: /css, /js, /assets → client/, /features → features/.
const fs = require('fs'), path = require('path');
const ic = (id, local) => `<svg class="icon" aria-hidden="true"><use href="${local ? '' : '/assets/icons/phosphor-sprite.svg'}#ph-regular-${id}"></use></svg>`;
const head = (v, title, extraCss = '') => `<!DOCTYPE html>
<html lang="vi"><head><meta charset="UTF-8"><base href="/"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Mockup ${v.toUpperCase()} — ${title}</title>
<link rel="stylesheet" href="css/main.css"><link rel="stylesheet" href="css/tokens.css">${extraCss}
<link rel="stylesheet" href="css/platform.css"><link rel="stylesheet" href="css/platform-shell.css"><link rel="stylesheet" href="css/settings-panel.css">
<link rel="stylesheet" href="vendor/fonts/nunito/style.css"><link rel="stylesheet" href="features/replay-redesign/mockups/mock.css">
<script src="js/skin-preload.js"></script></head>
<body class="pl rp-page v${v}" data-variant="${v}">
<script src="features/replay-redesign/mockups/extra-icons.js"></script>
<div id="pl-shell"></div>`;
const tail = (v, title) => `<p id="rp-toast" class="rp-toast" role="status" hidden></p>
<span class="mock-tag">Mockup ${v.toUpperCase()} · ${title}</span>
<script src="js/i18n.js"></script><script src="js/ui-mode.js"></script><script src="js/audio-manager.js"></script><script src="js/settings-panel.js"></script>
<script src="js/session.js"></script><script src="js/platform-shell.js"></script><script src="js/board.js"></script><script src="js/move-tree.js"></script>
<script src="js/escape-utils.js"></script><script src="js/tree-view.js"></script>
<script src="features/replay-redesign/mockups/fixture.js"></script><script src="features/replay-redesign/mockups/mock.js"></script>
</body></html>
`;
const players = `<div class="rp-players"><div id="rp-black" class="rp-player"></div><div id="rp-white" class="rp-player"></div></div>`;
const back = `<a href="#" class="pback muted small">${ic('arrow-left')}<span>Quay lại</span></a>`;
const info = `${players}<p id="rp-result" class="rp-result"></p><div id="rp-meta" class="rp-meta"></div>`;
const range = `<div class="rp-range"><div class="rp-track"><input id="rp-slider" type="range" min="0" value="0" aria-label="Dòng thời gian ván"><div id="rp-ticks" class="rp-ticks" aria-hidden="true"></div></div><span id="rp-counter" class="rp-counter" aria-live="off"></span></div>`;
const btns = `<div class="rp-btns rp-dock" role="group" aria-label="Điều khiển phát lại">
  <button id="rp-first" class="rp-ib" type="button" aria-label="Nước đầu (Home)">${ic('skip-back', 1)}</button>
  <button id="rp-prev" class="rp-ib" type="button" aria-label="Lùi 1 nước (←)">${ic('caret-left')}</button>
  <button id="rp-play" class="rp-ib rp-ib--play" type="button" aria-label="Tự động phát (Space)">${ic('play')}</button>
  <button id="rp-next" class="rp-ib" type="button" aria-label="Tiến 1 nước (→)">${ic('caret-right')}</button>
  <button id="rp-last" class="rp-ib" type="button" aria-label="Nước cuối (End)">${ic('skip-forward', 1)}</button></div>`;
const speed = `<div class="pseg rp-speed" role="group" aria-label="Tốc độ phát"><button type="button" class="pseg__opt" data-speed="1200" aria-pressed="false">0.5×</button><button type="button" class="pseg__opt is-active" data-speed="600" aria-pressed="true">1×</button><button type="button" class="pseg__opt" data-speed="300" aria-pressed="false">2×</button></div>`;
const share = `<button type="button" class="rp-tbtn rp-share" title="Sao chép liên kết tới nước này">${ic('link', 1)}<span>Chia sẻ</span></button>`;
const analysis = `<button type="button" class="rp-switch" role="switch" aria-checked="true" title="Phân tích (A)"><span class="rp-switch__track" aria-hidden="true"><span class="rp-switch__thumb"></span></span><span>Phân tích</span></button>`;
const del = `<button id="rp-del" type="button" class="rp-tbtn rp-tbtn--danger" title="Xoá nhánh (Delete)">${ic('trash')}<span>Xoá nhánh</span></button>`;
const report = `<details class="rp-report"><summary>${ic('flag')}<span>Báo gian lận</span></summary><p class="muted small">(form hiện tại giữ nguyên: chọn người, lý do, Gửi)</p></details>`;
const strip = `<div id="rp-strip" class="rp-strip rp-phone-only" aria-label="Nước đi"></div>`;

const A = `${head('a', 'Bảng nước đi cạnh bàn')}
<main class="rp" role="main">
  <div id="rp-board" class="rp-board"><canvas id="rp-canvas"></canvas></div>
  <section class="rp-panel ppanel" aria-label="Thông tin ván">
    <div class="rp-desk-only">${back}</div>
    <div class="rp-card">${info}</div>
    <div class="rp-ctrl">${range}${btns}</div>
    ${strip}
    <div class="rp-opts">${speed}${share}</div>
    <div class="rp-listhead"><h2 class="rp-h">Nước đi</h2>${analysis}</div>
    <div id="rp-moves" class="rp-moves" aria-label="Danh sách nước đi"></div>
    <div class="rp-opts rp-foot">${del}${report}</div>
  </section>
</main>${tail('a', 'Bảng nước đi cạnh bàn')}`;

const B = `${head('b', 'Ba cột + bottom sheet')}
<main class="rp" role="main">
  <section class="rp-info ppanel rp-desk-only" aria-label="Thông tin ván">${back}${info}<div class="rp-opts">${share}${analysis}</div>${report}</section>
  <div class="rp-bar rp-phone-only">${players.replace(/id="rp-(black|white)"/g, 'data-m="$1"')}</div>
  <div id="rp-board" class="rp-board"><canvas id="rp-canvas"></canvas></div>
  <div class="rp-ctrl ppanel">${range}${btns}<div class="rp-opts">${speed}<span class="rp-phone-only">${share}</span></div></div>
  <div class="rp-sheet">
    <button id="rp-sheet-toggle" class="rp-sheet__bar" type="button" aria-expanded="false"><span id="rp-peek"></span>${ic('caret-down')}</button>
    <section class="rp-panel ppanel" aria-label="Nước đi">
      <h2 class="rp-h">Nước đi</h2>
      <div id="rp-moves" class="rp-moves"></div>
      <div class="rp-opts">${del}</div>
      <div class="rp-info rp-phone-only">${info.replace(/id="rp-(black|white|result|meta)"/g, 'data-m="$1"')}${report}</div>
    </section>
  </div>
</main>${tail('b', 'Ba cột + bottom sheet')}`;

const C = `${head('c', 'Bảng tab', '<link rel="stylesheet" href="css/history.css">')}
<main class="rp" role="main">
  <div id="rp-board" class="rp-board"><canvas id="rp-canvas"></canvas></div>
  <section class="rp-panel ppanel" aria-label="Phát lại">
    <div class="rp-desk-only">${back}</div>
    ${players}
    <div class="rp-ctrl">${range}${btns}<div class="rp-opts">${speed}${share}</div></div>
    <div class="ptabs" role="tablist" aria-label="Bảng">
      <button class="ptab" role="tab" aria-selected="true" aria-controls="rp-tab-moves" id="t1">Nước đi</button>
      <button class="ptab" role="tab" aria-selected="false" aria-controls="rp-tab-tree" id="t2">Cây biến thể</button>
      <button class="ptab" role="tab" aria-selected="false" aria-controls="rp-tab-info" id="t3">Ván đấu</button>
    </div>
    <div id="rp-tab-moves" class="rp-tabpanel" role="tabpanel" aria-labelledby="t1"><div id="rp-moves" class="rp-moves rp-grid"></div></div>
    <div id="rp-tab-tree" class="rp-tabpanel" role="tabpanel" aria-labelledby="t2" hidden><div class="rp-opts">${analysis}${del}</div><div id="rp-tree"></div></div>
    <div id="rp-tab-info" class="rp-tabpanel" role="tabpanel" aria-labelledby="t3" hidden><p id="rp-result" class="rp-result"></p><div id="rp-meta" class="rp-meta"></div>${report}</div>
  </section>
</main>${tail('c', 'Bảng tab')}`;

// A phone bar duplicates names compactly; B phone bar too (filled by a tiny inline copy in mock.js-free way: CSS shows desk players in panel).
for (const [f, h] of [['a.html', A], ['b.html', B], ['c.html', C]]) fs.writeFileSync(path.join(__dirname, f), h);
console.log('built a.html b.html c.html');
