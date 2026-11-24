# B442 — Review archived Codex branch admin-ranking-review (auth/admin/ranking fixes)
**Status:** ✅ CLOSED 2026-11-24 — closed by user request without per-commit review; tag `archive/codex-admin-ranking-review` kept (not deleted).
**Area:** server/routes/{admin,auth,rankings}.js, server/utils/legacy-auth.js, TournamentManager, package*.json, server/tests
**From:** branch cleanup 2026-11-24; branch deleted, kept as tag `archive/codex-admin-ranking-review` (93a83665)   **Depends:** —

## Problem
Codex branch with 6 commits (2026-11-15) never merged; dev moved on ~70 commits since.
Commits: refresh npm deps; check account state when starting sessions; validate admin actions +
lock sessions atomically; fix admin console loading/navigation; ranking scopes in search + guard
profile requests; tournament standings consistent through completion. 42 files, +1163/-471, has tests.

## Scope
1. `git log dev..archive/codex-admin-ranking-review` and read each commit; decide per commit: take / drop / redo.
2. Taken ones go on `fix/*` branches (one commit each, regression test, fix-log row) per git-workflow.

## Don't
- Don't merge the tag wholesale: the npm refresh and old base will conflict with current dev.
- Don't delete the tag until every commit is decided.

## Traps
- Auth/session changes affect prod logins (VPS); verify with real-browser login before deploy.

## Done when
- Every commit taken or explicitly dropped; tag deleted.
