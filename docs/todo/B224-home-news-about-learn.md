# B224 — Dashboard: admin news line + top-3 forum, About, Learn/Puzzle card
**Area:** server (new news table/route, admin UI), server/routes/home.js, client/index.html, client/js/lobby-home.js, client/admin.html
**From:** user 2026-10-12 — news = admin-only feature (option B: DB + admin edit); "một dòng tin tức admin + top 3 từ forum"   **Depends:** B223 (layout)

## Problem
Dashboard has no news, intro, or pointer to Puzzle/Learn; puzzle is desktop-only so mobile users never learn it exists.
## Scope
1. DB table `news` (+ migration); admin-only create/edit/delete (admin page section + routes); public read of the latest 1 item.
2. `/api/home` adds `news` (1 admin item) + `forum` (top 3 threads, existing ForumService query).
3. UI via `design-workflow` (new screen layout): news line, top-3 forum, About block (rules Freestyle/Standard/Caro; guests/new accounts only), Learn card (puzzle count/solved; on phone says "dùng máy tính để giải").
## Don't
- Admin check server-side only (`isAdmin`), never client flag. Escape news text (no HTML).
## Done when
- Backend tests (admin-only auth, 403 for non-admin), jsdom, real-browser pass desktop + phone; `?v=` bumped.
