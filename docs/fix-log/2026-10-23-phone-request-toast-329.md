# 2026-10-23 13:56 — #329 phone request toast covered
## Prompt
"Draw offer,... on phone is covered. Do browser pass first"
## Root cause
`.gtoasts` absolute at top:52px (sized for the expanded panel). Minimized panel = 93px, so the toast overflowed its bottom: covered the chat bar, ✓/✕ clipped by `overflow:clip`. Seen first in a real browser (iPhone 13, 2 guests, draw offer emitted by the opponent).
## Fix
room-arena.css phone block: `.rpanel--min .gtoasts { position: static; margin: 6px 8px 0 }`. Expanded/desktop untouched. Branch fix/329-phone-request-toast-covered. ?v= rewritten (room.html).
## Verification
jsdom CSS test (fails without the rule). Browser pass before/after: toast now fully visible with ✓/✕. Trade-off: the panel grows 58px, so the chat input sits ~60px below the fold until the offer is answered/scroll. NOT checked: 320/360 widths, undo/time toasts (same container), expanded + scrolled-up (toast scrolls away with the panel).
