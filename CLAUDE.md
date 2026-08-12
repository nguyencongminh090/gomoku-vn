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

## Git workflow: `ui/<style>` branches for parallel UI layout design exploration

When the user wants multiple competing UI/layout designs explored side by side (e.g. "try style A
vs style B for this screen") before picking one, use a separate structure from both `fix/*` and
`feature/*` so the candidate designs never interfere with each other or with in-flight feature work:

- **Each design candidate gets its own `ui/<short-kebab-slug>` branch, branched off `dev`** (not
  off `main`) — e.g. `ui/style_a`, `ui/style_b`. Multiple `ui/*` branches can be in flight at once
  for the same screen; they are independent iteration lines, each committing its own progression
  (`commit → commit → ... → final`) exactly as sketched in the task example.
- **A branch is per named design *direction*, not per screen.** If a direction (e.g. "Zen Minimal")
  spans multiple screens (lobby, room, tournament…), every screen's implementation of that same
  direction lives on the *same* `ui/<direction>` branch — one branch keeps accumulating commits as
  each screen gets its zen treatment, it does not fork into `ui/<direction>` for one screen and
  `ui/<direction>-<screen>` for another. Splitting a single direction across screen-scoped branches
  means every branch is a half-finished product (one screen restyled, the rest still on the old
  look) until someone remembers to merge them back together — confirmed 2026-08-12: `ui/zen-minimal`
  (lobby) and `ui/room-zen-drawer` (room), both off `dev`, were meant to be the same "Zen Minimal"
  effort but were branched separately, so neither branch alone showed a coherent product (new
  lobby/old room vs. new room/old lobby) until they were merged back into one (`ui/zen-minimal`,
  merge commit `c87ab75`). Only *competing candidates for the same screen* (`ui/style_a` vs
  `ui/style_b` racing to restyle one page) get separate branches — a single direction rolling out
  screen-by-screen does not.
- **Backend is locked on every `ui/*` branch: no `server/` changes.** These branches exist purely
  to compare presentation-layer design candidates, so scope is limited to the UI layer —
  `client/*.html`, `client/css/`, `client/js/` (UI-facing modules only, not introducing new
  server-dependent behavior). If a design candidate seems to need a `server/` change (a new
  endpoint, a changed response shape) to work, that's a signal that change belongs in a
  `feature/*` branch instead, filed separately per the "New requirements/tasks" rule — do not fold
  it into a `ui/*` branch.
- **DO NOT TOUCH the board/stones design on any `ui/*` branch.** The game board's rendering,
  layout, and interaction logic — `client/js/board.js` in full (grid/canvas drawing, stone
  placement/animation such as `_drawStonePiece`, touch/click handlers like `_onTouchEnd`) and the
  board-specific rules inside `client/css/game.css` (board grid, cell sizing, stone appearance) —
  is locked, same spirit as the backend lock above. `ui/*` branches compare layout/chrome around
  the board (panels, controls, page structure, colors/typography elsewhere on the screen), not the
  board itself. If a design candidate genuinely requires a board/stone visual change, that's out of
  scope for `ui/*` — raise it with the user explicitly and, if approved, track it as its own
  `feature/*` work per the "New requirements/tasks" rule rather than folding it into a style
  candidate.
- **No `ui/*` branch merges into `dev` on its own.** They stay parallel, independent branches until
  the user explicitly picks a winner. There is no default order or timeline for that decision —
  wait for the user to choose, don't merge speculatively because a candidate "looks done."
- **Once the user chooses a winner**, merge only that one `ui/<style>` branch into `dev` with a
  regular merge commit (not squash, not rebase), same convention as `fix/*`/`feature/*`. Follow the
  "Cache-busting version bump" rule if the merge brings in `client/css/`/`client/js/` changes not
  already reflected in `dev`'s current `?v=N`.
- **After the winning branch merges, delete every `ui/<style>` branch for that round** — the winner
  (now merged, so the branch itself is redundant) and every losing candidate alike. Same cleanup
  convention as `fix/*`/`feature/*` unless the user says to keep one for reference.
- `ui/*` branches are a design-comparison mechanism, not a substitute for `features/<slug>/`
  discussion folders — if the competing styles represent genuinely different feature scope (not
  just visual/layout variants of the same screen), work the decision through a
  `features/<slug>/planning.md` first per that rule, then spin up `ui/*` branches for the shortlisted
  visual candidates once scope is settled.

## Git workflow: a `fix/*` branch merged to `main` must also land on `dev`

Precedent (2026-08-12): `fix/focus-mode-bottom-gap` (TODO-untracked CSS fix, PR #5) branched off
`main` and merged straight back into `main` — correctly, per the standard `fix/*` workflow, since
the bug existed on `main` too. But it was **never merged into `dev`**. `dev` kept moving (58 commits,
including its own independent `?v=N` bumps up to 104) while unaware `main` now had an extra commit
`dev` didn't. When the next scheduled `dev`→`main` checkpoint merge (PR #6) was opened, it failed
with 14 real merge conflicts — 10 files purely on the `?v=N` cache-bust number (`dev` at 104 vs
`main` at 97, since `main`'s side had bumped independently for the same fix), plus `docs/fix-log.md`'s
append point and one test file. None of this was caused by bad code — it was two branches' histories
silently drifting apart because a fix landed on only one of them.

- **Whenever a `fix/*` branch merges into `main`, also merge it into `dev`** (`git checkout dev &&
  git merge fix/<slug>`, or re-open the same fix as a `fix/*`-off-`dev` merge if `dev` needs a
  differently-shaped patch) — in the same session, immediately after the `main` merge, not "later"
  or "at the next checkpoint." Treat "merged to `main`" and "merged to `dev`" as two separate,
  equally-required steps for any fix whose underlying bug exists on both branches (the common case —
  see the existing "fix for code that only exists on `dev`" exception above for when it doesn't
  apply).
- **This includes the `?v=N` cache-bust number.** If `main`'s side of the fix touched
  `client/css/`/`client/js/`, it bumped `?v=N` using `main`'s own last-known number — which is
  usually stale by the time it reaches `dev`, since `dev` has kept bumping independently. Syncing the
  fix into `dev` right away, and re-bumping to `dev`'s next number there, keeps the two branches'
  version counters from drifting apart in a way only a full merge conflict surfaces later.
- **If you skip this and the divergence is only caught at the next checkpoint merge**, resolving it
  is still mechanical, not risky, as long as you diagnose it as a divergence rather than real logic
  conflict: for a pure `?v=N` conflict, keep `dev`'s (usually higher, more complete) side of each
  file and re-bump the whole repo to `max(dev, main) + 1` per the "Cache-busting version bump" rule
  above (verify with that rule's `grep` command afterward — it must show exactly one number); for a
  `docs/fix-log.md` conflict, keep both branches' rows (append-only applies across the merge too — do
  not let one branch's row silently drop the other's), inserting the losing side's unique rows in
  chronological order by timestamp; for a test-file conflict, keep whichever side added new test
  cases (usually both add different ones — keep both, don't let a conflict resolution accidentally
  delete a kept test, which would violate the "never discard a test case" rule above). Always re-run
  `npm test` after resolving before committing the merge.

## Git workflow: check `dev`↔`main` divergence before opening a checkpoint-merge PR

Before running `gh pr create --base main --head dev` for a periodic checkpoint merge, check whether
`main` has moved independently of `dev` first — don't find out from a failed `gh pr merge`:

```
git fetch origin
git log origin/dev..origin/main --oneline   # commits on main that dev doesn't have
```

If this is empty, the PR will merge cleanly (a true fast-forward-shaped merge). If it's **not**
empty, `main` has commits `dev` lacks (see the precedent above for how this happens) — merge
`origin/main` into local `dev` first, resolve conflicts, push `dev`, and only then open/merge the
PR. Opening the PR anyway and discovering the conflict via `gh pr merge`'s failure is not wrong, but
checking first avoids doing the divergence diagnosis under the pressure of a half-open PR, and makes
it obvious up front whether the fix is a one-line resolve or something that needs the user's input
before proceeding.

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

## Playwright browser binaries: never run `npx playwright install` speculatively

The machine's Playwright browser binaries live at `~/.local/share/ms-playwright/` (not the
library's built-in default of `~/.cache/ms-playwright/`), pinned there via
`PLAYWRIGHT_BROWSERS_PATH` set in both `~/.bashrc` and, as of 2026-08-09, system-wide in
`/etc/environment`.

**Correction (2026-08-09, same day): `/etc/environment` does NOT reliably reach an
already-running agent/tool shell.** `/etc/environment` is read by PAM at *session start* (login,
new SSH connection, fresh terminal after reboot) — a shell process that was already running
before the file was added (e.g. this harness's persistent Bash tool shell, or a VSCode-extension
-hosted terminal opened earlier) keeps whatever environment it started with and never re-reads
`/etc/environment` later. Confirmed same-day: `echo $PLAYWRIGHT_BROWSERS_PATH` came back empty in
the actual Bash tool shell despite the file being correctly set, and `chromium.launch()` failed
looking in the wrong (`~/.cache/...`) path as a result. **Don't assume propagation — verify it in
the shell you're about to use, every time**, and don't treat "the user restarted/rebooted since"
as a substitute for checking: `echo $PLAYWRIGHT_BROWSERS_PATH` right before the command that needs
it.

**Never run `npx playwright install` (or `install chromium`/`firefox`/`webkit`) as a defensive or
"just in case" step before an e2e run.** Precedent (2026-08-09): an agent ran it speculatively
before a Playwright session in an environment where `PLAYWRIGHT_BROWSERS_PATH` hadn't propagated
yet (pre-`/etc/environment` fix), so Playwright silently fell back to its built-in default path
and downloaded a full second copy of chromium/headless_shell/ffmpeg (~656MB) into
`~/.cache/ms-playwright/`, duplicating what already existed at the correct location. That stray
copy was found and deleted (`rm -rf ~/.cache/ms-playwright`) after the fact.

- **Check first, don't install first**: `ls ~/.local/share/ms-playwright/` (or
  `npx playwright install --dry-run chromium` if unsure) to confirm the browser revision your
  `@playwright/test` version needs is already present, before ever invoking `install`.
- If a binary genuinely is missing, confirm `echo $PLAYWRIGHT_BROWSERS_PATH` resolves to
  `~/.local/share/ms-playwright` in the actual shell that will run `install` before running it —
  do not assume env propagation, since non-interactive/non-login shells (`bash -c "..."`, which is
  how tool-invoked commands typically run) do not source `~/.bashrc` at all, only
  `/etc/environment` reaches them (and only after the shell's session/login was started after the
  var was added).
- If `~/.cache/ms-playwright/` ever reappears, that's the signal this happened again — investigate
  which shell/tool bypassed `PLAYWRIGHT_BROWSERS_PATH` rather than just deleting it silently.
- **If `$PLAYWRIGHT_BROWSERS_PATH` is empty in the shell you're about to run Playwright in, do
  NOT run `npx playwright install` to "fix" it and do NOT ask the user to reboot.** Just prefix
  the one command that needs it: `PLAYWRIGHT_BROWSERS_PATH=/home/ngmint/.local/share/ms-playwright
  node your-script.js`. This is a one-command workaround, not a system fix — it doesn't change the
  shell's persisted environment, so check again (`echo $PLAYWRIGHT_BROWSERS_PATH`) at the start of
  a *different* session before assuming it carried over. A reboot (or any fresh login/terminal
  session started after `/etc/environment` was set) does fix it permanently for that new session,
  but is the user's call to do, never something to request or wait on mid-task — the prefix
  workaround is always available and unblocks the current task immediately.

## Playwright/e2e: authenticated pages need the real login UI flow, not just an API cookie

`client/js/session.js`'s `requireAuth()` (called at the top of every page that needs a session,
e.g. `tournament.html`) does not trust the session cookie alone — the cookie is HttpOnly and
therefore unreadable client-side, so `requireAuth()` instead checks a `gvn_user` flag in
`localStorage`, which is only ever set by the login page's own JS (`client/js/login.js`) after a
successful login/guest click, via `onAuthSuccess()`. **A Playwright script that logs a guest in via
a raw `context.request.post('/api/auth/guest')` call gets a valid cookie in the browser context,
but `localStorage.gvn_user` is still unset — every `requireAuth()`-gated page will `location.replace`
straight to `login.html`, even though the cookie itself is perfectly valid.**

Drive the actual UI instead: `page.goto('/login.html')` → `page.click('#btn-guest')` (or fill+submit
the real login form for a registered account) → wait for the redirect away from the login page →
*then* navigate to the page under test. This is also the more faithful test regardless (it's what a
real user does), and it's the same amount of code as the raw-API shortcut once you factor in the
`localStorage` gap.

**Seeding data for a page like this beyond what the UI can practically create** (e.g. 20+ rows to
prove pagination, which nobody creates by hand through the UI): drive the *real* create/register/
start flow once via a small `socket.io-client` script (not the browser) to get real, FK-valid ids
(tournament id, pairing id, entry ids — `tournament_games` has `foreign_keys = ON` enforced FKs
into `tournaments`/`tournament_pairings`/`tournament_players`), then bulk-insert the remaining rows
directly via `sqlite3`/`python3 sqlite3` using those real ids. Trying to fabricate a whole
tournament/pairing/entry graph by hand to satisfy the FKs (to skip the socket step) is much more
work and easy to get subtly wrong against `TournamentManager._hydrateTournament()`'s expectations;
letting the real server generate the parent rows and only bulk-seeding the leaf table is far less
fragile. Precedent: TODO.md #84 (games-history pagination) verification, 2026-08-09.

## Implementing a mockup: restructure the layout, don't just re-skin it

Precedent (2026-08-12, `ui/zen-minimal`): the first implementation pass took the chosen mockup
(`client/lobby-bw-zen-mockup.html`) and applied it to the real lobby by writing a token-override
stylesheet on top of `lobby.css`'s *existing* structure — redefining `--c-brand`/`--c-border`/etc.,
flattening shadows, hiding icons. Tests passed, the page rendered without errors, and it still
wasn't the mockup: the real screen kept a two-column grid with a sticky sidebar card, `.ui-shell`/
`.ui-core` bezel, pill buttons, and a badge/chip cluster — none of which exist in the mockup, which
is a single 640px column of borderless rows with text-link actions. Grayscale-and-flatten made the
old design monochrome; it did not make it the new design. The fix (same branch, later commit) threw
out the override-only stylesheet and rebuilt the DOM and layout to match the mockup's actual
structure, keeping only the mockup's own scoping discipline (a body class, so shared files like
`lobby.css`/`main.css` stay untouched for other screens).

