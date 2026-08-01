# Project Rules

## Cache-busting version bump

All CSS and JS assets are cache-busted with a shared `?v=N` query string (see `client/*.html` `<link>`/`<script>` tags and the `?v=N` suffixes on ES-module `import` statements inside `client/js/index-entry.js`, `client/js/room-entry.js`, `client/js/login-entry.js`).

**Whenever you modify any file under `client/css/` or `client/js/`, bump `?v=N` to `?v=N+1` everywhere it appears** — across all HTML files (`client/index.html`, `client/room.html`, `client/login.html`, `client/history.html`) and inside the module entry files' `import` statements. All occurrences must use the same new number; do not bump some files but not others, since a mismatched/partial bump reintroduces stale-cache bugs on mobile.

Find the current version with:
```
grep -rn "?v=" client/*.html client/js/*-entry.js
```

## Bug-fix workflow: scope discipline and unit tests

When fixing a reported bug or issue:

- **Base the fix strictly on what was provided.** Implement only what the task/prompt actually describes (e.g. a review finding, a reproduced bug, an explicit ask). Do not silently extend a fix to cover speculative or unverified scenarios beyond what was given — call those out separately instead (e.g. in `TODO.md`) rather than folding them into the fix.
- **Write a unit test for the fix whenever it's safe to do so** — i.e. whenever the affected code has, or can reasonably get, real coverage runnable via `npm test` (server-side Jest, `server/tests/**/*.test.js`). If the affected area has no test infrastructure (e.g. client-side `client/js/` currently has none), say so explicitly rather than skipping silently or substituting a throwaway manual script.
- **Never discard a test case after writing it.** Every unit test written to verify a fix stays permanently in the suite. Do not write a test, run it once to confirm the fix, and then delete it — the test is the regression guard for that fix going forward, not a one-time proof.
- **Before implementing any task tracked in `TODO.md`, read the matching entry in `instruction.md`.** `TODO.md` tracks *what* to do plus this repo's own effort/safety assessment; `instruction.md` holds the reviewer's original execution guidance for that same item — the specific approach to take, known pitfalls, and explicit "don't touch this" boundaries. If `instruction.md` has no entry for a task, that's fine — not every task has extra reviewer guidance beyond `TODO.md`. If a fix has to deviate from what `instruction.md` says, note why in the fix's summary rather than silently diverging.

## `docs/fix-log.md`: append-only, every row timestamped

- **`docs/fix-log.md` is append-only.** Never edit, reword, reorder, or delete an existing row once written — only add new rows. If a past entry turns out to be wrong, add a new row noting the correction; don't rewrite history in place.
- **Every row has a `Timestamp` column (first column).** New rows get the real wall-clock time at the moment the row is written (`date "+%Y-%m-%d %H:%M"` or equivalent) — not the time the underlying fix was made, if those differ. The timestamp is what lets a reader tell what order entries were actually appended in, since row position in the table is the only other ordering signal.
- Existing rows written before this rule (all of them as of 2026-08-01) were retroactively stamped `2026-08-01 22:30` — this is the time the column was added, not each entry's real original write time, since that history wasn't captured. Don't re-stamp them again; treat `2026-08-01 22:30` as their permanent value going forward, same as any other already-written row.

## Git workflow: one fix, one branch, one commit

- **Each fix gets its own short-lived branch off `main`**, named `fix/<short-kebab-slug>` (e.g. `fix/room-quota-per-ip`, matching the slug used for that item in `TODO.md`/`instruction.md` where practical).
- **One commit per fix.** Implement the fix, its kept unit test(s) (per the "Bug-fix workflow" rule above), and its `docs/fix-log.md` row together, then commit once — after `npm test` passes. Don't bundle multiple unrelated fixes into one commit, and don't split a single fix across multiple commits on `main`'s history (rework on the branch before merging, not after).
- **Merge to `main` only once the fix is verified** (tests green, matches the guidance in `instruction.md` for that item if any exists). Use a regular merge commit (not squash, not rebase) so the branch's commit stays traceable back to the fix.
- **After merging, delete the branch** (`git branch -d fix/...`) unless told to keep it around for further review.
- This applies to actual code fixes. Doc-only updates (`TODO.md`, `instruction.md`, `CLAUDE.md`, `docs/fix-log.md` entries written on their own) can still go straight to `main`, same as before — they aren't code changes that need isolated testing on a branch.
