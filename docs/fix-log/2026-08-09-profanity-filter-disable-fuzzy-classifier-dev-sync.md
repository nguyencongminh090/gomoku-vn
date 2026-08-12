# Fix log entry — 2026-08-09 23:54

## Prompt

Same user report/instruction as the `main` fix (see
`docs/fix-log/2026-08-09-profanity-filter-disable-fuzzy-classifier.md`): "bad word filter is too
strong" → "turn off SVM, turn off distance scale, only keep normalize (duplicate) + dictionary."

## Action

The first pass of this fix branched off `main` (confirmed `client/js/profanity-filter.js` was
byte-identical between `main` and `dev` at the time) and merged there via PR #3, since that's the
standard bug-fix workflow base branch. That left `dev` — where this repo's actual day-to-day work
happens, and which had already diverged from `main` on every cache-busted `client/*.html`/
`client/js/*.js` file (`dev` at `?v=96` vs. `main` at `?v=95`, from unrelated feature work not yet
merged down) — still running the old fuzzy/classifier-enabled filter. A straight `git merge main`
into `dev` would have been the more "natural" sync, but risked pulling in `main`'s stale/divergent
content for every other cache-busted file; instead, applied the identical, already-verified
`filterMessage()` orchestration change and test additions directly to `dev`'s copies of
`client/js/profanity-filter.js` and `server/tests/profanity-filter.test.js`, then bumped `dev`'s own
cache-buster (`?v=96` → `?v=97`) rather than reusing `main`'s new number.

## Decision

User said "PR & merge" for the `main`-side fix; syncing the same fix onto `dev` (so the branch the
user actually runs isn't left with the pre-fix behavior) follows directly from that without a
separate decision point.

## Summary output

**Fix:** identical `filterMessage()` change as the `main` fix — exact-dictionary-match only, fuzzy
edit-distance and the classifier reject-stage both disabled — applied to `dev`'s
`client/js/profanity-filter.js`. Bumped `?v=96` → `?v=97` across every `client/*.html` and
`client/js/*.js` reference on `dev` (verified via the required single-value grep, `dev`-relative).

**Test:** same 4 regression tests added to `server/tests/profanity-filter.test.js` on `dev` (kept
permanently). Full suite: `npm test` — 984/984 passing (42 suites; `dev` has one additional client-side
jsdom suite beyond `main`'s 981), including all 66 tests in `profanity-filter.test.js`.

Branch: `fix/profanity-filter-disable-fuzzy-classifier-dev`, off `dev` — merges back to `dev` per the
local-merge convention (not `main`, which already has this fix via PR #3).
