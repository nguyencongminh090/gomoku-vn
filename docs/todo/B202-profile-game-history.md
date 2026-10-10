# B202 — Profile: per-user game history (replaces /history.html)
**Status:** ✅ DONE 2026-10-10 on `feature/202-profile-history` (committed, not yet merged to `dev`), `?v=213`
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

## Notes (2026-10-10)
- `GET /api/profile/:username/games?page=` (10/page, newest first; `hide_history` → 403 `HISTORY_HIDDEN` unless owner); row shape shared with the profile payload (`gameRow`). Profile panel "Lịch sử ván" + "Xem thêm"; `#games` hash scrolls to it.
- Replay = `/replay/<id>` (`replay.html` + `replay.js`, renamed from `history.html/js` via git mv; list/search/stats code removed; `?source=tournament` kept; tournament-detail links updated). `/history.html` stays as a server redirect (`?id=` → replay, else own profile `#games`, else login) — no file.
- Back button uses `history.length` (not `document.referrer`: empty under the site's no-referrer policy).
- Left: nav tab "Học" still points to `/history.html` → now lands on the visitor's own profile history until /learn exists. `GET /api/games` + `/stats` kept for the future global-history site. `css/history.css` still holds the old list styles (cleanup later).
- Verified: `npm test` green; real-browser pass (own DB): 12 games → 10 + load more, row → replay with moves/steps, back → profile, owner `/history.html` → `/u/<me>#games`, hidden history → note + 403. Not verified: light mode, mobile layout of the replay page, `dist/` build (#194).