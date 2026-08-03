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

## New requirements/tasks: stack, don't perform directly

When the user raises a new requirement, feature request, or task during a conversation (as opposed to an explicit "do this now" instruction):

- **Default to recording it, not implementing it.** Add an entry to `TODO.md` (what to do) and a matching entry to `instruction.md` (the execution guidance discussed — approach, pitfalls, boundaries), per the existing `TODO.md`/`instruction.md` pairing convention.
- **Only perform the task directly if the user explicitly requires it now** (e.g. "do this now", "implement this", "fix it" — a direct ask for action rather than just describing a problem or idea).
- This is about triage of new work, not about re-litigating tasks already in progress or already explicitly assigned in the current turn.

## Writing comprehensive test cases

When writing unit tests for a fix or feature (per the "Bug-fix workflow" rule above), don't stop at one obvious happy-path test — build coverage deliberately:

- **Enumerate the case space before writing tests.** For business logic with multiple interacting conditions, sketch a decision table (conditions × expected actions) and turn each row into a test case. For state-driven code (game phases, connection state, accept/decline flows), map valid *and* invalid transitions, not just the expected sequence.
- **Apply equivalence partitioning + boundary value analysis to inputs.** Split inputs into classes that should behave the same way, test one representative per class, then add boundary tests at the edge of each class (the boundary value itself, plus one step on either side) — defects cluster at boundaries, not in the middle of a range.
- **Split cases into two deliberate groups, and write both:**
  - *Basic/correctness cases* — prove the feature works as documented on typical input.
  - *Rare/edge cases* — nulls, empty collections, max-length input, off-by-one counts, near-simultaneous/racing actions, disconnects mid-flow, invalid state transitions. These are where real bugs hide; happy-path tests alone are the least likely to catch defects.
- **Don't duplicate near-identical cases.** If two cases exercise the same equivalence class or boundary with no behavioral difference, keep only one; prefer a parameterized/data-driven test over copy-pasted near-identical test functions.
- **Assert on actual expected output/state, not just "it didn't throw."** A test that only checks the call succeeded will rubber-stamp incorrect behavior as passing.

This is additive to, not a replacement for, the existing rule that every unit test written to verify a fix stays permanently in the suite.

## Playwright/e2e testing: never run against the real user database

`server/db/database.js`'s `DB_PATH` is hardcoded to `server/db/gomoku.db` — there is no `NODE_ENV`/env-var override, so simply running `node server/index.js` (as Playwright's `baseURL` expects a live server at `localhost:3000`) reads and writes the same database file a real deployment or the user's own local dev session uses. Guest game sessions completing a game (resign, draw, timeout, five-in-a-row) call `database.saveGame()` and *do* persist rows there.

Whenever you need a real running server for Playwright (`npx playwright test`, `npm run test:e2e`) — not just `npm test` (Jest), which never touches this file:

1. **Before starting the server, move the real db aside**, don't copy/leave it in place: e.g. `mv server/db/gomoku.db server/db/gomoku.db.pre-e2e` (and the `-wal`/`-shm` sidecar files alongside it, if present). Starting the server after that lets `new Database(DB_PATH)` create a **fresh, empty** db at the same path from `schema.sql` — this is what actually gets written during the test run, not the user's data.
2. Run the Playwright tests against that fresh db.
3. **After the run (pass or fail), stop the server, delete the throwaway db** (and its `-wal`/`-shm` files), **then move the real db back** to `server/db/gomoku.db`. The user's data must be exactly what it was before step 1 — never leave the throwaway db in place, and never merge/copy test rows into the restored real db.
4. Verify the restore worked (e.g. row counts or `diff` against a pre-move checksum) before ending the task — don't just assume the `mv` back succeeded.
5. **Always kill every server process you started for this**, even ones from earlier failed attempts — a leftover `node server/index.js` left running against the real db defeats the whole point of steps 1-3.

This applies any time you start `server/index.js` yourself for verification. It does not apply to `npm test` (Jest unit tests already mock or use in-memory SQLite, never this file) or to a server the user themselves is already running for their own dev/deployment use — never restart or interfere with a server process you didn't start.

## Short/underspecified prompts: enhance, confirm, then execute

If a user prompt is short or lacks the detail an AI agent needs to act on safely (ambiguous scope, missing target file/fix id, unclear which of several plausible interpretations applies):

- Use the `prompt-architect` skill to expand the prompt into a clearer, more actionable version.
- Verify the enhanced interpretation with the user (e.g. via `AskUserQuestion` or a short confirmation) before executing — do not silently act on a guessed interpretation.
- Only proceed with execution once the user has confirmed the intended scope/context.
- This does not apply to prompts that are short but already unambiguous (e.g. "run tests", "yes", "continue") — the enhance-and-confirm step is for genuine ambiguity, not brevity alone.
