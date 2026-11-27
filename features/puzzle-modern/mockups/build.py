# Builds a.html / b.html / c.html (static mockups; serve repo root so /features/... and client assets resolve).
import os
D = os.path.dirname(os.path.abspath(__file__))
def I(n): return f'<svg class="icon" aria-hidden="true"><use href="/assets/icons/phosphor-sprite.svg#ph-regular-{n}"></use></svg>'
LV = {'easy': ('Dễ', 'var(--c-success)'), 'medium': ('Vừa', 'var(--c-time)'), 'hard': ('Khó', 'var(--c-warning)'), 'expert': ('Cao thủ', 'var(--c-error)')}
PUZ = [  # number, title, prompt, level, rule, size, toMove, tags, author, solved
  (12, 'Bốn quân mở', 'Đen đi trước, tìm nước thắng ngay.', 'easy', 'Luật 1', 15, 'b', ['Tấn công', 'VCF'], 'Minh Anh', True),
  (11, 'Chặn hay thắng', 'Trắng vừa tạo ba mở. Đen chặn hay tấn công trước?', 'medium', 'Luật 2', 15, 'b', ['Phòng thủ'], 'Hải Đăng', False),
  (10, 'Bẫy góc', 'Dụ Trắng vào góc rồi kết thúc bằng chuỗi bốn.', 'hard', 'Standard', 15, 'w', ['Bẫy', 'VCT'], 'Thu Trang', False),
  (9, 'Cổng dịch chuyển', 'Dùng cổng để nối hai đường ba.', 'expert', 'Renju', 17, 'b', ['VCF'], 'Quốc Bảo', False),
  (8, 'Đường chéo kép', 'Tạo hai đường bốn cùng lúc.', 'medium', 'Luật 1', 15, 'b', ['Tấn công'], 'Minh Anh', True),
  (7, 'Phòng thủ sớm', 'Trắng đi. Tìm nước chặn duy nhất.', 'easy', 'Luật 1', 15, 'w', ['Phòng thủ'], 'Lan Chi', False),
]
def stone(c): return f'<span class="mz-chip"><span class="mz-stone mz-stone--{c}" aria-hidden="true"></span>{"Đen đi" if c == "b" else "Trắng đi"}</span>'
def facts(p, tags=True):
    n, title, prompt, lv, rule, size, tm, tg, au, solved = p
    out = f'<span class="mz-chip mz-chip--lv-{lv}">{LV[lv][0]}</span><span class="mz-chip">{rule}</span><span class="mz-chip">{size}×{size}</span>{stone(tm)}'
    if tags: out += ''.join(f'<span class="mz-chip">{t}</span>' for t in tg)
    return out
def solved_chip(p): return f'<span class="mz-chip mz-chip--ok">{I("check-circle")}Đã giải</span>' if p[9] else ''

HEAD = '''<!DOCTYPE html>
<html lang="vi"><head><meta charset="UTF-8"><base href="/"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>{title}</title>
<link rel="stylesheet" href="css/main.css"><link rel="stylesheet" href="css/tokens.css">
<link rel="stylesheet" href="css/platform-shell.css"><link rel="stylesheet" href="css/platform.css"><link rel="stylesheet" href="css/settings-panel.css">
<link rel="stylesheet" href="vendor/fonts/nunito/style.css"><link rel="stylesheet" href="features/puzzle-modern/mockups/mock.css">
<script src="js/skin-preload.js"></script></head>
<body class="pl mz mz-{key}">
<div id="pl-shell"></div>
<main role="main">
'''
FOOT = '''</main>
<nav class="mock-nav" aria-label="Mockup views"><b>{tag}</b><a href="#list">/puzzles</a><a href="#solve">/puzzle/id</a><a href="#mine">/puzzles/mine</a><a href="#editor">/puzzles/new</a></nav>
<script src="js/i18n.js"></script><script src="js/ui-mode.js"></script><script src="js/session.js"></script><script src="js/audio-manager.js"></script>
<script src="js/settings-panel.js"></script><script src="js/platform-shell.js"></script><script src="js/coords.js"></script><script src="js/board.js"></script>
<script src="js/puzzle-board.js"></script><script src="features/puzzle-modern/mockups/mock.js"></script>
</body></html>
'''
DEMO = '<div class="mz-seg" role="group" aria-label="Trạng thái mẫu"><button type="button" data-demo-state="live" aria-pressed="true">Đang giải</button><button type="button" data-demo-state="solved" aria-pressed="false">Đã giải</button></div>'

