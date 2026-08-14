# Fix log entry — 2026-08-14 16:13

## Prompt

User reported, with a real Safari iOS screenshot (`play3cr.dpdns.org`, room page): "UI sometimes
become unstable and distort/wrong responsive." Asked for a briefly, direct architecture report in
Vietnamese with root cause, if any exists.

## Action

Delegated investigation to a background agent (CodeGraph-assisted) rather than reading files
myself, per session guidance to avoid duplicating research. Root-cause hypothesis from static code
reading (no device repro possible — user has no Safari iOS/iPhone):

- `client/css/room.css:58` and `client/css/room-zen.css:302` size `.board-area-shell` with
  `calc(100vh - ...)`. On iOS Safari, `100vh` is pinned to the largest viewport (toolbar hidden);
  every toolbar show/hide during scroll fires `resize` events, sometimes several in quick
  succession while the toolbar animates.
- `client/js/game-ui.js:113-114` had an unthrottled `window.addEventListener('resize', ...)` that
  ran the full, read-heavy `BoardRenderer.resize()` synchronously on every event — if that runs
  mid-toolbar-animation, it bakes a transient `innerHeight` into the canvas's fixed pixel
  dimensions, with no guaranteed follow-up recompute once the toolbar settles.
- Prior precedent: `docs/fix-log/2026-08-13-zen-room-board-sizing-and-chat-input.md` documented a
  real non-square-canvas bug in this exact `resize()`/shell-measurement code path.

Filed as `TODO.md` #118 / `instruction.md` B118 per the "stack, don't perform directly" rule, since
this was a report mid-conversation, not an explicit "fix it now." Asked the user how to proceed
given no way to reproduce on real Safari iOS; user chose to apply the defensive fix now rather than
wait for device access.

Initial edits were mistakenly made directly on `dev` (uncommitted). Caught before committing: this
repo's `git-workflow` requires bug fixes to branch as `fix/<slug>` off `main` (the affected code —
`room.css`, `game-ui.js` — exists on `main`, not just `dev`). Stashed the `dev`-branch edits
(`git stash push -u`), fast-forwarded `main` (which had picked up 7 new commits including TODO.md
#113-#117 merges since this session last checked it), branched `fix/mobile-board-resize-dvh` off
the now-current `main`, and reapplied the fix cleanly there instead of trying to pop the stash
across the version gap (`main`'s `?v=` was 120, matching what `dev` had after #113-#117 — no drift
to reconcile).

## Decision

Applied the fix as a **defensive/preventive** change based on well-known WebKit/Safari behavior,
explicitly not verified against the reported symptom on a real device:

- `client/css/room.css:59`, `client/css/room-zen.css:302` — added `height: calc(100dvh - ...)`
  immediately after the existing `100vh` line (kept as fallback for browsers without `dvh` support;
  plain CSS cascade handles the override, no `@supports` needed).
- `client/js/game-ui.js:113-125` — gated the `resize` handler behind `requestAnimationFrame` with a
  `window._boardResizePending` flag, so at most one `BoardRenderer.resize()` call is in flight at a
  time instead of running synchronously on every fired `resize` event.
- `?v=` bumped 120 → 121 across all `client/*.html` and `client/js/*.js` (mockups excluded per
  `CLAUDE.md`), verified with the required grep (single distinct value).
- Left `visualViewport` API and other `resize()` call sites (`room.js`, `room-socket.js`) untouched
  — held in reserve if the user's follow-up report shows the fix wasn't sufficient.
- Did not touch `tournament-match.js`/`tournament-match.html` — original report only showed
  `room.html`.

## Summary output

`TODO.md` #118 marked ✅ with an explicit caveat: fix applied without device reproduction, pending
confirmation from the original reporter after deploy. `docs/todo/B118-*.md` and
`docs/instruction/B118-*.md` created and kept in sync. No unit tests — pure client-side
responsive/CSS issue, no `client/js/` test infra, and Chromium DevTools mobile emulation doesn't
reproduce Safari's `100vh`-toolbar interaction, so this specific bug can't be verified by the
existing Playwright setup either. Flagged as a known verification gap in the detail file rather than
silently claimed as fixed. Branch `fix/mobile-board-resize-dvh` off `main`, one commit pending, to
be merged to `main` (PR) then forward-merged into `dev` per the "fix merged to main must also land
on dev, same session" rule.
