# B479 — Club chat: poll setup sheet
**Status:** ✅ DONE 2026-11-26 — poll sheet rebuilt on branch feature/479-club-poll-sheet; full `npm test` 5043/5043, cache-bust OK, Chromium pass 390 px (touch emulation) + 1280 px, both themes, temp DB. NOT tried on a real phone keyboard. n/6 sits in the options header (as in the mockup); error summary at the top of the sheet (mockup, not planning §4 "above the buttons")
**Area:** `client/club.html` (`#cb-poll-editor`), `client/js/club.js` (openPoll/addOption/previewPoll), `client/css/club.css`, sprite (`arrow-up`, `arrow-down`), iconography registry, i18n, tests
**From:** [features/club-chat-refactor](../../features/club-chat-refactor/planning.md) §4, mockup `poll`, 2026-11-26   **Depends:** —

## Scope
1. A bottom sheet on phones and a 560 px dialog on desktop.
2. Question field with a 0/140 counter.
3. Option rows contain a number, an input, ↑ ↓ (disabled at the ends) and × (disabled at 2 options).
   - "Thêm lựa chọn" shows n/6.
   - Enter in the last option adds the next one.
4. The live preview renders the **real** poll card (`renderPoll` with zero votes, disabled).
5. Inline errors map to `validatePoll` codes: `usage`, `duplicate` (folded), `too_long`, `too_many`.
   - After a failed submit, show the error summary with links and focus the first bad field.
   - The server's error is shown in the same summary.
6. Static note: "Đóng sau 24 giờ…".

## Don't
- Add drag-and-drop or a library; reorder is buttons only.
- Change the server limits or the duration (that is P6).
## Traps
- Duplicate detection must use the same folding as the server: `toLocaleLowerCase('vi')`. Check whether the client should also strip diacritics; if not, match the server exactly.
## Done when
- jsdom covers: add, remove, reorder, button disabled states, each error code, the preview matching the inputs, the slash prefill.
- Full `npm test` passes, cache-bust prints OK, and a real-browser pass at 390 px and desktop, in both themes.
