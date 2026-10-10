# B202 — Profile: per-user game history (replaces /history.html)
**Status:** OPEN — recorded 2026-10-10, not started (user direction, see features/learn/planning.md "Decided")
**Area:** client (profile.html/profile.js, history.js reuse, `/history.html` redirect) + server (`GET /api/games` player filter)
**From:** user 2026-10-10: "Lịch sử ván chơi của user -> chuyển vào profile … History tổng quát, sau này sẽ làm một site riêng."   **Depends:** B199 (done)

## Problem
Game history is a global list on the old-shell `/history.html`. The user wants each player's history on their profile; the global history becomes a separate site later.

## Scope
1. Profile "Lịch sử ván" tab: that user's finished games (result, opponent, rule, date), paginated; privacy setting "show game history on profile" (#199) respected.
2. Row → replay (reuse `history.js` viewer + move tree; where it lives = planning Q9).
3. `/history.html` redirects to the profile history of the logged-in user (or login); old shell removed once replay has a new home.

## Don't
- No new global history here. Don't fork `history.js`; keep its tests green.

## Done when
- Backend filter test, jsdom test, real-browser pass; privacy flag honoured; `?v=N` bumped.
