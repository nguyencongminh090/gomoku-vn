# B269 — Fewer requests per page load: one `/api/shell` + no duplicate `rankings/me`
**Status:** ✅ DONE 2026-10-17 — uncommitted on feature/269-shell-bootstrap; ?v= rewritten; 3299 tests green
**Area:** `server/routes/shell.js` (new), `rankings.js` (export builder), `client/js/platform-shell.js`, `api-early.js`, `settings.js`, `rankings.js`, `forum-common.js`, `puzzle.js`, `puzzle-editor.js`
**From:** user "Optimize Request per loading", 2026-10-17 (measure: 5 shell APIs on every platform page, `rankings/me` twice on rankings+settings)   **Depends:** #263

## Problem
Every member page fires `/api/notifications`, `/api/rankings/me`, `/api/admin/me` from the shell, and settings/rankings/forum/puzzle(-editor) fetch `/api/rankings/me` again.

## Scope
1. (b) `GET /api/shell` (members) → `{me, admin, notifications}` = exact bodies of the three endpoints; shell uses it once at load. Polls still use `/api/notifications`.
2. (a) Page scripts reuse the shell's `me` via `GvnShell.me()` (falls back to own fetch if shell absent / failed).
3. `api-early.js` starts `/api/shell` instead of the three calls (lobby).

## Don't
- Don't change the three old endpoints (other callers: admin.js, tests). Don't touch `/api/home`, `clubs/mine`, `profile/prefs` (fresh-device only).

## Traps
- Response bodies are single-use: `GvnShell.me()` must clone/parse once and hand out the parsed object.
- Guests: shell must not call `/api/shell` (403 noise).

## Done when
- Member page = 1 shell request instead of 3; no duplicate `rankings/me`; tests green; fix-log entry.
