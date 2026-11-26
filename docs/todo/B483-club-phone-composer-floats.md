# B483 — Club chat (phone): composer floats mid-screen when the stream is short
**Status:** ✅ FIXED 2026-11-26 — `.cl-mid { flex: 1 }` on phones; composer at the tab bar for 0/1/30 msgs, popup open or closed; [fix-log](../fix-log/2026-11-26-483-club-phone-composer.md)
**Area:** `client/css/club.css` (`.cl-mid` in the 860px block)
**From:** B477/B478 browser pass at 390 px, 2026-11-26   **Depends:** —

## Problem
With one or two messages the composer sits mid-screen with blank space down to the tab bar, and moves when the `/` or `@` popup opens. With a full stream it is fine. `.cl-mid` is sized by its content on phones (the rule predates B477).
## Scope
1. Make the centre column fill the remaining height on phones.
## Done when
- At 390 px the composer sits above the tab bar with 0, 1 and 30 messages, popup open or closed.