# shared solver panel pieces
def answer_block(btn_block=False):
    return f'''<form class="mz-stack when-live" onsubmit="return false">
  <div><label class="mz-label" for="ans">Nước đi quyết định</label>
  <input id="ans" class="mz-field mz-mono" placeholder="H8 hoặc 122" value="G8" spellcheck="false" aria-describedby="ans-help">
  <p class="mz-help" id="ans-help">Gõ toạ độ chữ-số (H8) hoặc số thứ tự ô (122).</p></div>
  <div class="mz-row"><button class="mz-btn mz-btn--primary{' mz-btn--block' if btn_block else ''}" type="submit">{I("check-circle")}Kiểm tra</button><button class="mz-btn mz-btn--danger mz-btn--sm" type="button">{I("trash")}Xoá</button></div>
  <div class="mz-alert mz-alert--err" role="status">{I("info")}<span>Chưa đúng. Còn 2 lượt thử.</span></div>
</form>
<div class="mz-stack when-solved">
  <div class="mz-alert mz-alert--ok" role="status">{I("check-circle")}<span>Chính xác! Bàn cờ đã mở để bạn nghiên cứu.</span></div>
  <p class="mz-help">Đặt quân tự do trên bàn. Nước đi ở đây không tính là lượt thử.</p>
  <div class="mz-row"><a class="mz-btn mz-btn--primary" href="#list">Puzzle tiếp theo</a><button class="mz-btn mz-btn--tonal" type="button">{I("arrow-counter-clockwise")}Về thế ban đầu</button></div>
</div>'''
def lockline(): return f'<p class="mz-lock when-live">{I("lock")}Bàn cờ chỉ để xem cho tới khi bạn giải xong hoặc hết lượt.</p>'

def editor_form(steps=False):
    tools_seg = f'''<div class="mz-seg" role="group" aria-label="Công cụ"><button type="button" aria-pressed="true">{I("shuffle")}Đặt quân</button><button type="button" aria-pressed="false">{I("circle-half")}Tường</button><button type="button" aria-pressed="false">{I("door-open")}Cổng</button><button type="button" aria-pressed="false">{I("eraser")}Xoá</button><button type="button" aria-pressed="false">{I("target")}Đáp án</button></div>'''
    setup = f'''<div><label class="mz-label" for="imp">Nhập thế cờ từ văn bản</label>
<textarea id="imp" class="mz-area" aria-invalid="true" aria-describedby="imp-err">h8 i9 g7 j10 i99</textarea>
<p class="mz-inline-err" id="imp-err" role="alert">{I("info")}I99 không hợp lệ trên bàn 15×15</p></div>'''
    info = '''<div><label class="mz-label" for="ti">Tiêu đề</label><input id="ti" class="mz-field" value="Đường chéo kép"></div>
<div><label class="mz-label" for="pr">Đề bài</label><textarea id="pr" class="mz-area" style="font-family:inherit">Tạo hai đường bốn cùng lúc.</textarea></div>
<div class="mz-grid2"><div><label class="mz-label" for="ru">Luật</label><select id="ru" class="mz-select"><option>Luật 1</option></select></div>
<div><label class="mz-label" for="sz">Cỡ bàn</label><select id="sz" class="mz-select"><option>15×15</option></select></div>
<div><label class="mz-label" for="lv">Level đề xuất</label><select id="lv" class="mz-select"><option>Vừa</option></select></div>
<div><label class="mz-label" for="tm">Bên đi</label><select id="tm" class="mz-select"><option>Đen</option></select></div></div>
<div><span class="mz-label">Chủ đề (tối đa 3)</span><div class="mz-row"><button class="mz-chip" type="button" aria-pressed="true">Tấn công</button><button class="mz-chip" type="button" aria-pressed="false">Phòng thủ</button><button class="mz-chip" type="button" aria-pressed="false">Bẫy</button><button class="mz-chip" type="button" aria-pressed="true">VCT</button><button class="mz-chip" type="button" aria-pressed="false">VCF</button></div></div>'''
    answers = f'''<div><span class="mz-label">Kiểu đáp án</span><div class="mz-seg" role="group" aria-label="Kiểu đáp án"><button type="button" aria-pressed="true">Chuỗi nước đi</button><button type="button" aria-pressed="false">Nước quyết định</button></div></div>
<div><label class="mz-label" for="a1">Đáp án 1</label><div class="mz-row" style="flex-wrap:nowrap"><input id="a1" class="mz-field mz-mono" value="J10, K11"><button class="mz-btn mz-btn--danger mz-btn--icon" type="button" aria-label="Xoá đáp án 1">{I("trash")}</button></div></div>
<button class="mz-btn mz-btn--tonal mz-btn--sm" type="button">{I("plus-circle")}Thêm đáp án</button>'''
    return tools_seg, setup, info, answers

