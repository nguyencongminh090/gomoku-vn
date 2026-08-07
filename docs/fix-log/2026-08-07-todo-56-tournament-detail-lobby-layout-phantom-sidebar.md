# Fix log entry — 2026-08-07 10:18

## Prompt

User: "do #56" — TODO.md #56 item 2 (item 1, the mobile tab-content collapse, was already confirmed
fixed as a side effect of the #52 full-refactor and only needed the TODO note updated, per
[docs/todo/B56-tournament-match-mobile-tab-content-collapse-va-lobby-layout.md](../todo/B56-tournament-match-mobile-tab-content-collapse-va-lobby-layout.md)).
Item 2 — `tournament.html` reusing `.lobby-layout` (a `1fr 260px` grid meant for `index.html`'s
sidebar) without ever rendering a `.lobby-sidebar` — was still open and unverified.

## Action

Confirmed the dead-space column live: at 1280px, `.lobby-layout`'s grid reserved a 260px column for
a sidebar `tournament.html` never renders, so `.lobby` (the actual content column) was capped to
~900px instead of the full 1160px `max-width`, leaving a visible empty gap on the right (matches
what #52 already found and fixed for `tournament-match.html`'s equivalent problem, just via a
different code path since that page no longer uses `.lobby-layout` at all post-refactor).

The `.lobby-layout--single` modifier the original B56 note proposed reusing turned out to no longer
exist in the codebase (it belonged to `tournament-match.html`'s pre-full-refactor approach, since
removed) — recreated it as a small addition in `client/css/lobby.css`:
```css
.lobby-layout--single { grid-template-columns: 1fr; }
```
and added the `lobby-layout--single` class to `tournament.html`'s wrapper div (alongside the existing
`lobby-layout` class, so `index.html` — which does render a sidebar — is untouched).

Verified via Playwright against a throwaway DB: at 1280px, `getComputedStyle(.lobby-layout)
.gridTemplateColumns` changed from `"900px 260px"` to `"1160px"`, and `.lobby`'s rendered width from
~900px to the full 1160px — the phantom column is gone, content now matches the width used by every
other `.lobby-layout` page. At 375px, `.lobby-layout` still correctly collapses to a single `375px`
column via the pre-existing `@media (max-width: 900px)` override (unaffected by this change, mobile
was never the affected case for item 2).

## Decision

CSS + one class attribute only (`client/css/lobby.css`, `client/tournament.html`) — bumped
cache-bust `?v=70` → `?v=71` across every `client/*.html`/`client/js/*.js` location, verified with
`grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup` showing a single `?v=71` value.

No new Jest unit test — pure CSS/layout change with no server code touched;
`client/js`/`client/css` have no test infrastructure per `CLAUDE.md`'s bug-fix-workflow rule.
Verified live via Playwright instead (see above) rather than just reading the CSS.

Mid-verification, an unrelated leftover `node server/index.js` process from an earlier task turned
out to still be running when this task's DB-safety `mv` was performed, causing a port conflict and a
second, empty `gomoku.db` to get created at the real path when the new instance's DB layer initialized
before its `.listen()` call failed on `EADDRINUSE`. Caught immediately (`SELECT COUNT(*) FROM users`
on the new file returned 0, vs. 3 real users): killed all `node server/index.js` processes, confirmed
the empty file was untouched by any client (server never finished starting), discarded it, and
restored the real db from the `.pre-e2e` backup — verified by md5 checksum and row counts (3
users / 25 games) matching pre-task values before proceeding.

`tournament.html` only exists on `dev` (not yet merged to `main`), so this fix branches off `dev`
(`fix/tournament-detail-lobby-layout-sidebar`) and merges back to `dev`, per `CLAUDE.md`'s dev-only
exception.

## Summary output

`npm test`: 809/809 passing (unchanged — no server code touched). Live Playwright verification: the
260px phantom sidebar column on `tournament.html` is gone at desktop widths; content now spans the
full 1160px layout width instead of ~900px. Mobile layout (≤900px) unaffected, still single-column.
