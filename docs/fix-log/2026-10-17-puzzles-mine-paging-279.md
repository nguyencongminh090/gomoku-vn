# 2026-10-17 16:42 — #279 /puzzles/mine paged (20/page)
## Prompt
Do #277 - 279 (ux-audit puzzle findings).
## Root cause
svc.mine() returned every row; route and page had no paging.
## Fix
mine(userId,{page}) → LIMIT/OFFSET with the listApproved pagination shape; /mine spreads it plus canReview; puzzles-mine.js loadPage + pager (#mn-pager). 5-pending limit untouched.
## Verification
Route test: 45 rows → 20/20/5, order, page<1/NaN → 1, past-end empty, per-author. jsdom: pager Sau fetches ?page=2, hidden at 1 page. Full npm test 3329 pass; cache-bust OK. Real browser (Chromium 390×844, scratch DB, 45 puzzles): OK, no console errors.
