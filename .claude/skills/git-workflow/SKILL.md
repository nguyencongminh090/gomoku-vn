---
name: git-workflow
description: "gomoku-vn's OWN branching/merge rules — takes priority over generic git-automation/git-workflow skills for any git action in this repo, since generic auto-branch-naming or advice would violate these fixed conventions (fix/* off main, feature/* and ui/<style> off dev, one-commit-per-fix, dev-must-also-get-main-fixes, main is PR-only). Covers: which base branch and name pattern to use, fix/*, feature/*, ui/<style>, dev/main checkpoint merges, and recovery from concurrent-session stashes. Load before creating/naming a branch, starting work on a bug fix or new feature, committing, merging, opening a PR, or when git state looks unexpected (missing edits, unfamiliar branch, merge conflict) — in this repo specifically, not as general git guidance."
compatibility: claude-code-only
---

# Git workflow

This repo uses three parallel branch families off different bases, plus a protected `main`. Pick
the family that matches the work before creating a branch.

## Branch families

| Kind of work | Branch name | Base | Merges into | Notes |
|---|---|---|---|---|
| Bug fix | `fix/<slug>` | `main` (or `dev` — see exception below) | `main` (or `dev`) | One commit: fix + kept unit test(s) + `docs/fix-log.md` row |
| New feature | `feature/<slug>` | `dev` | `dev` | Multiple can be in flight; merge only when ready |
| UI design candidate | `ui/<direction>` | `dev` | `dev`, only the chosen winner | One branch per *direction*, not per screen — see below |

**Exception — fix for code/tracking-docs that only exist on `dev`:** if the buggy code, or the
tracking entry (`TODO.md`), was introduced by a `feature/*` branch already merged
into `dev` but not `main`, branch `fix/*` off `dev` and merge back into `dev`, not `main`. Check
first: `git show main:TODO.md | grep '#<N>'` — if the entry is missing on `main`, use `dev`.
Precedents: `fix/tournament-match-board-size` (code-only-on-dev), `fix/auth-cache-control-no-store`
(tracking-docs-only-on-dev, TODO.md #66).

**`ui/<direction>` branches, in detail:**
- One branch per named design *direction*, not per screen — if a direction spans multiple screens
  (lobby, room, tournament…), every screen's work for that direction lands on the *same* branch.
  Only genuinely competing candidates for the *same* screen (`ui/style_a` vs `ui/style_b`) get
  separate branches. (Precedent 2026-08-12: `ui/zen-minimal` + `ui/room-zen-drawer` were the same
  direction split by screen — neither branch alone was a coherent product until merged together.)
- Backend (`server/`) and the board/stones design (`client/js/board.js`, board-specific rules in
  `client/css/game.css`) are locked on every `ui/*` branch — see `design-workflow` skill for the
  full staged process these branches are produced by.
- No `ui/*` branch merges into `dev` on its own; wait for the user to pick a winner, then merge only
  that branch and delete every candidate from that round (winner included).

## One commit per fix/feature-merge, regular merge commits only

Implement the change + its kept unit test(s) + its `docs/fix-log.md` row (fixes only) together, one
commit, after `npm test` passes. Merge with a regular merge commit — never squash or rebase — so the
branch stays traceable. Delete the branch after merging unless told to keep it.

## `main` is branch-protected

PRs required even for admins; force-push and branch deletion disabled. A local `git push origin
main` will be rejected. Merging into `main` (a `fix/*` branch, or a `dev`→`main` checkpoint) requires
`gh pr create --base main --head <branch>` then `gh pr merge --merge`, confirmed with the user first.
`dev` itself is not protected — `feature/*`/`fix/*` → `dev` still use a local merge commit.

Doc-only changes (`TODO.md`, `docs/todo/*`, `CLAUDE.md`, `docs/fix-log.md` and their detail
files) can go straight to `main` — they don't need branch isolation.

## A `fix/*` merged to `main` must also land on `dev` — same session

`dev` and `main` silently diverge if a fix lands on only one. Immediately after merging a `fix/*`
into `main`, also merge it into `dev` (`git checkout dev && git merge fix/<slug>`). This includes
re-running `node scripts/cache-bust.js --write` if the fix touched `client/` (hashes are recomputed from
`dev`'s content; commit any rewritten refs in the merge).

If divergence is only caught later at a checkpoint merge, it's mechanical to resolve, not risky:
- `?v=` conflicts (per-file content hashes since #265): take either side, then
  `node scripts/cache-bust.js --write` and verify with `node scripts/cache-bust.js`. The script recomputes
  every hash from the merged bytes, so there is no counter to pick — never hand-pick a side's hash.
- `docs/fix-log.md` conflicts: keep both branches' rows (append-only survives merges too), insert
  the losing side's unique rows in chronological order by timestamp.
- Test-file conflicts: keep whichever side added new cases — usually both did; keep both, never let
  conflict resolution silently drop a kept test.
- Always re-run `npm test` after resolving, before committing the merge.

This applies regardless of merge direction — including the reverse order (merge into `dev` first,
open the `main` PR after), which the user may explicitly ask for instead of the default.

(Precedent 2026-08-12: `fix/focus-mode-bottom-gap` merged to `main` only; the next `dev`↔`main`
checkpoint PR then hit 14 conflicts, 10 of them pure `?v=N` drift.)

(Precedent 2026-08-21, under the old global `?v=N` counter: a merge kept `?v=133` while `board.js` changed,
so an already-cached URL served stale bytes. Content hashes (#265) make that class impossible as long
as `--write` runs after the merge.)

## Before opening a `dev`→`main` checkpoint-merge PR, check divergence first

```
git fetch origin
git log origin/dev..origin/main --oneline   # commits on main that dev doesn't have
```
Empty → PR merges cleanly. Non-empty → merge `origin/main` into local `dev` first, resolve, push
`dev`, then open the PR. Don't find out via a failed `gh pr merge`.

## Reverting a merge purely as a diagnostic (not a real rollback)

Re-running `node scripts/cache-bust.js --write` (per `.claude/rules/cache-busting.md`) is enough at each
step of a revert → test → re-revert cycle — reverted bytes get their old hash back, which is correct. Verify with `curl -s <url>/path | grep <rule>`
against the live server before concluding it's a caching issue at all — that isolates server/file
layer from browser layer in one command. If a revert/re-revert is underway, say so plainly.

## Concurrent sessions: check `git stash list` before assuming lost work

Another Claude Code session may be running against this repo in its own `git worktree`; setting one
up briefly touches this checkout's `HEAD` and can stash (not destroy) a session's uncommitted edits
mid-task.

If uncommitted edits appear to have vanished (a file you just wrote no longer has the change,
`git status`/`git diff` shows less than expected):
1. `git stash list` first — if found, `git stash show -p stash@{N}` to confirm, then `git stash pop`
   instead of redoing the work.
2. `git worktree list` / `git reflog` to confirm it: a `checkout`/`reset` pair plus an unfamiliar
   branch in `git branch -vv` pointing outside this repo's directory is the signature of this
   scenario, not of a destructive command this session ran.
3. After recovery, confirm with the user before dropping the now-superseded stash — it's work
   product, not disposable.
4. This is not corruption — a large `git fsck --unreachable` count on its own means nothing.
