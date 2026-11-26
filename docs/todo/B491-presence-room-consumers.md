# B491 — Presence consumer: room seats + spectators (PS-6)
**Status:** ✅ DONE 2026-11-27 — `playerStatusInfo`/`renderStatusDot` delegate to `PresenceView.describe(member, {inRoom})` (inline fallback if the script is missing); dot keeps `ready-dot--*` + adds shared `pres-dot` tone/glyph; room.css colour modifiers replaced by `.ready-dot { --pd: 9px }`; waiting tone = `--c-border` (#114); presence-view loaded on room.html. Room words kept. Countdown NOT added to the dot label: a static title would go stale; the game:interrupted notice already counts down (deviation from Scope 2). Test helper now reads only `ready-dot--*` classes. Visual check pending #497.
**Area:** client/js/room-ui.js, client/css/room.css
**From:** features/presence-status (planning tone table, Q8 A), 2026-11-27   **Depends:** #488
## Scope
1. `playerStatusInfo`/`renderStatusDot` delegate to presence-view; one glyph shape per state (dot-only, aria-label).
2. Reconnecting countdown from `graceUntil` in the label.
## Don't
- Rename room labels "Đang rời trang" / "Mất kết nối" (#113/#114 user choice).
## Done when
- jsdom tests (existing room-slot-status + viewer-presence-dot suites green); design-workflow if visuals change.
