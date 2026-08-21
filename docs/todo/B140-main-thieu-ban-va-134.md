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
