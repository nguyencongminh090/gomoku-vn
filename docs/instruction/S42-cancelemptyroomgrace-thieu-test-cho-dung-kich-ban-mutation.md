# §42. `cancelEmptyRoomGrace` thiếu test cho đúng kịch bản mutation (review 12.5, TODO.md #42)

## §42 — `cancelEmptyRoomGrace` thiếu test cho đúng kịch bản mutation (review 12.5, TODO.md #42)

**Trước khi làm, đọc lại test đã có** từ TODO #18 (vòng 2) trong
`server/tests/DisconnectHandler.test.js`, describe "empty-room grace period"
— đã có case "cancel qua reconnect thì không gọi `leaveRoom`". Việc đầu tiên
là xác nhận case đó có thật sự đỏ khi gỡ `cancelEmptyRoomGrace` (không phải
gỡ toàn bộ cơ chế grace) hay không, bằng mutation-check trên bản copy — nếu
nó đã đỏ đúng, mục này coi như đóng và chỉ cần cập nhật `TODO.md` ghi lại
bằng chứng, không cần viết thêm code/test mới.

**Nếu case đó không bắt được mutation cụ thể này:** viết case mới dựng đúng
kịch bản review đã đo — phòng có đúng 1 người, người đó disconnect (bắt đầu
`startEmptyRoomGrace`), rồi **họ reconnect trong lúc grace đang chạy**
(`cancelEmptyRoomGrace` được gọi), sau đó chờ qua mốc 20s gốc (giả lập bằng
fake timer) — assert phòng **vẫn còn sống** vì `cancelEmptyRoomGrace` đã huỷ
timer đúng cách. Mutation cần bắt: gỡ hẳn lệnh gọi `cancelEmptyRoomGrace`
(không phải gỡ cả grace) → phòng phải **bị xoá sai** dù user đang online, vì
timer gốc vẫn chạy tiếp.

**Không đụng:** logic `startEmptyRoomGrace`/`cancelEmptyRoomGrace` hiện có —
mục này chỉ thêm test, không đổi hành vi.

---
