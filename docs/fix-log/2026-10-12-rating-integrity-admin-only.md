# 2026-10-12 14:40 — #249 rating-integrity view is admin-only
## Prompt
"chỉ xem kết quả phân tích là tín hiệu và không đưa ra bất kỳ hình thức xử lý nào. Và chức năng này chỉ có admin xem"
## Root cause
The endpoint and tab reused `cheat.review` (moderator + admin), so moderators could open collusion signals.
## Fix
New permission `rating.integrity: ['admin']` in `server/utils/roles.js`; `RatingIntegrityService.report` and the
`/admin` tab (`data-perm`) use it. Output stays read-only: no action, flag state or rating effect exists (service has no
writes). Branch fix/249-integrity-admin-only off dev. ?v bumped.
## Verification
- Test: member and moderator get `RatingIntegrityError`, admin gets the report; `permissionsOf` lists the perm for admin only.
- Not re-checked in a browser (only the tab's `data-perm` and perm name changed).
