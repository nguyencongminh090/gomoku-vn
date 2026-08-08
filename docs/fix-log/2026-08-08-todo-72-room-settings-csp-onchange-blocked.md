# Fix log entry — 2026-08-08 14:56

## Prompt

User report: "User cannot change Display (Paper/Stone) It auto get back."

## Action

Traced the report through `client/js/room-ui.js` and `client/js/board.js`/`game-ui.js` first via
static read — no obvious bug in the state-management code (`RoomState.boardDisplayMode` is a
singleton, correctly read/written). Reproduced live instead with Playwright against a throwaway
server + throwaway DB (moved `server/db/gomoku.db`/`-wal`/`-shm` aside, restored after — verified
`PRAGMA integrity_check = ok` and all 8 tables present post-restore). Root cause: CSP
`scriptSrcAttr: ["'none'"]` (`server/config/csp.js`, added TODO.md #65) silently blocks the inline
`onchange="updateLocalSettings()"` / `onchange="updateSettings()"` attributes on all 18 form
controls in the in-room Settings tab (`renderLocalSettingsControl()`/`renderSettings()`,
`room-ui.js:320-403`). A radio's native `checked` state still flips on click (browser default,
no JS needed), but the handler that would persist it never fires — confirmed via a CSP violation
in the browser console. The next `room:updated`-triggered re-render then rebuilds the tab's HTML
from the still-unchanged stored value, snapping the UI back — exactly the "auto get back" behavior
reported.

Confirmed the same code (`onchange=` attributes) exists on `main` too, but `main`'s
`server/index.js` runs `helmet({ contentSecurityPolicy: false })` — the CSP hardening that breaks
these handlers is a `dev`-only feature (TODO.md #65, not yet merged to `main`), so the bug itself
cannot occur on `main`. Per `CLAUDE.md`'s "fix for code that only exists on dev" exception,
branched off `dev` instead of `main`.

## Decision

User confirmed (via AskUserQuestion) fixing the entire Settings tab in one pass rather than only
the 2 reported Paper/Stone radios, since all 18 controls share the identical verified root cause —
leaving 16 known-broken siblings would just generate more of the same report later. User also
confirmed (separately) the `fix/` branch should target `dev` (not `main`) after the CSP-only-on-dev
finding, and directed stopping their own already-running dev server on port 3000 so an isolated
throwaway instance could be used for reproduction/verification instead.

## Summary output

**Fix:** extended `client/js/action-delegate.js` with a second delegated listener — `change` events
on `[data-change-action]`, calling the named `window`-level function with no arguments (mirrors the
existing `click`/`[data-action]` delegator added for the same CSP reason, kept as a separate
attribute rather than reused because a radio/checkbox click fires both `click` and `change`, and
sharing one attribute would double-invoke the handler). Converted all 18
`onchange="updateSettings()"` / `onchange="updateLocalSettings()"` occurrences in
`client/js/room-ui.js` to `data-change-action="updateSettings"` / `data-change-action="updateLocalSettings"`.
Bumped `?v=81` → `?v=82` across every `client/*.html` and `client/js/*.js` reference per the
cache-busting rule (verified via the required single-value grep).

**Test:** `client/js/` has no Jest/jsdom runner for DOM-event-dependent code (unlike
`escape-utils.js`, a pure-string module `require()`-able straight from Node) — stated explicitly
per `CLAUDE.md`'s bug-fix workflow rather than skipped silently. `npm test` (931 tests, server-side
only, unaffected by this client-only change) still passes. Verified instead with a live
before/after Playwright repro against a throwaway server + throwaway DB: before the fix, clicking
"Stone" changed the visible radio but left `localStorage`/`RoomState.boardDisplayMode` at `'paper'`
and logged one CSP violation, then reverted visibly once a second guest joined the room
(`room:updated`); after the fix, the same click updates `localStorage`/`RoomState.boardDisplayMode`
immediately with no CSP violation, and the value (tested for both display mode and board size)
survives a second guest joining.

Branch: `fix/csp-inline-handlers-room-settings`, off `dev` (see Decision above for why not `main`).
