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

**Status:** ✅ DONE 2026-10-12 — merged to dev in 22dc43d; `?v=315`.
## Result
- DB `news` (schema.sql, CREATE IF NOT EXISTS) + `NewsService` (perm `news.manage` = admin only; one-line plain text ≤200; optional same-site `link`, `//`/`/\`/schemes rejected). `/api/admin/news` GET/POST/PUT/DELETE; admin tab "Tin tức" (`admin-news.js`).
- `/api/home` + `news` (newest), `forum` (3 most recently active, titles only), `learn {total, solved}`, `newcomer` (guest or < 5 games). DB blocks are fail-soft: an error drops them, rest of the dashboard still served.
- UI "Play-first" (user pick): news line under stats; left Quick match → My games → Learn → About (newcomers); right Today → Forum → Live. "dùng máy tính để giải" removed at user request (2026-10-12) — Learn card shows count/solved only.
- "Top 3 forum" = most recent activity (forum's own sort), not most replies.
- Also fixed the Jest-never-exits hang (WAL timer, see fix-log 2026-10-12 05:45).
- Verified: `npm test` 160 suites / 2976; real browser (isolated copy, 1280 + 390): member POST → 403 NEWS_FORBIDDEN, admin publish via UI, news click → thread, no overflow, 0 console errors, guest sees About + total only.