PROG = {'easy': (18, 24), 'medium': (7, 31), 'hard': (2, 19), 'expert': (0, 8)}

# ─────────────────────────── Concept A — deck
def concept_a():
    tiles = ''.join(f'''<a class="mz-card ca-tile" href="#solve" style="--lv:{LV[p[3]][1]}">
  <div class="mz-row" style="justify-content:space-between"><span class="ca-num">Puzzle #{p[0]}</span>{solved_chip(p)}</div>
  <h2 class="ca-title">{p[1]}</h2><p class="ca-prompt">{p[2]}</p>
  <div class="mz-row">{facts(p)}</div>
  <div class="ca-foot"><span>Tác giả: {p[8]}</span><span>{I("users-three")} {3 + p[0]} người giải</span></div></a>''' for p in PUZ)
    tools, setup, info, answers = editor_form()
    p = PUZ[0]
    return f'''<section data-view="list" class="mz-stack">
<div class="ca-head"><div><p class="mz-eyebrow">Học</p><h1 class="mz-h1">Puzzle</h1><p class="mz-lead">Chọn một thế cờ và tìm nước thắng.</p></div>
<div class="mz-row"><a class="mz-btn mz-btn--quiet" href="#mine">Puzzle của tôi</a><a class="mz-btn mz-btn--primary" href="#editor">{I("plus-circle")}Đăng puzzle mới</a></div></div>
<div class="mz-stats" style="max-width:520px"><div class="mz-stat"><b>94</b><span>Puzzle</span></div><div class="mz-stat"><b>27</b><span>Bạn đã giải</span></div><div class="mz-stat"><b>Vừa</b><span>Trình độ của bạn</span></div></div>
<div class="mz-card ca-filters">
  <div class="mz-row"><span class="mz-eyebrow">Level</span><div class="mz-seg" role="group" aria-label="Level"><button type="button" aria-pressed="true">Tất cả</button><button type="button" aria-pressed="false">Dễ</button><button type="button" aria-pressed="false">Vừa</button><button type="button" aria-pressed="false">Khó</button><button type="button" aria-pressed="false">Cao thủ</button></div></div>
  <div class="mz-row"><span class="mz-eyebrow">Luật</span><div class="mz-seg" role="group" aria-label="Luật"><button type="button" aria-pressed="true">Tất cả</button><button type="button" aria-pressed="false">Luật 1</button><button type="button" aria-pressed="false">Standard</button><button type="button" aria-pressed="false">Luật 2</button><button type="button" aria-pressed="false">Renju</button></div></div>
  <div class="mz-row"><span class="mz-eyebrow">Chủ đề</span><button class="mz-chip" type="button" aria-pressed="true">Tấn công</button><button class="mz-chip" type="button" aria-pressed="false">Phòng thủ</button><button class="mz-chip" type="button" aria-pressed="false">Bẫy</button><button class="mz-chip" type="button" aria-pressed="false">VCT</button><button class="mz-chip" type="button" aria-pressed="false">VCF</button></div>
</div>
<div class="ca-deck">{tiles}</div>
<div class="mz-row" style="justify-content:center"><button class="mz-btn mz-btn--quiet mz-btn--sm" type="button" disabled>Trước</button><span class="mz-chip">Trang 1 / 5</span><button class="mz-btn mz-btn--quiet mz-btn--sm" type="button">Sau</button></div>
</section>

<section data-view="solve" data-state="live">
<div class="mz-row" style="justify-content:space-between;margin-bottom:12px"><a class="mz-back" href="#list">{I("arrow-left")}Tất cả puzzle</a>{DEMO}</div>
<div class="ca-split">
  <div class="mz-card mz-board"><canvas id="solve-canvas"></canvas></div>
  <div class="mz-card mz-pad mz-stack">
    <div><p class="mz-eyebrow">Puzzle #{p[0]}</p><h1 class="mz-h1">{p[1]}</h1></div>
    <div class="mz-row">{facts(p)}</div>
    <div class="mz-well"><p style="margin:0">{p[2]}</p></div>
    <div class="mz-stats"><div class="mz-stat"><b>2</b><span>Lượt còn lại</span></div><div class="mz-stat"><b>15</b><span>Người đã giải</span></div></div>
    {lockline()}
    {answer_block()}
    <hr class="mz-sep"><details><summary class="mz-h2">Lượt thử của bạn (1)</summary><div class="mz-row" style="margin-top:8px"><span class="mz-chip mz-chip--bad">H9: sai</span></div></details>
  </div>
</div></section>

<section data-view="mine" class="mz-stack">
<a class="mz-back" href="#list">{I("arrow-left")}Tất cả puzzle</a>
<div class="ca-head" style="margin:0"><div><h1 class="mz-h1">Puzzle của tôi</h1><p class="mz-lead">Theo dõi các thế cờ bạn đã gửi.</p></div><a class="mz-btn mz-btn--primary" href="#editor">{I("plus-circle")}Đăng puzzle mới</a></div>
<div class="mz-stats" style="max-width:520px"><div class="mz-stat"><b>1</b><span>Chờ duyệt</span></div><div class="mz-stat"><b>2</b><span>Đã duyệt</span></div><div class="mz-stat"><b>1</b><span>Bị từ chối</span></div></div>
<div class="mz-seg" role="group" aria-label="Trạng thái"><button type="button" aria-pressed="true">Tất cả</button><button type="button" aria-pressed="false">Chờ duyệt</button><button type="button" aria-pressed="false">Đã duyệt</button><button type="button" aria-pressed="false">Bị từ chối</button></div>
<div class="ca-mine">
  <div class="mz-card ca-mine-row"><div class="mz-stack" style="gap:6px"><div class="mz-row"><b class="mz-h2">Bốn quân mở #12</b><span class="mz-chip mz-chip--ok">Đã duyệt</span></div><div class="mz-row"><span class="mz-chip mz-chip--lv-easy">Dễ</span><span class="mz-chip">Luật 1</span><span class="mz-chip">15×15</span></div></div><div class="mz-row"><button class="mz-btn mz-btn--quiet mz-btn--sm" type="button">{I("pencil-simple")}Đổi tên</button><button class="mz-btn mz-btn--danger mz-btn--sm" type="button">{I("trash")}Xoá</button></div></div>
  <div class="mz-card ca-mine-row"><div class="mz-stack" style="gap:6px"><div class="mz-row"><b class="mz-h2">Thế chờ duyệt</b><span class="mz-chip mz-chip--wait">{I("hourglass")}Chờ duyệt</span></div><div class="mz-row"><span class="mz-chip mz-chip--lv-medium">Vừa</span><span class="mz-chip">Luật 2</span><span class="mz-chip">15×15</span></div></div><div class="mz-row"><a class="mz-btn mz-btn--tonal mz-btn--sm" href="#editor">{I("pencil-simple")}Sửa</a><button class="mz-btn mz-btn--danger mz-btn--sm" type="button">{I("trash")}Xoá</button></div></div>
  <div class="mz-card ca-mine-row"><div class="mz-stack" style="gap:6px"><div class="mz-row"><b class="mz-h2">Góc chết</b><span class="mz-chip mz-chip--bad">Bị từ chối</span></div><div class="mz-alert mz-alert--info" style="padding:8px 10px;font-weight:500">Lý do: đáp án thứ hai không thắng.</div></div><div class="mz-row"><a class="mz-btn mz-btn--tonal mz-btn--sm" href="#editor">{I("pencil-simple")}Sửa</a><button class="mz-btn mz-btn--danger mz-btn--sm" type="button">{I("trash")}Xoá</button></div></div>
</div>
<div class="mz-empty">{I("magnifying-glass")}<b>Không có puzzle bị từ chối</b><span>Mẫu trạng thái rỗng của bộ lọc.</span></div>
</section>

<section data-view="editor" class="mz-stack">
<a class="mz-back" href="#mine">{I("arrow-left")}Puzzle của tôi</a>
<div><h1 class="mz-h1">Đăng puzzle</h1><p class="mz-lead">Dựng thế cờ, viết đề bài, rồi ghi các đáp án chấp nhận.</p></div>
<div class="ca-split">
  <div class="mz-stack"><div class="mz-card mz-board"><canvas id="edit-canvas"></canvas></div>
    <div class="mz-row"><span class="mz-chip"><span class="mz-stone mz-stone--b"></span>Đen 3</span><span class="mz-chip"><span class="mz-stone mz-stone--w"></span>Trắng 2</span><span class="mz-chip">Lượt kế: Trắng</span></div></div>
  <form class="mz-stack" onsubmit="return false">
    <div class="mz-card mz-pad mz-stack"><h2 class="mz-h2">1. Thế cờ</h2>{tools}{setup}</div>
    <div class="mz-card mz-pad mz-stack"><h2 class="mz-h2">2. Thông tin</h2>{info}</div>
    <div class="mz-card mz-pad mz-stack"><h2 class="mz-h2">3. Đáp án</h2>{answers}</div>
    <div class="mz-row" style="justify-content:flex-end"><a class="mz-btn mz-btn--quiet" href="#mine">Huỷ</a><button class="mz-btn mz-btn--primary" type="submit">{I("paper-plane-tilt")}Gửi duyệt</button></div>
  </form>
</div></section>
'''

