# Project Rules

## Tracking-file layout: index + detail files (query and append)

`TODO.md`, `instruction.md`, and `docs/fix-log.md` used to be single monolithic files. As of 2026-08-04 they were split for agent-read efficiency (each had grown to 90-200KB, so any task that touched one pulled the entire history into context even when only one item was relevant). The split:

- **Each of the three files stays at its original path and still gets `@`-referenced the same way** — but now holds only a lightweight **index**: structural headings (Part A/B, `Nguồn`/source groupings, global rules, "Đừng làm" boundaries) plus one line per item linking to its detail file. Read the index first; it's small enough to read in full.
- **Actual item content lives one level down**, one file per item:
  - `docs/todo/<CODE>-<slug>.md` — `CODE` is the item's part-prefixed number exactly as used in `TODO.md` (e.g. `A07`, `B36`).
  - `docs/instruction/<CODE>-<slug>.md` — `CODE` matches the corresponding `instruction.md` heading (`A1`, `B37`, or `S39`/`S44` for the later items that use the global `§NN` numbering scheme — `§` is written `S` in filenames only, ASCII-only for portability).
  - `docs/fix-log/<YYYY-MM-DD>-<slug>.md` — one file per fix-log row, named by the entry's date + a slug of its opening words.
- **Query:** grep or scan the relevant index file for the item number/keyword, then `Read` only the matched detail file(s) (typically 1-5KB) instead of the whole original file.
- **Append:** write one new detail file, then add one new line/row to the matching index. Never re-open or edit an existing detail file's content when adding unrelated history (this is what makes `docs/fix-log.md`'s append-only rule, below, cheap to honor: a new fix is a new file, not an edit to a shared one).
- This changes *where* content lives, not the rules governing it — the "read the matching `instruction.md` entry", "`docs/fix-log.md` is append-only", and "`TODO.md`/`instruction.md` pairing" rules below still apply verbatim, just resolved through the index → detail-file indirection.

## Index/detail sync: status markers move together, in one edit

`TODO.md` marks a finished item with a leading `✅` on its index line; the matching
`docs/todo/<CODE>-<slug>.md` detail file marks the same fact with its own `**Trạng thái:** ✅ ĐÃ
XONG` (or `✅ đã xong`) line plus the implementation/test summary. These two markers describe the
same underlying fact and must never be updated one without the other:

- **Finishing a task = one edit that touches both files.** Write the detail file's `Trạng thái`
  line (with the summary, test results, verification notes) *and* prefix the corresponding index
  line in `TODO.md` with `✅ ` in the same turn. Neither file is "the real one" — an index line
  without a matching detail-file status, or a detail file marked done with no `✅` in the index, is
  a drift bug, not a style choice.
