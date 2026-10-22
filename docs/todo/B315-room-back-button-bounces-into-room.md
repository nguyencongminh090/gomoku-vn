# B315 — Browser Back from a room bounces straight back into the room (mobile)
**Status:** CLOSED — by design (2026-10-22): browser Back auto-resume is deliberate; room already has `#btn-leave` (icon-only on mobile). No code change.
**Area:** client/js/lobby.js (`room:joined` handler ~L289), server lobby:subscribe auto-join, room.html leave control
**From:** ux-audit lobby mobile M1, 2026-10-22 (`docs/audits/ux-audit-2026-10-22-lobby-mobile.md`)   **Depends:** —

## Problem
Lobby → Tạo phòng → Tạo nhanh → room → browser Back: nav goes `index.html#rooms` then at once
`room.html?id=…` (framenavigated trace). On a phone Back cannot leave a room. Cause (suspected):
server emits `room:joined` on lobby subscribe while the user is still seated →
`location.replace(room.html…)`. No visible leave control found in the room (text search `rời|thoát|sảnh`).
## Scope
1. Decide intent with user: auto-resume is deliberate or not (ask ONE question).
2. If deliberate: show a "Quay lại phòng #XXX" banner on the lobby instead of redirecting on `back_forward` navigation; ensure room has an explicit Leave control.
3. If not: skip the redirect when `performance.getEntriesByType('navigation')[0].type === 'back_forward'`.
4. Regression test (jsdom for the handler) + real-browser Back pass at 375px.
## Don't
- Don't drop auto-redirect for fresh loads / reconnect after refresh (resume-after-crash must keep working).
## Traps
- Leaving the room via Back must not leave a ghost seat: check what server does on leave vs disconnect.
## Why this way
Banner keeps resume safety without trapping history. Rejected: removing the redirect entirely (breaks resume). Knowledge: none.
## Done when
- At 375px, Back from a freshly created room stays on the lobby.
- Refreshing a room page still returns to the room.
- New jsdom test + `npm test` green; `node scripts/cache-bust.js --write` verified OK.
