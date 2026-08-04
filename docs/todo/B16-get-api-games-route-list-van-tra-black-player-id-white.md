# Phần B #16. `GET /api/games` (route list) vẫn trả `black_player_id`/`white_player_id`

**Nguồn:** phát hiện khi làm Phần B #4 (2026-08-02)


16. ~~**`GET /api/games` (route list) vẫn trả `black_player_id`/`white_player_id`**~~
    **✅ ĐÃ XONG** (2026-08-02, commit `3664314`, merge `5e7fd79`, làm cùng mục 17) — bỏ 2 cột
    khỏi response của cả `getRecentGames` (list) lẫn `getGameById` (`:id`).
    **Không dừng ở việc bỏ cột:** dữ liệu cũ (trước khi `saveGame` chuẩn hoá
    `winner` thành màu ghế) lưu `winner` = chính raw player id — nếu chỉ bỏ 2
    cột `*_player_id` mà giữ nguyên `winner`, id vẫn lộ qua trường khác. Nay
    `winner` cũng được chuẩn hoá về `'BLACK'`/`'WHITE'`/`'draw'`/`null` trước
    khi trả về (xem mục 17). Chi tiết: `docs/fix-log.md`.
