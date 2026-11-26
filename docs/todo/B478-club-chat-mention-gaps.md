# B478 — Club chat: mention popup gaps (M1–M5)
**Status:** OPEN
**Area:** `client/js/club.js` (renderHints/pickHint/hintKeys), `client/css/club.css`, `client/club.html`, i18n, `client/tests/`
**From:** [features/club-chat-refactor](../../features/club-chat-refactor/planning.md) §3, mockup `edit`, 2026-11-26   **Depends:** —

## Scope
1. **M1:** match the display name *and* the username by word prefix, folding case and diacritics (NFD, strip marks, đ→d).
   - Rows show the avatar (through `PlatformShell.avatar`), the display name with the matched part marked, `@username` and the role.
2. **M2:** when `visualViewport.height < 0.75 × innerHeight`, set `.is-kbd` on `.cl-hq`, which folds the rail, banner and channel strip on phones.
   - The popup max-height is the room between the channel header and the input, minus 96 px, with at most 4 rows on a phone.
   - `scrollIntoView({block:'nearest'})` on the active option.
3. **M3:** pick on `pointerdown` + `preventDefault`. Drop the 150 ms blur race.
4. **M4:** move "Hoặc", "Ban quản trị", "Tất cả thành viên" and the listbox label to i18n.
   - The listbox label is "Gợi ý thành viên" or "Lệnh" depending on mode. Add a polite count.
5. **M5:** after 5 names, show the hint "Chỉ 5 người đầu được báo".

## Don't
- Change the server mention rules, the cap or the cooldowns.
## Traps
- Keep the IME guard (`isComposing` / keyCode 229).
- `.is-kbd` must clear when the keyboard closes (`visualViewport` resize).
## Done when
- jsdom covers: folding match (`@duc` → "Đức Anh", `@hoa` → "Hoa Mai"), active option scrolled into view, the mode label, the cap hint.
- Full `npm test` passes, cache-bust prints OK, and a real-browser pass at 390 px with touch emulation and on desktop, in both themes.
