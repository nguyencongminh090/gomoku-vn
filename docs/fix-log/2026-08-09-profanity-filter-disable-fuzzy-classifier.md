# Fix log entry — 2026-08-09 23:38

## Prompt

User report: "bad word filter is too strong." Direct follow-up instruction: "Now: turn off SVM,
turn off distance scale, only keep normalize (duplicate) + dictionary."

## Action

`client/js/profanity-filter.js`'s `filterMessage()` pipeline had two matching stages beyond exact
dictionary lookup: bounded fuzzy edit-distance scoring (`scoreCandidate`/`scoreToneAware`, gated by
`threshold`/`MIN_TOKEN_LENGTH_FOR_FUZZY`/`MIN_SKELETON_LENGTH_FOR_FUZZY` — the "distance scale") and
a char-n-gram linear-model reject-stage (`classifierSaysReal`, mirroring an sklearn linear SVM's
`decision_function` per its own doc comment — the "SVM") that could veto a fuzzy match. Per the
user's explicit instruction, both are disabled in the orchestration step: every `scoreCandidate`/
`scoreToneAware` call in `filterMessage()` now passes `allowFuzzy = false` unconditionally (previously
`true` for single-token candidates), which forces exact-match-only against the dictionary. Since a
match can now only ever be an exact hit (`hit.distance` is always `0`), the classifier reject-stage
block that only fired on `hit.distance > 0` became dead code and was removed.

The normalize stage (`normalizeToken`: lowercase, diacritic stripping, leet-map, and the
repeat-collapse "tight" form — the "duplicate" the user referred to) and the exact-dictionary lookup
(`dict.exact`/`dict.exactToneKeys`) are untouched and still run for every candidate, per "only keep
normalize (duplicate) + dictionary."

Underlying fuzzy/classifier functions (`levenshteinBounded`, `toneAwareDistanceBounded`,
`scoreCandidate`, `scoreToneAware`, `classifierScore`, `classifierSaysReal`) were left in place and
still exported — they're directly unit-tested as standalone utilities, and the request was to turn
the stages off in the running pipeline, not delete the code.

Confirmed `client/js/profanity-filter.js` was byte-identical on `main` and `dev` before this change
(`git diff` between `main:client/js/profanity-filter.js` and the working copy was empty pre-edit),
so branched off `main` per the standard bug-fix workflow rather than the dev-only exception.
`client/*.html`/`client/js/*.js` had diverged significantly between `main` (still at `?v=95`, missing
much of the tournament/history feature work merged into `dev`) and `dev` (`?v=96`) — the initial
attempt to carry the fix over via `git stash` conflicted on every cache-busted file for unrelated
reasons. Resolved by keeping `main`'s own content for every file except the two actually touched by
this fix (`client/js/profanity-filter.js`, `server/tests/profanity-filter.test.js`), then bumping the
cache-buster from `main`'s own current version (`?v=95` → `?v=96`) rather than reusing `dev`'s number.

## Decision

No user decision points beyond the initial instruction — scope was explicit ("turn off SVM, turn off
distance scale, only keep normalize (duplicate) + dictionary").

## Summary output

**Fix:** `filterMessage()` in `client/js/profanity-filter.js` now only ever performs exact matches
(post-normalization) against the dictionary; the fuzzy edit-distance scoring and the classifier
reject-stage are both unreachable in the running pipeline. Bumped `?v=95` → `?v=96` across every
`client/*.html` and `client/js/*.js` reference per the cache-busting rule (verified via the required
single-value grep, `main`-relative).

**Test:** added 4 new cases to `server/tests/profanity-filter.test.js` (kept permanently, per the
bug-fix workflow rule): a near-miss English typo one edit away from a dictionary word (`"shiy"` vs
`"shit"`) is no longer masked; a near-miss Vietnamese typo one edit away via the tone-aware path
(`"lônn"` vs `"lồn"`) is no longer masked; the repeat-collapse ("duplicate") normalization path still
exact-matches the dictionary (`"shiit"` → tight form `"shit"`, still masked); and a plain exact
dictionary word is still masked. Full suite: `npm test` — 981/981 passing (41 suites), including all
66 tests in `profanity-filter.test.js` (62 pre-existing + 4 new), unchanged by the fix — confirming no
regression in exact-match/normalize behavior.

Branch: `fix/profanity-filter-disable-fuzzy-classifier`, off `main`.
