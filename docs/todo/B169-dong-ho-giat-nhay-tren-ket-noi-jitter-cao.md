# B169 — Đồng hồ giật/nhảy ~1 giây trên kết nối jitter cao

> **Lưu ý đánh số:** số `#169` từng được dùng cho một mục khác (bản sao đồng hồ trong
> `tournament-match.js`), đã **xoá hẳn** theo quyết định người dùng 2026-08-28 ("Remove B169, do not
> touch tournament for now", commit `fa2529d`). Số được cấp lại cho mục này. Không có liên quan nội
> dung giữa hai mục.

**Trạng thái:** ⬜ CHƯA LÀM

**Severity:** Medium — không mất dữ liệu, không sai giờ thật (server vẫn là nguồn chân lý), nhưng là
triệu chứng "trông như hỏng" rõ nhất mà người chơi RTT cao thực sự nhìn thấy.
**Platform:** Mọi nền tảng. Chỉ biểu hiện khi **jitter half-RTT ≥ ~100ms** — thực tế là người chơi
TQ/Mỹ+VPN trên 3G/4G/VPN.
**Reported by:** Phân tích dữ liệu `/diag` (#168) — lượt đo thật đầu tiên từ người chơi TQ,
`server/data/diag-results/2026-08-28.jsonl` dòng 5, 2026-08-28.

---

## Bằng chứng đo được

Lượt đo `wbcplayer` (CN, Windows, Chrome 109, `navigator.connection` báo `3g` / `rtt 950`):

| Chỉ số | Giá trị | Ngưỡng `diag-report.js` |
|---|---|---|
| half-RTT p50 / p90 / p99 | 376 / **659** / 906 ms | p90 ≥ 500 ⇒ **connection ĐỎ** |
| jitter (MASD) | **199,6 ms** | ∈ [100, 250) ⇒ **stability VÀNG** |
| packet loss | 0 % | xanh |
| moveConfirm p50 / p99 | 891 / 1564 ms | — |

So sánh 4 lượt VN cùng ngày: jitter 1,7–15,9 ms, half-RTT p90 ≤ 89 ms. Nghĩa là dải jitter mà mã
hiện tại chưa từng gặp trong lúc phát triển đã xuất hiện trong dữ liệu thật.

## Gốc rễ — 3 điểm trong `client/js/timer-sync-core.js`

Cả ba đều thuần **hiển thị**, không đụng `activeDeadline`/`serverNow()`/watchdog (giữ nguyên ranh
giới #165 đã đặt).

1. **`displayShaveSec()` = `Math.round(transitDelaySec(halfRttMs))`** — làm tròn cứng ở mốc 500 ms.
   EMA half-RTT của người chơi này dao động **376 ↔ 906 ms**, tức đi qua mốc 500 liên tục ⇒ shave
   **lật 0 ↔ 1 giây** giữa các lần sync. Cùng một trạng thái thật, lúc hiện `N`, lúc hiện `N−1`.
2. **`compensatedRemainingSec()`** cũng `Math.round` sau khi trừ `transitDelaySec` ⇒ cùng hiệu ứng
   biên trên đường tick mỗi giây của `tickLocal()`.
3. **`applyTimerSync()` (`room-socket.js:489`)** ghi thẳng `st.timerValues` từ `sync` ⇒ giá trị hiển
   thị **được phép tăng ngược** khi sync mới về. Với jitter 200 ms, mỗi nước đi là một lần snap
   tới/lùi tới ~1,5 s so với con số người chơi vừa nhìn thấy đang đếm.

`EMA_ALPHA = 0.5` (cố ý nặng, để bám theo mạng đang xấu đi trong vài nước) khuếch đại cả ba: ước
lượng bám sát từng mẫu nhiễu thay vì làm mượt chúng.

## Cảm nhận người chơi (suy ra từ số đo)

- Đồng hồ **đứng 2 giây rồi tụt 2**, hoặc đếm `1:47 → 1:45 → 1:46`.
- Mỗi lần đến lượt mình, số **tự dưng đổi** so với lúc trước.
- Không phải "sai giờ": ngân sách thật trên server vẫn đúng. Đây là bug *hiển thị*.

## Hướng sửa đề xuất (client-only)

Nối tiếp #165/#166 — cùng tầng, cùng file, không đụng server:

- **A1 — Hysteresis ở ranh giới làm tròn.** Chỉ đổi bậc shave khi EMA vượt mốc kèm dải đệm (ví dụ
  lên 1 s khi > 600 ms, xuống 0 s khi < 400 ms) thay vì `round` trần trụi tại 500.
- **A3 — Kẹp đơn điệu trong một lượt.** Giá trị hiển thị của người đang đi chỉ được **giảm** trong
  suốt lượt đó; chỉ cho tăng khi có sự kiện tăng giờ thật (increment/bonus/`addTime`) hoặc đổi lượt.

Hai cái này giải quyết đúng hai triệu chứng (giật bậc, nhảy ngược) và đều test được bằng hàm thuần.

**Cân nhắc thêm, không bắt buộc:** EMA chậm riêng (`α ≈ 0.15`) chỉ để nuôi `displayShaveSec`, giữ
`α = 0.5` cho phần bù — đổi lấy phản ứng chậm hơn khi mạng thật sự đổi, chấp nhận được vì đây là
đường hiển thị. Chỉ làm nếu A1+A3 chưa đủ khi verify trên trình duyệt thật.

## Ngoài phạm vi

- **Bàn cờ "dính" ~1 giây sau mỗi nước** (`moveConfirm.p50` = 891 ms) — đó là RTT 3G vật lý, không
  có cách sửa bằng code hiển thị. Không nhận vào task này.
- **Giờ thật bị trừ cho quãng transit** — là #167, khác tầng (server), khác rủi ro.
- **Lệch đồng hồ máy khách −8,4 s** đo được ở cùng lượt — đã được `serverNow()` bù ở phòng chơi;
  chỗ *chưa* bù là #170.
- `tournament-match.js` giữ nguyên (quyết định người dùng 2026-08-28).

## Liên quan

- **#165 / #166** — tiền đề, cùng cơ chế bù hiển thị. B169 là phần "làm mượt" mà #165 chưa cần vì
  lúc đó chưa có mẫu jitter cao thật.
- **#168** — nguồn dữ liệu. Ngưỡng jitter 100/250 ms trong `diag-report.js` chính là thứ phân loại
  lượt này thành VÀNG.
- **`.claude/rules/diagnostic-page-sync.md` mục (b)** — sửa xong phải kiểm lại ngưỡng
  `diag-report.js` còn phản ánh đúng cách room hiển thị không.
