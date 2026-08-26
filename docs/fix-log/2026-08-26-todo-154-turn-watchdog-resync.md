# Fix log entry — 2026-08-26 22:51

## Prompt

"Do #154" — thực thi `docs/todo/B154-gap-detection-khong-pha-duoc-deadlock-2-nguoi.md` theo
`docs/instruction/B154-*.md`. Người dùng hỏi trước "Sonnet 5 (Medium) làm được hay cần Opus 5?";
trả lời **cần Opus 5** (chính mục tracking đã ghi khuyến nghị `[Model: Opus 5]`, lý do: chọn ngưỡng
watchdog là suy xét dưới bất định, cộng thêm bất biến tự-huỷ trên nhiều đường và bán kính ảnh hưởng
chạm cả #153/#155), người dùng đổi sang Opus 5 rồi ra lệnh làm.

## Action

### Đo trước, không chọn số tròn (#131)

`games.moves` / `tournament_games.moves` lưu `{x,y,color,timestamp}` với `timestamp` là
`Date.now()` **phía server** lúc áp nước đi (`GameEngine.js:233/317`), nên hiệu hai mốc liên tiếp
đúng bằng khoảng lặng thật mà một client đang chờ phải ngồi qua. Đo trên **bản copy read-only** của
DB thật trong scratchpad (không mở DB thật):

- **334 ván, 9.429 khoảng lặng.** p50 5,0s · p75 12,5s · p90 24,8s · p95 33,4s · p99 50,4s ·
  p99.5 54,9s · p99.9 83,5s · max 184,3s.
- Mặc định là `per_move`/60s (`server/config.js:84-85`) và phân bố **bám sát trần đó** (p99.5 = 54,9s,
  20 khoảng nằm trong dải 55-60s) — tức người chơi thật sự dùng gần hết đồng hồ.
- Vì vậy hằng số phẳng "nghe có vẻ an toàn" là sai hẳn: **15s sẽ bắn ở 75% số ván, 30s ở 50%**.

### Bản nháp đầu — đúng logic nhưng tới muộn, e2e bắt được

Ý tưởng đầu: `timerSync.deadline` cho một mốc **không phải phỏng đoán** — server là thẩm quyền
timeout duy nhất và **luôn** kết thúc ván khi đồng hồ về 0, nên deadline trôi qua trong im lặng là
*bằng chứng* state đã cũ. Đã cài (deadline + grace 6s) và 22 unit test xanh.

**Playwright bác bỏ nó.** Đặt D = deadline đang theo dõi = t0 + T, và F = lúc đồng hồ **của chính
người kẹt** hết = t1 + T (t1 = lúc đối thủ đi, t1 > t0): kẹt nghĩa là server đang tính giờ *mình*,
nên F > D **luôn luôn**. Bắn ở D + grace là đua với chính cú thua giờ của mình và **thua** mỗi khi
đối thủ đi nhanh hơn `grace`. Đo thật trong trình duyệt: đối thủ đi gần như tức thì ⇒ người kẹt
**thua giờ ở giây 14,8** (DB ghi `reason: timeout`), watchdog hẹn ở giây 21. Sửa tầng nào cũng vô
nghĩa nếu kết cục vẫn đúng bằng nguyên trạng ("người kẹt thua giờ").

### Bản chốt — bắn ở một *phân số* của đồng hồ đang theo dõi

`t0 + αT` với α < 1 luôn **trước** D, nên luôn trước F, bất kể đối thủ đi nhanh cỡ nào. Biên cứu
được là `(1-α)T + thời gian nghĩ của đối thủ`, không bao giờ âm. Chốt **α = 0,75**: ở control mặc
định 60s là bắn ở 45s — **1,8% khoảng lặng thật vượt qua** (25% số ván tốn đúng 1 resync thừa) — và
để lại cho người kẹt ít nhất 15s đồng hồ của họ để thật sự đi.

`client/js/room-socket.js`:

- **Turn watchdog**, arm trong `applyTimerSync` (choke point duy nhất của mọi thay đổi đồng hồ rời
  rạc). Hẹn giờ = `max(floor, min(untilDeadline × 0,75, WAIT_CEILING_MS))`.
  - `WAIT_CEILING_MS = 83500` (p99.9 đo được) cho `per_game`/`blitz` đồng hồ dài hàng phút.
  - **Chỉ arm khi tin rằng KHÔNG phải lượt mình.** Tin là lượt mình mà sai chính là biến thể 2, và
    nó đã có hai đường nhanh hơn (move-confirm watchdog dưới đây, và gap check #152 bắn ngay khi đối
    thủ trả lời). Để arm luôn ở đây thì mỗi lần mình nghĩ lâu trên lượt của chính mình sẽ bị resync —
    đúng cái ca người chơi chắc chắn **không** kẹt. Khán giả không có lượt nên luôn được canh, đúng ý.
  - Bắn xong **tự arm lại** với backoff (nếu chính gói trả lời resync cũng rớt thì không còn gì hẹn
    lần sau); lặp lại trên state không đổi thì `WATCHDOG_FLOOR_MS = 15000` nhân đôi dần — đây là thứ
    khiến vòng lặp resync bất khả thi (cùng lớp bẫy 7 của #152).
  - **Im lặng hoàn toàn với người chơi**: một lần bắn thường không đổi gì nhìn thấy được, và thông
    báo lúc dương tính giả còn ồn hơn chính cái resync.
- **Move-confirm watchdog** (`MOVE_CONFIRM_TIMEOUT_MS = 2500`) cho biến thể 2: `game:moved` được ghi
  vào socket mình **trước** ack (GameHandler emit rồi mới ack, cùng kết nối ⇒ có thứ tự), nên cầm
  được ack rồi mà chưa thấy broadcast nghĩa là nó đã rớt. Arm từ `game-ui.js` khi ack `{ok}`, huỷ khi
  `game:moved` khớp toạ độ xác nhận quân pending.
- **Tự huỷ trên mọi đường đổi state** (bẫy 2 của instruction): `game:ended`, `room:left`,
  `game:interrupted` huỷ hẳn; `room:joined`/`game:init` huỷ move-confirm rồi arm lại qua
  `applyTimerSync`; `game:swap2_state`/`game:undo_applied` (không mang `timerSync`) arm lại tay. Thêm
  một lớp nữa: **chính lúc bắn cũng kiểm lại `status === 'ongoing'`**, nên đường nào quên huỷ cũng
  không thành resync mồ côi.

`client/js/game-ui.js`: nhánh ack thành công của `sendMove` gọi `RoomSocket.armMoveConfirmWatchdog()`.

**Không** sửa gap detection #152, **không** dựng đường resync mới, **không** đụng
`pingInterval`/`pingTimeout` — đúng mục "đừng làm".

## Decision

- **Lệch có chủ đích so với instruction**: file `docs/instruction/B154-*.md` viết "cả hai phía dùng
  chung một ngưỡng N". Thực tế hai phía có bản chất khác nhau — phía chờ đối thủ bị chặn bởi *thời
  gian nghĩ* (phải đo, α × đồng hồ), phía vừa gửi bị chặn bởi *RTT* (gói lẽ ra đã tới trước ack).
  Ép chung một ngưỡng sẽ để quân pending kẹt cả một lượt đồng hồ. Vẫn giữ đúng tinh thần "một cơ chế":
  chung `requestResync()`, chung bộ huỷ, chung chỗ arm.
- **Không** thêm chuỗi i18n: watchdog cố ý im lặng (lý do ở trên), nên không có chuỗi người-dùng-thấy
  nào mới.
- Branch off **`dev`** như #152/#153: `git show main:TODO.md | grep '#154'` không ra gì và
  `sendMove` cũng chưa có trên `main` ⇒ đúng ngoại lệ tracking-docs-only-on-dev của `git-workflow`.

## Summary output

**Unit test — 24 case mới, giữ lại toàn bộ** (`client/tests/turn-watchdog-resync.test.js`):
ngưỡng hai phía (im ở FIRE_AT−1, bắn ở FIRE_AT+1, **bắn trước cả deadline đang theo dõi** — đây là
regression guard cho đúng con bug e2e bắt được), đứng ngoài lượt của chính mình, trần đo được cho
đồng hồ dài, nghĩ 40s trên control mặc định không bị đụng, đồng hồ tạm dừng không arm, nước đối thủ
trỏ lại watchdog, **ca bắt buộc của instruction** (bỏ lỡ nước đối thủ, không ai bấm gì, tự phục hồi),
resync không lặp + backoff + 10 phút im lặng ra "một nhúm chứ không phải hàng trăm", 6 đường tự huỷ,
và 6 case move-confirm.

**Xác nhận test không rỗng** (bài học #131/#152): stash 2 file sửa ra rồi chạy lại → **9/22 fail** (ở
bản nháp đầu). 13 case còn xanh đều là loại "**không được** bắn", xanh sẵn khi chẳng có gì bắn cả —
đúng như mong đợi, cùng hình dạng với 7 case xanh của #152.

**`npm test`: 1342/1342 pass, 69 suite.**

**Verify thật (Playwright, Chromium):** instance **cô lập** — copy `git ls-files` sang scratchpad,
`node_modules` symlink, `.env` riêng, **cổng 3199**, DB mới tinh từ `schema.sql`. Không đụng DB thật
(md5 trước/sau **giống hệt**) và không đụng server thật của người dùng (PID 26640, chạy từ thư mục
khác). Spec mới `e2e/turn-watchdog-resync.spec.ts`, giữ lại trong repo.

Kịch bản: 2 người, control `per_move` 30s, White nuốt trọn gói `game:moved` của Black, **không ai bấm
gì nữa**. Kết quả: White tự resync, quân của Black hiện ra, lượt trả về đúng, `status` vẫn `ongoing`
(**không phải** phục hồi sau khi đã thua giờ), rồi ván đi tiếp bình thường; không có resync storm;
không `pageerror`. Chạy lại trên DB sạch: **0 ván kết thúc** ⇒ không ai thua giờ, khác hẳn lần chạy
bản nháp đầu (`reason: timeout` ở giây 14,8). `e2e/game-move-ack-resync.spec.ts` của #152 chạy cùng
lượt vẫn xanh.

`?v=153 → 154` toàn bộ `client/*.html` + mọi `import '...?v='` trong `client/js/*.js`; grep kiểm
chứng ra **đúng một** giá trị (184 chỗ).

### Còn lại, KHÔNG tự mở rộng phạm vi

α = 0,75 là đánh đổi đo được chứ không phải hằng số đúng-tuyệt-đối: ở control mặc định nó vẫn để
~1,8% khoảng lặng thật tốn một resync thừa, và biên cứu người kẹt là 15s + thời gian nghĩ của đối
thủ. Nếu sau này muốn siết, phải đo lại phân bố (script đo nằm trong fix log này, không phải trong
repo) chứ đừng chỉnh cảm tính. Ván **không có đồng hồ chạy** (mọi phòng hiện đều có timer nên không
xảy ra) sẽ không được canh — ghi ra đây làm địa lôi.
