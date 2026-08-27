# B137 — `#start-modal` phủ trọn viewport, đè drawer + lệch tâm bàn cờ

## Bẫy phải biết trước

**Không** chuyển `#start-modal` thành con của `#board-area`. `GameUI.initBoard()` ghi đè
`innerHTML` của `#board-area` trọn gói ở lần render đầu — modal sẽ bị xoá mất. Lý do này đã ghi sẵn
trong comment `client/room.html:89` và `client/css/room.css:54-56`; đừng phát hiện lại nó bằng cách
làm hỏng.

## Hướng làm

Giữ nguyên anchor (`.board-area-shell`), chỉ chỉnh vùng phủ trong `room-zen.css` để tôn trọng
`padding-right` của shell, ví dụ:

```css
body.zen-room .start-modal {
  inset: 0 calc(var(--zen-drawer-w) + var(--zen-board-gutter)) 0 0;
}
body.zen-room.zen-drawer-collapsed .start-modal {
  inset: 0 calc(var(--zen-rail-w) + var(--zen-board-gutter)) 0 0;
}
```

Nhớ nhánh mobile ≤768px: ở đó `padding-right` là 0 (`room-zen.css:911-913`) và drawer là bottom
sheet — vùng phủ phải quay về `inset: 0`, đừng để rule desktop rò xuống.

`z-index` chỉ cần sửa nếu sau khi thu vùng phủ vẫn còn chồng lấn — sửa vùng phủ là cái gốc, hạ
`z-index` chỉ là che triệu chứng.

## Không đụng

- `.game-overlay` (`game.css:352-373`) — `#room-entry-overlay` dùng chung class đó, §B36 đã tách hai
  thứ này ra có chủ đích.
- `pointer-events: none` trên `.start-modal` / `auto` trên `.start-modal__card` — đó là cơ chế giữ
  cho nút đứng dậy khỏi ghế và chat vẫn bấm được khi modal hiện (§B36).

## Đo (bắt buộc, Playwright)

Tâm `.start-modal__card` vs tâm `#game-canvas`, ở 4 tổ hợp: drawer mở/đóng × desktop/mobile. Trước
khi sửa phải chụp được số lệch (kỳ vọng ≈ nửa `--zen-drawer-w` trên desktop), sau khi sửa lệch phải
≈0. `?v=N` bump theo quy tắc `CLAUDE.md` vì đụng `client/css/`.
