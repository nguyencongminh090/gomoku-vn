# PLAY3CR — Round 3 Visual Design Review

Ngày kiểm duyệt: 2026-11-17  
Phạm vi: 10 concept Home Round 3 (`14`–`23`) trên nhánh `codex/home-mockups` (không chỉnh sửa code thiết kế trong bước này).

## 1. Tài liệu trực quan đã xuất
- Tổng hợp Desktop (`1440×900`): `round3-desktop-overview.png`
- Tổng hợp Mobile (`390×844`): `round3-mobile-overview.png`
- Ảnh riêng 3 mẫu trọng tâm (`1440×900` & `390×844`):
  - `14-editorial-desktop-1440.png`, `14-editorial-mobile-390.png`
  - `15-arena-desktop-1440.png`, `15-arena-mobile-390.png`
  - `23-signature-desktop-1440.png`, `23-signature-mobile-390.png`

## 2. Nhận xét tổng quan 10 concept

### Điểm đạt được so với Round 2
- Cả 10 concept sử dụng 10 ngôn ngữ thị giác và cấu trúc DOM thực sự khác nhau; không còn hiện tượng lặp lại cùng một bộ card bo góc đặt cạnh nhau.
- Độ tương phản, cỡ chữ tiếng Việt (`Playfair Display`, `Bricolage Grotesque`, `Nunito`) và khả năng co giãn `0` lỗi tràn ngang đạt chuẩn kỹ thuật.

### Vấn đề thẩm mỹ & UX nổi cộm cần đối chiếu
1. **Trên Mobile (`390×844`), bàn cờ biến mất khỏi màn hình đầu tiên ở 9/10 mẫu:** Chỉ có `22 Monochrome Brutalist` hé thấy mép bàn cờ ở `y=833px`; 9 mẫu còn lại đẩy bàn cờ xuống `y=874px` tới `1383px` do cụm header + H1 + 3 hàng nút chọn luật/đồng hồ chiếm toàn bộ màn hình đầu.
2. **Lặp lại ma trận 8–11 chip cấu hình trước nút Chơi nhanh:** Hầu hết các mẫu (trừ `20 Matchmaking Nexus` dùng 4 làn chọn nhanh) đặt quá nhiều nút chọn nhỏ trên đầu trang (`30–38` phần tử tương tác/màn hình), kéo nút **Chơi nhanh** xuống sâu (`491–736px` trên mobile) và đẩy ô mã phòng của mẫu `20` ra ngoài màn hình đầu (`y=933px`).
3. **Bố cục 2 cột "trái chữ & điều khiển — phải bàn cờ" xuất hiện hơi nhiều trên Desktop:** `14`, `16`, `17`, `21`, `23` dù khác chất liệu nhưng đều giữ trục chia đôi trái–phải quen thuộc. Các mẫu phá khối rõ nhất là `15` (3 cánh), `18` (phát sóng trái – điều khiển phải), `20` (4 làn ngang trên – radar dưới), `22` (lưới kiến trúc 3 khoang).
4. **Thanh điều hướng mobile bị cắt cụt mép phải:** Cơ chế cuộn ngang `.nav` trên `390px` ở `14`, `15`, `16`, `21`, `23` cắt nửa chữ ở mép phải mà không có vùng mờ (fade) chỉ dẫn cuộn, dễ nhìn nhầm là lỗi cắt chữ.

---

## 3. Phân tích 3 điểm yếu cụ thể của 3 mẫu đang xét

### 14 — Grandmaster Editorial
1. **Thiên về tạp chí tĩnh hơn sảnh game đang sống:** Bảng `01 · LUẬT / 02 · ĐỒNG HỒ / 03 · CHẾ ĐỘ` mang cảm giác biểu mẫu biên tập, thiếu nhịp kết nối trực tiếp của người chơi đang trực tuyến.
2. **Mobile (`390×844`) có nút rớt hàng lệch & nav cắt chữ:** Hàng CTA có `"Chơi nhanh · Luật 1 ↗"` + `"Tạo phòng"` ở dòng trên, nút `"Thách đấu"` rơi lẻ sang trái ở dòng dưới tạo khoảng trống lệch; thanh nav cắt chữ `"HỘI NHÓ..."` ở mép phải.
3. **Bàn cờ bị đóng khung kép trên desktop và khuất khỏi màn hình đầu mobile:** Ở `1440×900`, bàn cờ nằm gọn trong viền hộp `.ed-plate-frame` nên giảm nét phóng khoáng của trang biên tập; ở `390×844`, bàn cờ bị đẩy xuống `y=1000px`.

### 15 — The Arena
1. **Mật độ viền & khối tối dày đặc:** Cánh trái gom tới 11 nút nhỏ trong một khung góc vát, trong khi cánh giữa và cánh phải bọc viền cho hầu hết từng hàng con, tạo cảm giác căng và nặng kiểu dashboard.
2. **Hai bên bàn cờ trung tâm bị dư khoảng trống tối ở `1440×900`:** SVG bàn cờ giới hạn `440px` trong sân khấu giữa rộng hơn `700px`, để lộ hai dải nền trống dọc hai bên bàn cờ.
3. **Lệch tông với hệ thống Play3CR & khuất bàn cờ trên mobile:** Bảng màu neon đen/vàng chanh/cyan tách biệt hoàn toàn với nền giấy & xanh lá hiện tại của Play3CR; ở `390×844`, toàn bộ sàn đấu và bàn cờ rớt xuống dưới màn hình đầu (`y=926px`).

### 23 — Kỳ Đài Biến Ảo (Signature)
1. **Cột trái ôm đồm chức năng (38 phần tử tương tác):** Gộp từ tiêu đề, 10 nút luật/cơ chế/giờ, 3 nút hành động, 3 ô mã phòng tới cả ngăn kéo 4 tab (`Phòng`, `Đang đấu`, `Puzzle`, `Giải`). Ở `1440×900`, danh sách phòng cuối cột trái vẫn vượt nhẹ chiều cao màn hình (`scrollH=910px`).
2. **Hai nửa trái–phải phân cực cứng, thiếu gắn kết và khuất bàn cờ trên mobile:** Nửa trái tối đặc chữ & nút, nửa phải sáng kem chỉ đặt bàn cờ mẫu; trên `390×844`, khối điều khiển tối chiếm trọn `844px` đầu tiên, che khuất hoàn toàn bàn cờ Cổng/Giấy (`y=1154px`).
3. **Chưa thống nhất màu thương hiệu chủ đạo:** Cùng lúc dùng đỏ son (CTA chính), vàng hổ phách (tiêu đề), xanh ngọc (Ô khoá/Cổng/mã phòng) trên nền nâu đen và kem, làm điểm nhấn thương hiệu bị phân tán khi đặt cạnh các trang khác của Play3CR.