- **Before telling the user a task is/isn't done, read both** — the index line's `✅` and the
  detail file's `Trạng thái` — rather than trusting either alone. If they disagree, that's a
  sync bug to fix (bring the index in line with the detail file's actual status, since the detail
  file carries the evidence — test output, verification notes — the index line doesn't), not
  something to silently pick a side on.
- **Quick consistency check across all items:**
  ```
  grep -oP '^\- (✅ )?\*\*#\S+' TODO.md
  grep -rl '✅ ĐÃ XONG\|✅ đã xong' docs/todo/
  ```
  Cross-reference the two: every detail file with a done marker should have a `✅`-prefixed index
  line, and vice versa. Run this after any batch status update, not just after a single item.
- This applies to `TODO.md` ↔ `docs/todo/*.md`. `instruction.md` ↔ `docs/instruction/*.md` doesn't
  carry a done/not-done marker (it's execution guidance, not a status tracker), so nothing to sync
  there beyond the existing "read the matching entry before implementing" rule.

## Cache-busting version bump

All CSS and JS assets are cache-busted with a shared `?v=N` query string. This appears in two kinds of places, and **both must be covered by every bump** — a rule that only names one of them (as this section used to) will keep missing the other:

- Every `client/*.html` file's `<link>`/`<script>` tags.
- **Every ES-module `import '...?v=N'` statement inside every file in `client/js/*.js`** — not just the `*-entry.js` files (`index-entry.js`, `room-entry.js`, `login-entry.js`, `tournament-match-entry.js`, `tournament-detail-entry.js`). Non-entry modules can and do import each other directly with their own `?v=N`-suffixed specifier (e.g. `tournaments.js` importing `./lobby.js?v=N` to reuse its exported `client` instance) — the browser resolves each distinct query string as a **separate module instance**, so a stale `?v=` left on one such cross-import silently re-executes that module's top-level code a second time. This is exactly how a duplicate `SocketClient`/socket.io connection bug shipped twice (`docs/fix-log/2026-08-04-*` at `?v=61`, then again at `docs/fix-log/2026-08-06-tournaments-lobby-duplicate-module-import.md` at `?v=63`) — both times because the bump only touched the files explicitly named in this rule, and a lone hardcoded import elsewhere was invisible to it.
- The two `*-mockup.html` files (`client/tournament-detail-mockup.html`, `client/tables-tournaments-mockup.html`) are the sole deliberate exception: they intentionally stay pinned to an old, frozen version per their own in-file comments (unshipped prototypes) — do not bump these, and do not let their presence mask a real mismatch elsewhere (see verification command below, which excludes them explicitly).

**Whenever you modify any file under `client/css/` or `client/js/`, bump `?v=N` to `?v=N+1` everywhere it appears**, across every location above. All occurrences must use the same new number; do not bump some files but not others, since a mismatched/partial bump reintroduces stale-cache bugs on mobile — or worse, a silent duplicate-module-execution bug like the one above, which has no visible symptom until it manifests as something unrelated-looking (e.g. a false "logged in on another device" kick).

Find the current version — **and verify the bump is complete** — with:
```
grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup
```
This must show exactly **one** distinct `?v=N` value across all matches. If it shows two or more, some file was missed — find it and fix it before considering the bump done. Do not rely on eyeballing individual files; run this command as the actual completion check every time.

## Bug-fix workflow: scope discipline and unit tests

When fixing a reported bug or issue:

- **Base the fix strictly on what was provided.** Implement only what the task/prompt actually describes (e.g. a review finding, a reproduced bug, an explicit ask). Do not silently extend a fix to cover speculative or unverified scenarios beyond what was given — call those out separately instead (e.g. in `TODO.md`) rather than folding them into the fix.
- **Write a unit test for the fix whenever it's safe to do so** — i.e. whenever the affected code has, or can reasonably get, real coverage runnable via `npm test` (server-side Jest, `server/tests/**/*.test.js`). If the affected area has no test infrastructure (e.g. client-side `client/js/` currently has none), say so explicitly rather than skipping silently or substituting a throwaway manual script.
- **Never discard a test case after writing it.** Every unit test written to verify a fix stays permanently in the suite. Do not write a test, run it once to confirm the fix, and then delete it — the test is the regression guard for that fix going forward, not a one-time proof.
- **Before implementing any task tracked in `TODO.md`, read the matching entry in `instruction.md`.** `TODO.md` tracks *what* to do plus this repo's own effort/safety assessment; `instruction.md` holds the reviewer's original execution guidance for that same item — the specific approach to take, known pitfalls, and explicit "don't touch this" boundaries. If `instruction.md` has no entry for a task, that's fine — not every task has extra reviewer guidance beyond `TODO.md`. If a fix has to deviate from what `instruction.md` says, note why in the fix's summary rather than silently diverging.

## `docs/fix-log.md`: append-only, every row timestamped

- **`docs/fix-log.md` (the index) and `docs/fix-log/*.md` (the detail files, see "Tracking-file layout" above) are append-only together.** A new fix means writing one new `docs/fix-log/<date>-<slug>.md` file (with `## Prompt` / `## Action` / `## Decision` / `## Summary output` sections) plus one new row in the `docs/fix-log.md` index table. Never edit, reword, reorder, or delete an existing index row or detail file once written. If a past entry turns out to be wrong, add a new one noting the correction; don't rewrite history in place.
- **Every index row has a `Timestamp` column (first column), matching the `# Fix log entry — <timestamp>` heading in its detail file.** New entries get the real wall-clock time at the moment they're written (`date "+%Y-%m-%d %H:%M"` or equivalent) — not the time the underlying fix was made, if those differ. The timestamp is what lets a reader tell what order entries were actually appended in, since row position in the table is the only other ordering signal.
- Existing rows written before this rule (all of them as of 2026-08-01) were retroactively stamped `2026-08-01 22:30` — this is the time the column was added, not each entry's real original write time, since that history wasn't captured. Don't re-stamp them again; treat `2026-08-01 22:30` as their permanent value going forward, same as any other already-written row.

## Git workflow: one fix, one branch, one commit

- **Each fix gets its own short-lived branch off `main`**, named `fix/<short-kebab-slug>` (e.g. `fix/room-quota-per-ip`, matching the slug used for that item in `TODO.md`/`instruction.md` where practical).
- **One commit per fix.** Implement the fix, its kept unit test(s) (per the "Bug-fix workflow" rule above), and its `docs/fix-log.md` row together, then commit once — after `npm test` passes. Don't bundle multiple unrelated fixes into one commit, and don't split a single fix across multiple commits on `main`'s history (rework on the branch before merging, not after).
- **Merge to `main` only once the fix is verified** (tests green, matches the guidance in `instruction.md` for that item if any exists). Use a regular merge commit (not squash, not rebase) so the branch's commit stays traceable back to the fix.
- **After merging, delete the branch** (`git branch -d fix/...`) unless told to keep it around for further review.
- This applies to actual code fixes. Doc-only updates (`TODO.md`/`docs/todo/*.md`, `instruction.md`/`docs/instruction/*.md`, `CLAUDE.md`, `docs/fix-log.md`/`docs/fix-log/*.md` entries written on their own) can still go straight to `main`, same as before — they aren't code changes that need isolated testing on a branch.
- **Exception: a fix for code that only exists on `dev`** (i.e. the buggy code was introduced by a `feature/*` branch already merged into `dev` but not yet merged into `main`) **branches off `dev` and merges back into `dev`, not `main`** — branching off `main` would have nothing to fix, since `main` never had the buggy code in the first place. Naming/one-commit/delete-after-merge conventions are unchanged, only the base/target branch flips from `main` to `dev`. Precedent: `fix/tournament-match-board-size` (TODO.md #49, commit `b31bc78`/merge `fb1cc6c`) fixed a CSS bug in `tournament-match.html`, which at the time existed only on `dev` (from the still-unmerged B48 tournament feature).
- **Exception: a fix whose `TODO.md`/`instruction.md` tracking entry only exists on `dev`** (even when the underlying code bug is identical on both branches) **also branches off `dev` and merges back into `dev`, not `main`.** `main`'s `TODO.md`/`instruction.md` lag `dev`'s significantly (as of 2026-08-08, `main`'s `TODO.md` stops around #50 while `dev`'s is past #66) — doc-only commits are *allowed* to go straight to `main` per the bullet above, but in practice haven't been kept in sync every time, so don't assume a tracked item's index/detail files exist on `main` just because the rule says they're allowed to. **Check first**: `git show main:TODO.md | grep '#<N>'` (or the equivalent `docs/todo/<CODE>-*.md` path) before picking the base branch. If the entry is missing on `main`, branch off `dev` instead — branching off `main` would implement the code fix correctly but leave the index line/detail-file status update with nowhere to land. Precedent: `fix/auth-cache-control-no-store` (TODO.md #66) — `server/routes/auth.js` had the identical bug on both branches, but `#66`'s tracking docs existed only on `dev`.
- **`main` is branch-protected on GitHub as of 2026-08-08**: PRs required to merge (even for admins), force-push and branch deletion disabled. A local `git push origin main` (or pushing a local merge commit directly) **will be rejected** — merging a `fix/*` branch (or a `dev` → `main` checkpoint merge) now requires `gh pr create --base main --head <branch>` followed by `gh pr merge --merge` (regular merge, not squash/rebase, matching the "regular merge commit" convention above) once the PR is confirmed with the user. `dev` itself is **not** protected — `feature/*` → `dev` and `fix/*` → `dev` merges are unaffected and still use a local merge commit as described elsewhere in this section.

## Git workflow: `dev` branch for new features (as of 2026-08-04)

Bugfixes keep using the `fix/<slug>` workflow above unchanged (short-lived branch off `main`, one commit, merge back to `main`). New feature work uses a separate, parallel structure so unrelated in-progress ideas never block each other:

- **`dev` is the integration branch for new features**, branched off `main`. It sits ahead of `main` and is never force-pushed.
- **Each new feature idea gets its own `feature/<short-kebab-slug>` branch, branched off `dev`** (not off `main`) — e.g. `feature/spectator-mode`. Multiple `feature/*` branches can be in flight at once; they don't need to merge together or in any particular order.
- **A `feature/*` branch merges into `dev` only when that specific idea is working/ready.** Use a regular merge commit (not squash, not rebase), same as the `fix/*` convention. Other `feature/*` branches are unaffected by this — that's the point of keeping them separate.
- **An abandoned or shelved idea's branch is just left alone or deleted** — since `dev` never saw it, nothing needs to be reverted or cleaned up elsewhere.
- **`dev` merges into `main` periodically**, as a deliberate checkpoint (e.g. once a batch of features is stable and tested), not automatically on every feature merge. This keeps `main` deployable at all times. Since `main` is branch-protected (see the "one fix, one branch, one commit" section above), this checkpoint merge goes through a PR (`gh pr create --base main --head dev` + `gh pr merge --merge`), not a local push.
- **After a `feature/*` branch merges into `dev`, delete it** (`git branch -d feature/...`), same as the `fix/*` cleanup rule, unless told to keep it for further review.
- New feature work discovered mid-conversation still follows the "New requirements/tasks: stack, don't perform directly" rule below — record it in `TODO.md`/`instruction.md` first unless the user explicitly asks to implement it now, at which point it starts life as a `feature/*` branch off `dev` per this rule.

## Concurrent sessions sharing the repo: check `git stash list` before assuming lost work

The user may run multiple Claude Code sessions against this repo at once (e.g. one fixing a bug
while another builds a feature in an isolated `git worktree`). Setting up a new session's worktree
briefly touches the *main* checkout's `HEAD` — if another session has uncommitted edits sitting there
at that exact moment, they can vanish from the working tree mid-task.

Precedent (2026-08-08, TODO.md #74): mid-implementation, `grep`/`git diff` suddenly came up empty for
code just written. `git reflog` showed an unexplained `checkout`/`reset` pair. The instinctive read —
"a destructive `git reset --hard` from nowhere wiped my work" — was wrong and led to redoing the
entire edit from scratch before checking further. The actual cause, found afterward: a second,
concurrent session was being moved into its own `git worktree` (`git worktree list` showed it, on its
own branch, in a separate path), and something stashed the first session's dirty working tree
(`git stash list` → `stash@{0}`, labeled `wip: <branch> before switching for <other task>`) rather
than destroying it. The reflog's `reset: moving to HEAD` line is exactly what `git stash` produces —
easy to misread as `reset --hard` if you don't check the stash list first.

**If uncommitted edits appear to have vanished mid-task** (a file you just wrote no longer contains
the change, `git status`/`git diff` shows less than expected):
- **Run `git stash list` before redoing anything.** If the missing edits are there, `git stash show
  -p stash@{N}` to confirm content, then `git stash pop` (or apply and drop once merged) instead of
  retyping the work.
- **Run `git worktree list` and `git reflog`** to understand whether a concurrent session's worktree
  setup caused it — a `checkout`/`reset` pair around the loss, paired with a branch you don't
  recognize appearing in `git branch -vv` (marked `+`, pointing at a path outside this repo's own
  directory), is the signature of this scenario specifically, not of a destructive command this
  session ran.
- **After recovering (or redoing) the work, drop the now-superseded stash entry** once it's confirmed
  merged/committed, rather than leaving stale stashes to accumulate and confuse future recovery
  attempts — but confirm with the user first per the general "ask before destructive-ish actions"
  rule, since a stash isn't code but is still work product.
- **This is not corruption.** `git fsck` after such an incident is a reasonable sanity check (verifies
  no commit objects are actually damaged) but is not itself evidence anything went wrong — repos
  normally carry unreachable objects from ordinary history rework (rebases, amends, `filter-branch`),
  and a large `git fsck --unreachable` count on its own means nothing.

## `features/<slug>/`: pre-implementation feature discussion folders

Before a new feature idea becomes tracked work in `TODO.md`/`instruction.md`, work it through a
discussion folder at `features/<slug>/` (e.g. `features/tournament/`). This is a design-discussion
stage, separate from and prior to the "stack, don't perform directly" tracked-work rule below.

- **Every `features/<slug>/` folder has the same fixed structure** — don't omit or rename these:
  - `user_story.md` — actors, user stories ("As a [actor], I want..., so that..."), rules, and any
    hard architectural constraints.
  - `diagram/uml_diagram/` — sequence diagrams (one `.md` file per diagram, e.g.
    `sequence-<flow-name>.md`).
  - `diagram/` — additional structure-and-behavior diagrams alongside `uml_diagram/` (e.g. state
    diagrams, conceptual class diagrams) as `.md` files named for what they show, e.g.
    `state-diagram-<name>.md`.
  - `planning.md` — the open questions blocking implementation, plus the resolution/implementation
    sequencing once they're answered.
- **Diagrams are Mermaid fenced code blocks inside Markdown files**, not separate `.puml`,
  `.drawio`, or image files — this keeps every diagram reviewable as a plain-text diff like the
  rest of the repo's docs, and renders natively wherever the Markdown is viewed.
- **Cross-link liberally.** `user_story.md`, the `diagram/` files, and `planning.md` should link to
  each other (relative Markdown links) so a reader can navigate the whole discussion from any entry
  point.
- **A `features/<slug>/` folder is a discussion artifact, not tracked work.** It does not by itself
  authorize implementation. Once the open questions in `planning.md` are resolved with the user,
  formalize the feature into `docs/todo/<CODE>-<slug>.md` + `TODO.md` and
  `docs/instruction/<CODE>-<slug>.md` + `instruction.md` per the "New requirements/tasks" rule
  below, *before* writing any implementation code. `planning.md` should note this handoff as its
  final step.
- Doc-only, like the other tracking files — `features/<slug>/*.md` can be written/updated straight
  on `main`, no `fix/`/`feature/` branch needed for the discussion docs themselves.

## New requirements/tasks: stack, don't perform directly

When the user raises a new requirement, feature request, or task during a conversation (as opposed to an explicit "do this now" instruction):

- **Default to recording it, not implementing it.** Add a new `docs/todo/<CODE>-<slug>.md` detail file plus its index line in `TODO.md` (what to do), and a matching `docs/instruction/<CODE>-<slug>.md` plus its index line in `instruction.md` (the execution guidance discussed — approach, pitfalls, boundaries), per the existing `TODO.md`/`instruction.md` pairing convention (see "Tracking-file layout" above).
- **Only perform the task directly if the user explicitly requires it now** (e.g. "do this now", "implement this", "fix it" — a direct ask for action rather than just describing a problem or idea).
- This is about triage of new work, not about re-litigating tasks already in progress or already explicitly assigned in the current turn.

## Security findings: verify against current code before filing

When triaging a security report (an audit, pentest note, CVE, or similar external write-up — not a
bug the user reproduced themselves) into `TODO.md`/`instruction.md` per the "New requirements/tasks"
rule above:

- **Verify each claimed finding against the current code/config before filing it** — don't transcribe
  the report's claims as fact. Reports can be stale or simply wrong about what the code does.
  Precedent: `network_security_audit.md` (2026-08-08) claimed Helmet has no HSTS header by default;
  it does — the report was wrong, and the filed item (`TODO.md` #67) was rewritten to say so and to
  ask for a real measurement, not to blindly implement the report's suggested fix.
- **Check whether a prior review already covered or explicitly ruled out the same finding** (e.g. a
  `docs/todo/<CODE>-*.md` "Ngoài phạm vi" section) before filing it again as new work — link back to
  that entry instead of duplicating it.
- **A finding that turns out to be a deliberate, already-documented design tradeoff gets closed as
  such, not filed as new work** — same precedent as `#63` (Standings score, closed "không phải bug"
  after checking against real Swiss/FIDE rules).

## Root-cause diagnosis: check the layer below the symptom before calling a bug fixed

`docs/fix-log.md`'s history has a recurring shape: an early fix patches the layer where the symptom
is *visible* (a UI overlay, a debounce timer, a policy header), ships, and then the same bug
resurfaces from the layer where it actually *lives* (proxy/infra, wire payload shape, build
artifact, module resolution) — sometimes 2-6 iterations later. Confirmed precedents already in the
fix-log:

- Chat XSS: 3 rounds before the fix landed on "escape on the wire, decode only at the `textContent`
  render site" (`docs/fix-log/2026-08-02-todo-15-follow-up-carved-out-of-the.md`) — the first fix
  addressed encoding, not where/how the escaped text got displayed.
- Room/IP quota: 6 rounds before finding `socket.handshake.address` is always `127.0.0.1` behind the
  Cloudflare Tunnel — see [[A67]]/`§44` and `getClientIp()` reading `CF-Connecting-IP`. Early fixes
  patched the room UI, not the IP the quota logic was actually reading.
- CSP/production build: CSP headers landed correct, then a follow-up found `dist/` itself was stale
  and still shipping the vulnerable HTML (TODO.md #65 "production build gaps" follow-up) — the fix
  was correct in `client/`, but nothing verified the *built* artifact matched.
- `?v=N` cache-busting: this is exactly why the "Cache-busting version bump" rule above lists ES
  cross-imports as a separate bullet — the first version of that rule only named entry files, and
  the same duplicate-module bug shipped twice before the rule (and its verification grep) covered
  every import site.

When a fix's symptom keeps recurring after being "fixed," or a fix touches only the layer where the
bug is *observed* (client rendering, a timing knob, a config flag) without touching the layer that
*produces* the value being observed (server logic, wire format, infra/proxy behavior, the actual
built/deployed artifact) — treat that as a signal the root cause hasn't been found yet, not as a
reason to add another patch on the same layer. Trace the value back to where it originates before
writing the fix, and verify the fix against production-shaped conditions (behind the real proxy,
against the real build output) when the layer in question could plausibly differ between dev and
prod — not just against local dev behavior.

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

## Feature completion checklist: test both layers, verify UX before calling it "done"

Extends the "Writing comprehensive test cases" rule above from bug fixes to full feature
development. A feature is not "done" just because its backend unit tests are green. Precedent:
B50 (tournament match series) shipped marked "Trạng thái: đã xong" with 806 passing backend tests,
then generated four follow-up bug reports (`TODO.md` #52-#55) — the organizer-facing config UI was
never built (#53), a client-side setting was never wired into the feature (#55), the overall layout
was never reviewed as a whole (#52), and a navigation link lost tab context (#54). All four were
gaps a backend-only test pass structurally cannot catch. Prevent this recurrence on every feature
that touches both `server/` and `client/`:

- **Verify both layers, not just the one with test infrastructure.** Backend (`server/`) gets Jest
  unit tests per "Writing comprehensive test cases" above. Frontend (`client/`) currently has no
  automated test runner — that does not mean skip it: verify the frontend by actually driving the
  feature in a real browser (via the `run` skill, or manual Playwright per the e2e/db-safety rules
  below) end-to-end, starting from the entry point a real user would use (a form, a button, a
  settings panel) through to the visible result. Server-side test output alone is not frontend
  verification, even when the frontend code loads without console errors.
- **Check that every user-facing control the feature's design calls for actually exists in the
  DOM/UI**, not just that the backend accepts the data it would send. (Exactly what #53 missed: the
  backend fully accepted `seriesMode`, but no input for it was ever added to the create-tournament
  modal, so nothing could ever send it.)
- **Assess the user flow's complexity before calling a feature done**: how many steps/clicks does a
  real user take, is the flow easy to follow or does it assume the user already understands
  internals, and does a setting configured elsewhere (e.g. the global Settings panel) actually carry
  through into this feature's screens the way a user would expect (exactly what #55 missed — the
  click-mode setting saves correctly but silently never applied inside the tournament match screen).
  Prefer running the `ux-audit` skill (or an equivalent live walkthrough covering both desktop and
  mobile) as part of finishing a feature, not only after a user reports confusion.
- This checklist gates marking a feature's tracked-work entry (`docs/todo/<CODE>-*.md`) as
  "Trạng thái: đã xong" — do not mark a feature done off backend test output alone when it has a
  `client/` surface.

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
