# Fix log entry — 2026-08-09 09:33

## Prompt

TODO.md #80 (user report, 2026-08-09): "no time alert for 10s left in
tournament room (normal room has it)".

## Action

Investigated via `codegraph_explore` + direct file reads before filing/
fixing. The alert *mechanism* (red text color + a once-per-second beep
through `audioManager.playTimerTickSound()`) already existed identically in
both rooms — it was added to the tournament room under `TODO.md #74`
(`client/js/tournament-match.js:498-501`, ported from
`room-socket.js:274-285`). Confirmed the port is on `dev` (commit
`5fbeb64`) and wired correctly: `audio-manager.js` is loaded in
`tournament-match.html`, `window.audioManager` exists, the beep condition
mirrors the normal room's exactly.

The actual gap was narrower: the normal room's low-time clock also gets a
pulsing blink —

```css
/* client/css/game.css:102-105 */
.turn-bar__timer--low {
  color: #c0392b;
  animation: timer-pulse 0.6s ease-in-out infinite alternate;
}
```

— while the tournament room's equivalent class only changed color, with no
animation:

```css
/* client/css/tournament.css:202, before this fix */
.match-clock__time.is-low { color: var(--c-error, #EF4444); }
```

So the visual alert was present but static (no motion), easy to miss next
to the normal room's flashing one — this reads as "no alert" even though
color + audio both already fire.

Fix: added the same `timer-pulse` animation to `.match-clock__time.is-low`
(`client/css/tournament.css:202`). Reused the existing `@keyframes
timer-pulse` from `game.css` rather than duplicating it — `game.css` is
already loaded before `tournament.css` in `tournament-match.html`
(`<link>` order confirmed), so the keyframe is in scope without a new
declaration.

Bumped the shared cache-bust version `?v=90 → ?v=91` across every
`client/*.html` and every `?v=` import in `client/js/*.js`; confirmed with
`grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup` showing a
single `?v=91` value.

## Decision

No JS change — the beep/color trigger logic was already correct and
symmetric between the two rooms; this was purely a missing CSS animation
declaration. No new keyframe was added (reused `game.css`'s), keeping the
change to a single line. No Jest unit test — this is a pure
`client/css/` styling change, which `CLAUDE.md` notes has no automated test
runner for `client/`. Did not touch the beep/audio logic since it was
already verified working under `TODO.md #74`.

## Summary output

`npm test`: unaffected (no server or Jest-covered code touched).

Verified statically rather than with a live Playwright run (low risk,
single-property CSS addition reusing an existing, already-tested keyframe):
confirmed `@keyframes timer-pulse` is defined exactly once
(`game.css:107`), confirmed `game.css` loads before `tournament.css` in
`tournament-match.html`'s `<link>` order so the keyframe is in scope, and
confirmed the version-bump grep shows exactly one `?v=91` across all
non-mockup client files.
