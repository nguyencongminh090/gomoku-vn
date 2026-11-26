# B476 — Club chat: message actions UI (toolbar, long-press sheet, edit mode)
**Status:** ✅ DONE 2026-11-26 — toolbar/menu/sheet/edit mode/dialogs; 13 jsdom tests in `client/tests/clubs-pages.test.js`, full `npm test` 5013/5013, browser pass (isolated DB, 2 members)
**Area:** `client/club.html`, `client/js/club.js`, `client/css/club.css`, `client/js/i18n.js`, sprite (`dots-three`), `docs/knowledge/ui-ux/iconography.md` registry, `client/tests/`
**From:** [features/club-chat-refactor](../../features/club-chat-refactor/planning.md) §5, mockups `actions`/`edit`/`delete`/`report`, decided 2026-11-26   **Depends:** B475

## Scope
1. **Desktop:** a floating `role=toolbar` on hover and `:focus-within`, with roving tabindex.
   - Own message: Sửa, Xoá, ⋯. Others' message: Báo cáo, ⋯, plus Xoá for staff who outrank the author.
   - The ⋯ menu follows the APG menu button pattern and flips up near the bottom.
2. **Phone:** long-press (450 ms; cancelled by more than 8 px of movement, by scroll, or by `pointercancel`) or `contextmenu` opens a bottom-sheet `<dialog>` with a preview.
   - Items: Sửa, Sao chép, **Chọn văn bản** (Q5), Xoá, Báo cáo.
   - The row gets `.is-selected` until the sheet closes. Focus then returns to the row's ⋯ button.
3. **Non-gesture path:** a real ⋯ button on every row, always in the accessibility tree and visually hidden on touch until focused.
4. **Edit in the composer:**
   - An "Đang sửa tin nhắn" bar with ×, the send button showing ✓, and Esc to cancel.
   - Up-arrow in an empty composer edits your last text message.
   - Bump the row's `data-v` before PATCH, so an older in-flight tick can't repaint it.
5. Render the "đã sửa" label. Apply `edited` rows from the poll tick in place.
   - Advance the `rev` cursor only from `GET` responses. Never move the unread dot.
6. **Dialogs:**
   - The delete-confirm dialog names the author and focuses "Huỷ"; a staff delete adds the nhật-ký note.
   - The report dialog (radios, plus text for "Khác") replaces `window.prompt`.
   - All dialogs live inside `.cl-hq`.
7. All strings go through i18n, in sentence case, in light and dark.

## Don't
- Use `innerHTML`; build nodes with `el()`. The mockup's `innerHTML` is for static data only.
- Put `user-select: none` anywhere except message rows on coarse pointers.
## Traps
- Touch layouts currently show the flag and trash buttons on every row (`@media (hover: hover)`); remove that.
- The sprite needs `dots-three` added, plus a registry row.
## Done when
- jsdom: toolbar per role, sheet items per role, edit-mode lifecycle, the `rev` cursor not advanced by PATCH, `edited` rows applied.
- Full `npm test` passes and `node scripts/cache-bust.js` prints OK.
- Real browser on an isolated DB at 390 px and desktop, in both themes: two members, where an edit and a delete by one appear for the other, and the /admin club report queue shows `prior`/`later` (B475).
- Long-press on a real device stays unverified unless it is actually tried.
## Result (deviations)
- Copy uses `EscapeUtils.decodeChatText` (wire escapes only `<`/`>`). "Lý do khác" sends the typed text only and requires it (server: 1–200 chars).
- Backdrop tap closes the sheet only if the press also started on the backdrop: the finger lifting after the long-press clicks the backdrop (Chromium touch emulation). Desktop right-click keeps the native menu while text is selected. Jsdom harness now clears each boot's 8 s tick (old ticks appended rows mid-test).
- Browser pass (isolated DB, both themes, 1280 and 390 touch): edits and deletes reached the other member on the next tick, and admin `prior`/`later` showed. Real-device long-press unverified. Found B481.
