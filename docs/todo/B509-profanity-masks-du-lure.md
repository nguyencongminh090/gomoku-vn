# B509 — Profanity filter masks the clean word "dụ" (lure) as "**"
**Status:** OPEN
**Area:** client/js/profanity-filter.js (shared: chat, DM, puzzle title/prompt via server/managers/DmText.js)
**From:** #508 real-browser pass, 2026-11-27 (seed prompt "Dụ Trắng vào góc…" stored as "** Trắng vào góc…")   **Depends:** —

## Problem
`DmText.clean("Dụ Trắng vào góc")` → `"** Trắng vào góc"`; `"dụ địch"` → `"** địch"`. "dụ" (to lure) is a
normal gomoku word. Unaccented "du" is safe (`STRIPPED_DICT_EXCLUDE` has `'du'`), so the accented path
likely folds đ→d / tone marks and matches the dictionary entry `'đụ'` (profanity-filter.js:84).

## Scope
1. Root-cause where "dụ" collides with "đụ" (normalize/fold stage vs dictionary lookup) before patching.
2. Fix so "dụ" (and "dụ dỗ") pass while "đụ", "đụ mẹ", "đụ má" stay masked.
3. Kept regression test in the existing profanity-filter suite (both directions, plus a puzzle prompt via DmText.clean).
4. One fix-log entry.

## Don't
- Don't re-enable fuzzy/edit-distance matching (turned off 2026-08-09 after "filter too strong").
- Don't touch stored puzzle rows (already masked text stays; authors can edit).

## Traps
- Filter is shared by chat/DM/club chat: check other d/đ pairs (dái/đái…) aren't broken by the fix.
- Shared client file → `node scripts/cache-bust.js --write`.

## Done when
- Test green: "dụ" kept, "đụ" masked; `npm test` passes.