# ─────────────────────────── Concept B — focused stage
def concept_b():
    rows = ''.join(f'''<a class="cb-item" href="#solve" style="--lv:{LV[p[3]][1]}"><span class="cb-bar" aria-hidden="true"></span>
  <div class="mz-stack" style="gap:6px"><div class="mz-row"><b class="mz-h2">{p[1]}</b><span class="ca-num">#{p[0]}</span>{solved_chip(p)}</div><div class="mz-row">{facts(p)}</div></div>
  <span class="mz-btn mz-btn--quiet mz-btn--sm">{"Xem lại" if p[9] else "Giải"}</span></a>''' for p in PUZ)
    tools, setup, info, answers = editor_form()
    p = PUZ[1]
    rail_tools = ''.join(f'<button class="cb-tool" type="button" aria-pressed="{str(i == 0).lower()}">{I(ic)}{lb}</button>' for i, (ic, lb) in enumerate([('shuffle', 'Đặt quân'), ('circle-half', 'Tường'), ('door-open', 'Cổng'), ('eraser', 'Xoá'), ('target', 'Đáp án')]))
    return f'''<section data-view="list">
<div class="cb-top"><div><h1 class="mz-h1">Puzzle</h1><p class="mz-lead">94 thế cờ, bạn đã giải 27.</p></div><div class="mz-row"><a class="mz-btn mz-btn--quiet" href="#mine">Puzzle của tôi</a><a class="mz-btn mz-btn--primary" href="#editor">{I("plus-circle")}Đăng puzzle mới</a></div></div>
<div class="cb-stage">
  <div class="mz-card" style="padding:4px 0 4px">{rows}
    <div class="mz-row" style="justify-content:center;padding:12px"><button class="mz-btn mz-btn--quiet mz-btn--sm" type="button" disabled>Trước</button><span class="mz-chip">Trang 1 / 5</span><button class="mz-btn mz-btn--quiet mz-btn--sm" type="button">Sau</button></div></div>
  <aside class="mz-card mz-pad mz-stack cb-rail" aria-label="Bộ lọc"><h2 class="mz-h2">Bộ lọc</h2>
    <div><label class="mz-label" for="f-lv">Level</label><select id="f-lv" class="mz-select"><option>Tất cả</option><option>Dễ</option></select></div>
    <div><label class="mz-label" for="f-ru">Luật</label><select id="f-ru" class="mz-select"><option>Tất cả</option></select></div>
    <div><span class="mz-label">Chủ đề</span><div class="mz-row"><button class="mz-chip" type="button" aria-pressed="true">Tấn công</button><button class="mz-chip" type="button" aria-pressed="false">Phòng thủ</button><button class="mz-chip" type="button" aria-pressed="false">Bẫy</button><button class="mz-chip" type="button" aria-pressed="false">VCT</button><button class="mz-chip" type="button" aria-pressed="false">VCF</button></div></div>
    <div class="mz-seg" role="group" aria-label="Hiển thị"><button type="button" aria-pressed="true">Chưa giải</button><button type="button" aria-pressed="false">Tất cả</button></div>
    <button class="mz-btn mz-btn--quiet mz-btn--sm" type="button">Xoá bộ lọc</button></aside>
</div></section>

<section data-view="solve" data-state="live">
<div class="cb-top"><a class="mz-back" href="#list">{I("arrow-left")}Tất cả puzzle</a>{DEMO}</div>
<div class="cb-stage">
  <div class="mz-card mz-board"><canvas id="solve-canvas"></canvas></div>
  <aside class="mz-card mz-pad mz-stack cb-rail">
    <div><p class="mz-eyebrow">Puzzle #{p[0]}</p><h1 class="mz-h1">{p[1]}</h1></div>
    <p style="margin:0;font-size:17px;color:var(--c-strong)">{p[2]}</p>
    <div class="mz-row">{facts(p)}</div>
    {lockline()}
    {answer_block(btn_block=True)}
    <hr class="mz-sep">
    <div class="mz-row" style="justify-content:space-between"><span class="mz-help" style="margin:0">Lượt còn lại</span><b>2 / 3</b></div>
    <div class="mz-row" style="justify-content:space-between"><span class="mz-help" style="margin:0">Người đã giải</span><b>15</b></div>
    <div class="mz-row" style="justify-content:space-between"><span class="mz-help" style="margin:0">Tác giả</span><b>{p[8]}</b></div>
  </aside>
</div></section>

<section data-view="mine" class="mz-stack">
<div class="cb-top"><div><a class="mz-back" href="#list">{I("arrow-left")}Tất cả puzzle</a><h1 class="mz-h1">Puzzle của tôi</h1></div><a class="mz-btn mz-btn--primary" href="#editor">{I("plus-circle")}Đăng puzzle mới</a></div>
<div class="mz-seg" role="group" aria-label="Trạng thái"><button type="button" aria-pressed="true">Tất cả 4</button><button type="button" aria-pressed="false">Chờ duyệt 1</button><button type="button" aria-pressed="false">Đã duyệt 2</button><button type="button" aria-pressed="false">Bị từ chối 1</button></div>
<div class="mz-card" style="padding:4px 0">
  <div class="cb-item" style="--lv:var(--c-success)"><span class="cb-bar"></span><div class="mz-stack" style="gap:6px"><div class="mz-row"><b class="mz-h2">Bốn quân mở #12</b><span class="mz-chip mz-chip--ok">Đã duyệt</span></div><div class="mz-row"><span class="mz-chip">15 người giải</span><span class="mz-chip">Gửi ngày 20/11</span></div></div><div class="mz-row"><button class="mz-btn mz-btn--quiet mz-btn--sm" type="button">Đổi tên</button><button class="mz-btn mz-btn--danger mz-btn--sm mz-btn--icon" type="button" aria-label="Xoá">{I("trash")}</button></div></div>
  <div class="cb-item" style="--lv:var(--c-warning)"><span class="cb-bar"></span><div class="mz-stack" style="gap:6px"><div class="mz-row"><b class="mz-h2">Thế chờ duyệt</b><span class="mz-chip mz-chip--wait">Chờ duyệt</span></div><div class="mz-row"><span class="mz-chip">Gửi hôm nay</span></div></div><div class="mz-row"><a class="mz-btn mz-btn--tonal mz-btn--sm" href="#editor">Sửa</a><button class="mz-btn mz-btn--danger mz-btn--sm mz-btn--icon" type="button" aria-label="Xoá">{I("trash")}</button></div></div>
  <div class="cb-item" style="--lv:var(--c-error)"><span class="cb-bar"></span><div class="mz-stack" style="gap:6px"><div class="mz-row"><b class="mz-h2">Góc chết</b><span class="mz-chip mz-chip--bad">Bị từ chối</span></div><p class="mz-help" style="margin:0">Lý do: đáp án thứ hai không thắng.</p></div><div class="mz-row"><a class="mz-btn mz-btn--tonal mz-btn--sm" href="#editor">Sửa</a><button class="mz-btn mz-btn--danger mz-btn--sm mz-btn--icon" type="button" aria-label="Xoá">{I("trash")}</button></div></div>
</div></section>

<section data-view="editor">
<div class="cb-top"><div><a class="mz-back" href="#mine">{I("arrow-left")}Puzzle của tôi</a><h1 class="mz-h1">Đăng puzzle</h1></div><div class="mz-row"><a class="mz-btn mz-btn--quiet" href="#mine">Huỷ</a><button class="mz-btn mz-btn--primary" type="button">{I("paper-plane-tilt")}Gửi duyệt</button></div></div>
<div class="cb-editor">
  <div class="mz-card cb-tools" role="group" aria-label="Công cụ">{rail_tools}</div>
  <div class="mz-stack"><div class="mz-card mz-board"><canvas id="edit-canvas"></canvas></div>
    <div class="mz-card mz-pad">{setup}</div></div>
  <aside class="mz-card mz-pad mz-stack cb-inspector" aria-label="Thuộc tính">
    <div class="mz-row"><span class="mz-chip"><span class="mz-stone mz-stone--b"></span>Đen 3</span><span class="mz-chip"><span class="mz-stone mz-stone--w"></span>Trắng 2</span><span class="mz-chip">Lượt kế: Trắng</span></div>
    {info}<hr class="mz-sep">{answers}</aside>
</div></section>
'''

