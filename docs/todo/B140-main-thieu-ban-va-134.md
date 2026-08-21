# #140 — `main` không có bản vá #134 dù hồ sơ ghi nhánh `fix/*` off `main`

**Trạng thái:** ⏳ Chưa làm — cần đối chiếu quy trình merge, chưa rõ đây là lỗi hay là chủ ý.

**Nguồn:** kiểm chứng phụ khi tái hiện #136 (2026-08-21).

## Sự việc

```
git show main:client/js/room.js | grep -c drawerBreakpoint   → 0
git show dev:client/js/room.js  | grep -c drawerBreakpoint   → 2
curl -s https://play3cr.dpdns.org/js/room.js?v=139 | grep -c drawerBreakpoint → 2
```

`docs/todo/B134-*.md` ghi rõ nhánh `fix/sidebar-drawer-collapsed-stuck` **off `main`**, và lịch sử
có `8580ae8 Merge pull request #18 from nguyencongminh090/fix/sidebar-drawer-collapsed-stuck`. Nhưng
nội dung bản vá hiện chỉ có trên `dev`; production đang phục vụ nội dung `dev`.

## Cần làm rõ

1. `main` có thật sự thiếu bản vá không, hay chỉ là commit nằm ở nhánh khác/đã bị revert khi merge?
   (`git log main --oneline -- client/js/room.js`, `git log --all --oneline --grep=134`.)
2. Nếu thiếu thật: theo `git-workflow` của repo, fix off `main` phải có mặt ở **cả hai** nhánh. Bù
   lại bằng merge checkpoint chứ không cherry-pick thủ công một mình.
3. Rà thêm các fix `main`-based gần đây có rơi vào cùng tình trạng không — nếu có, đây là lỗi quy
   trình chứ không phải một lần lỡ tay.

Đây thuần tuý là kỷ luật nhánh, không đụng code sản phẩm.

---

## Kết luận — 2026-08-21: **báo động giả, lỗi đo của tôi**

**Trạng thái:** ✅ Đã đóng — không phải lỗi quy trình, `main` hoàn toàn bình thường.

### Sự thật

`origin/main` **có** bản vá #134 và có luôn file test của nó:

```
git log --oneline main..origin/main
  fd911b0 Merge pull request #19 from .../chore/cache-bust-138-align-main
  7591b7a chore: align main's ?v= cache-bust counter with dev (138)
  8580ae8 Merge pull request #18 from .../fix/sidebar-drawer-collapsed-stuck
  8763488 fix: sidebar drawer stuck collapsed past its mobile breakpoint (TODO.md #134)

git show origin/main:client/js/room.js | grep -c drawerBreakpoint   → 2
git worktree add /tmp/main-check origin/main && ls client/tests/    → có
                                    room-zen-drawer-collapsed-recovery.test.js
gh pr view 18                        → MERGED vào main, merge commit 8580ae8
```

### Nguyên nhân của báo cáo sai

`main` **cục bộ** đang đứng sau `origin/main` **4 commit** (`ef73e00`, tức trước cả PR #18). Tôi
chạy `git show main:client/js/room.js` mà **không `git fetch` trước**, đọc trúng bản cũ, rồi kết
luận "main thiếu bản vá". Bài học đúng nghĩa đen của quy tắc trong `git-workflow`: *"Before opening a
`dev`→`main` checkpoint-merge PR, check divergence first — `git fetch origin`"* — quy tắc đó dành cho
lúc merge, nhưng cùng lý do áp dụng cho **mọi** khẳng định về nội dung một nhánh.

### Đã sửa những gì

1. `git checkout main && git merge --ff-only origin/main` — `main` cục bộ đã bắt kịp (`fd911b0`).
2. Checkpoint merge `origin/main` → `dev`: chỉ có xung đột `?v=` (main 138 vs dev 140), giải theo
   `dev`. **Không bump lên 141**: hai commit của `main` thuần là căn chỉnh số `?v=`, `git diff` giữa
   cây `dev` trước và sau merge cho **rỗng** ở toàn bộ `client/` ⇒ không có byte nội dung nào đổi,
   nên `?v=140` vẫn trỏ đúng nội dung nó đang trỏ (quy tắc `+1` áp dụng khi **nội dung** đổi, không
   phải khi merge một commit thuần đánh số). `npm test` 1204/1204 sau merge.
3. Đính chính câu ghi sai trong hồ sơ #139 — xem dòng đính chính trong `docs/fix-log.md`.

### Hệ quả còn lại cần người dùng quyết

Nhánh `fix/mobile-start-modal-behind-sheet` (#139) được cắt từ `main` **cũ** (`?v=135`), trong khi
`main` thật đang ở `?v=138`. Nhánh đó đã merge vào `dev` và `dev` đã ở `?v=140` — an toàn. Nhưng nếu
muốn đưa #139 lên `main` bằng chính nhánh đó thì PR sẽ vướng `?v=` và phải giải lại. Hai lựa chọn,
người dùng chọn: (a) cắt lại nhánh fix từ `main` hiện tại rồi PR, hoặc (b) để #139 lên `main` theo
đợt checkpoint `dev`→`main` chung.