**Before treating a mockup implementation as done, diff structure, not just palette:**

- **Compare DOM shape, not just colors.** Open the mockup and the real screen side by side and ask:
  is this the same number of columns? The same container nesting (card-in-a-card vs. flat)? The
  same control affordance (button vs. text link, badge vs. plain text)? If the mockup and the
  current markup disagree on any of these, a CSS override cannot close the gap — the markup has to
  change too.
- **A "restyle" that never touches the `.html` file is a signal to double-check**, not a shortcut
  worth taking. Token/chrome overrides are the right tool when the mockup *is* the same structure in
  a new palette; they are the wrong tool when the mockup is a different structure. Tell the two apart
  before choosing the approach, not after implementing.
- **Re-derive the underlying data flow, not just the shape.** Elements the mockup collapses,
  relocates, or renders differently from production (e.g. a sidebar becoming a line of prose, a
  count-pill header becoming a sentence) usually need the *feature* re-derived, not merely visual
  parity — check what real data currently drives that element in `client/js/`, then decide how it
  maps onto the mockup's shape, rather than copying the mockup's placeholder text verbatim into
  production (ask the user before adopting a mockup's exact wording if it reads as informal for the
  live product's actual language/tone, since a mockup's copy is only a suggestion).
- **Verify by rendering both**, not by reading both. The `design-workflow` skill's Stage 5 live
  review (real browser, real data, desktop + mobile) is what actually catches structural drift —
  screenshots of the live implementation next to the mockup, not a read-through of the diff.

## Short/underspecified prompts: enhance, confirm, then execute

If a user prompt is short or lacks the detail an AI agent needs to act on safely (ambiguous scope, missing target file/fix id, unclear which of several plausible interpretations applies):

- Use the `prompt-architect` skill to expand the prompt into a clearer, more actionable version.
- Verify the enhanced interpretation with the user (e.g. via `AskUserQuestion` or a short confirmation) before executing — do not silently act on a guessed interpretation.
- Only proceed with execution once the user has confirmed the intended scope/context.
- This does not apply to prompts that are short but already unambiguous (e.g. "run tests", "yes", "continue") — the enhance-and-confirm step is for genuine ambiguity, not brevity alone.