# ─────────────────────────── Concept C — training path
def concept_c():
    def card(p): return f'''<a class="mz-card cc-card" href="#solve"><div class="mz-row" style="justify-content:space-between"><span class="ca-num">#{p[0]}</span>{solved_chip(p)}</div><b class="mz-h2">{p[1]}</b><p class="ca-prompt">{p[2]}</p><div class="mz-row">{facts(p, tags=False)}</div></a>'''
    shelves = ''
    for lv in ['easy', 'medium', 'hard', 'expert']:
        items = [p for p in PUZ if p[3] == lv] * 3
        done, total = PROG[lv]
        shelves += f'''<section class="cc-shelf" aria-labelledby="sh-{lv}"><div class="cc-shelf-h"><div><h2 class="mz-h2" id="sh-{lv}">{LV[lv][0]}</h2><span class="mz-help">{done} / {total} đã giải</span></div><a class="mz-btn mz-btn--quiet mz-btn--sm" href="#list">Xem tất cả</a></div>
<div class="cc-progress" style="margin-bottom:10px" role="progressbar" aria-label="Tiến độ {LV[lv][0]}" aria-valuenow="{done}" aria-valuemax="{total}"><i style="width:{round(100 * done / total)}%"></i></div>
<div class="cc-strip">{"".join(card(p) for p in items[:5])}</div></section>'''
    tools, setup, info, answers = editor_form()
    p = PUZ[2]
    return f'''<section data-view="list">
<div class="mz-card cc-hero"><div><p class="mz-eyebrow">Học</p><h1 class="mz-h1">Lộ trình puzzle</h1><p class="mz-lead">Giải từ Dễ tới Cao thủ. Bạn đã giải 27 trên 94 puzzle.</p></div>
<div class="mz-row"><a class="mz-btn mz-btn--quiet" href="#mine">Puzzle của tôi</a><a class="mz-btn mz-btn--primary" href="#solve">Tiếp tục: {PUZ[1][1]}</a></div></div>
<div class="mz-row" style="margin-bottom:16px"><div class="mz-seg" role="group" aria-label="Luật"><button type="button" aria-pressed="true">Mọi luật</button><button type="button" aria-pressed="false">Luật 1</button><button type="button" aria-pressed="false">Standard</button><button type="button" aria-pressed="false">Luật 2</button><button type="button" aria-pressed="false">Renju</button></div>
<button class="mz-chip" type="button" aria-pressed="false">Tấn công</button><button class="mz-chip" type="button" aria-pressed="false">Phòng thủ</button><button class="mz-chip" type="button" aria-pressed="false">VCF</button>
<a class="mz-btn mz-btn--tonal mz-btn--sm" href="#editor">{I("plus-circle")}Đăng puzzle</a></div>
{shelves}</section>

<section data-view="solve" data-state="live">
<div class="mz-row" style="justify-content:space-between;margin-bottom:12px"><a class="mz-back" href="#list">{I("arrow-left")}Lộ trình</a>{DEMO}</div>
<div class="cc-split">
  <div class="mz-card mz-board"><canvas id="solve-canvas"></canvas></div>
  <div class="mz-card mz-pad">
    <div style="margin-bottom:14px"><p class="mz-eyebrow">Bài 3 trên 19 của level Khó</p><h1 class="mz-h1">{p[1]}</h1><div class="mz-row" style="margin-top:8px">{facts(p)}</div></div>
    <ol class="cc-steps" style="list-style:none;margin:0;padding:0">
      <li class="cc-step is-done"><div><h2 class="mz-h2">Đọc đề</h2><p class="mz-help">{p[2]}</p></div></li>
      <li class="cc-step is-on when-live"><div class="mz-stack"><h2 class="mz-h2">Nhập đáp án</h2>{lockline()}{answer_block()}</div></li>
      <li class="cc-step is-done when-solved"><div><h2 class="mz-h2">Nhập đáp án</h2><p class="mz-help">G8: đúng ở lượt thử 2.</p></div></li>
      <li class="cc-step when-live"><div><h2 class="mz-h2">Khám phá</h2><p class="mz-help">Mở sau khi giải xong hoặc hết lượt.</p></div></li>
      <li class="cc-step is-on when-solved"><div class="mz-stack"><h2 class="mz-h2">Khám phá</h2>{answer_block().split('<div class="mz-stack when-solved">')[1].rsplit('</div>', 1)[0]}</div></li>
    </ol>
    <div class="mz-stats"><div class="mz-stat"><b>2</b><span>Lượt còn lại</span></div><div class="mz-stat"><b>15</b><span>Người đã giải</span></div></div>
  </div>
</div></section>

<section data-view="mine" class="mz-stack">
<a class="mz-back" href="#list">{I("arrow-left")}Lộ trình</a>
<div class="mz-card cc-hero"><div><h1 class="mz-h1">Puzzle của tôi</h1><p class="mz-lead">2 puzzle đang được người khác giải.</p></div><a class="mz-btn mz-btn--primary" href="#editor">{I("plus-circle")}Đăng puzzle mới</a></div>
<div class="mz-stats"><div class="mz-stat"><b>1</b><span>Chờ duyệt</span></div><div class="mz-stat"><b>2</b><span>Đã duyệt</span></div><div class="mz-stat"><b>1</b><span>Bị từ chối</span></div><div class="mz-stat"><b>31</b><span>Lượt giải</span></div></div>
<h2 class="mz-h2">Cần bạn xử lý</h2>
<div class="mz-card mz-pad mz-stack"><div class="mz-row"><b class="mz-h2">Góc chết</b><span class="mz-chip mz-chip--bad">Bị từ chối</span></div><div class="mz-alert mz-alert--err">{I("info")}<span>Lý do: đáp án thứ hai không thắng.</span></div><div class="mz-row"><a class="mz-btn mz-btn--tonal mz-btn--sm" href="#editor">{I("pencil-simple")}Sửa và gửi lại</a><button class="mz-btn mz-btn--danger mz-btn--sm" type="button">{I("trash")}Xoá</button></div></div>
<h2 class="mz-h2">Đang hoạt động</h2>
<div class="cc-strip">{card(PUZ[0])}{card(PUZ[4])}</div>
</section>

<section data-view="editor" class="mz-stack">
<a class="mz-back" href="#mine">{I("arrow-left")}Puzzle của tôi</a>
<h1 class="mz-h1">Đăng puzzle</h1>
<div class="cc-split">
  <div class="mz-stack"><div class="mz-card mz-board"><canvas id="edit-canvas"></canvas></div>{tools}</div>
  <form class="mz-card mz-pad mz-stack" onsubmit="return false">
    <div class="mz-seg cc-tabs" role="tablist" aria-label="Bước"><button type="button" aria-pressed="true">1. Thế cờ</button><button type="button" aria-pressed="false">2. Thông tin</button><button type="button" aria-pressed="false">3. Đáp án</button></div>
    {setup}
    <div class="mz-row"><span class="mz-chip"><span class="mz-stone mz-stone--b"></span>Đen 3</span><span class="mz-chip"><span class="mz-stone mz-stone--w"></span>Trắng 2</span><span class="mz-chip">Lượt kế: Trắng</span></div>
    <div class="mz-row" style="justify-content:space-between"><a class="mz-btn mz-btn--quiet" href="#mine">Huỷ</a><button class="mz-btn mz-btn--primary" type="button">Tiếp: Thông tin</button></div>
  </form>
</div></section>
'''

for key, title, tag, body in [('a', 'Mockup A — Bộ thẻ puzzle', 'A: Bộ thẻ', concept_a()), ('b', 'Mockup B — Sân khấu bàn cờ', 'B: Sân khấu', concept_b()), ('c', 'Mockup C — Lộ trình luyện', 'C: Lộ trình', concept_c())]:
    open(os.path.join(D, key + '.html'), 'w').write(HEAD.format(title=title, key=key) + body + FOOT.format(tag=tag))
print('ok')
