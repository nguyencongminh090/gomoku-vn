# #328 Quick-match status line: "A · B · C" string → chips + note

- **Symptom:** `#qm-line` joined parts with " · " (ticket-rows.md violation); the guest sentence rendered long and run-on.
- **Root cause:** `renderQuickMatch` built the line by string concatenation + `textContent`.
- **Fix:** `setSegments(line, parts)` (`lobby-home.js`): first part = plain `.qm-line__lead`, rest = `.rtag` chips; `{text, cls}` overrides — rule chip `rtag--rule` (green), guest sentence `qm-line__note` (full-width line). `.qm-line` is flex-wrap with `gap` in `shell.css`. `qm.selected` in `i18n.js` lost its `{sel}` placeholder. Audit M1 (note as chip) and L1 (green hit the queue chip via `:nth-child`) closed by the explicit classes.
- **Test:** `lobby-home.test.js` — guest: no "·", note span, exactly one `rtag--rule`; searching: 2 spans, no `rtag--rule`.
- **Browser (headless, throwaway DB, guest):** 375/1280: chips + note render, no overflow, rule change updates, search→cancel restores, 0 console errors. **Unverified:** queue/ETA chips with real waiters, member view, English locale, light/dark.
