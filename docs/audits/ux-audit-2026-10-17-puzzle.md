# UX audit — Puzzle (list, solve, editor, mine) — 2026-10-17

```
VERDICT: FAIL (1 Critical, 1 High; coverage scoped — below the 5 min exhaustive floor, so not a clean-room "complete" audit)
Persona: Minh, 28, casual Vietnamese player, phone-first, low tech comfort; also a guest and a logged-out visitor
Surfaces: /puzzles, /puzzle/<id>, /puzzles/new (+?id= edit), /puzzles/mine × 1280/768/375 · member, guest, anon · isolated server :3101 + temp DB (47 puzzles seeded)
Hard gates: console errors 2 real (both the 500s) + 2 audit-caused (404 bad id, 400 empty tags) + 3 expected anon 401 · warnings 0 · network 5xx 2 → CRITICAL · auth 403/404 0 · layout collapse 0 (hscroll 0 at all 3 widths, 4 pages) · axe Critical 0 / Serious 0 (1280: list, solve, mine, editor)
Perf (/puzzles): LCP 0.10 s @1280 / 0.08 s @375, CLS 0.003 / 0.009 (budget 4.0 / 0.25); INP not measured
Findings: Critical 1  High 1  Medium 2  Low 3
Manifest: ~80 entries, median gap ~0.5-1 s, 70 screenshots in docs/audits/2026-10-17/puzzle-*.png
NOT RUN: 11-scenario battery (only keyboard, heavy data 47, guest/anon role), light skin, axe at 375, INP, rule/tag filters combined, multi-move sequence solved by board clicks, wall/portal authoring, admin review, Diễn đàn tab, sub-agent self-critique (CLAUDE.md: no unasked subagents).
```

## Top 5
1. **C1** Guest solve/submit → 500 — only finding that breaks a user task and trips a hard gate.
2. **H1** Filter/paging rewrites URL to the lobby — reload/share/Back all lose the page.
3. **M1** Guests and visitors get the full solve form + editor with no up-front gate (feeds C1).
4. **M2** Filter bar: 3 unlabeled chip groups, uneven rhythm (the layout review earlier today).
5. **L1** Pager keeps scroll position — new page opens mid-list.

## Findings

**C1 — Guest "Kiểm tra" / "Gửi duyệt" returns 500 "Lỗi máy chủ"** · Interaction · Critical
Surface: `/puzzle/<id>` and `/puzzles/new`, guest, any viewport.
Reproduce: login.html → `#btn-guest` → `/puzzle/<id>` → type `I8` → Kiểm tra. Same on `/puzzles/new` (import `h8 i9 h10 j10`, title, tag, answer `H9`, Gửi duyệt).
Observed: `POST /api/puzzles/<id>/solve` and `POST /api/puzzles` → 500; UI "Lỗi máy chủ. Vui lòng thử lại."; server log `SqliteError: FOREIGN KEY constraint failed`. The login prompt `#pz-login` never shows for a guest. Expected: guest sees "Đăng nhập bằng tài khoản thành viên để kiểm tra đáp án." before typing; API answers 403 GUEST_FORBIDDEN.
Evidence: `puzzle-guest-submit.png`, `puzzle-guest-new-submit.png`; guest identity is `userId:"guest_11ea008e"` (POST /api/auth/guest).
Location: `server/routes/puzzles.js:30-33` — guard tests only `!req.user.userId`, but guests have a `guest_…` userId (the session carries `isGuest`); `client/js/puzzle.js:165` `member = me.ok` is true for guests.
Smallest patch: guard `if (!req.user.userId || req.user.isGuest)`; client `member = me.ok && !<isGuest from fetchMe>`.
Same guard text exists in `games.js:138, forum.js:32, notifications.js:22, challenges.js:27, friends.js:28, clubs.js:45` — **not verified** for guests; check before assuming.

**H1 — `<base href="/">` + relative `replaceState('?…')` sends the URL to the lobby** · Architecture · High
Surface: `/puzzles`, any viewport.
Reproduce: open `/puzzles` → URL becomes `/?` immediately; click "Dễ" → `/?level=easy`; reload.
Observed: after reload the page is the lobby ("Play3CR — Sảnh"), no `#pz-list`; paging gives `/?page=2`; Back after 3 pages goes to `/index.html`. Expected: `/puzzles?level=easy` survives reload/share, filters restore.
Evidence: manifest lines "URL after plain load = /?", `puzzle-url-after-reload.png`.
Location: `client/js/puzzles.js:101` with `client/puzzles.html:5` (`<base href="/">`; same `<base>` in puzzle*.html).
Smallest patch: `history.replaceState(null, '', location.pathname + (query() ? '?' + query() : ''))`; add a jsdom test with `<base href="/">` asserting pathname stays `/puzzles`.

**M1 — Guests/visitors see "Đăng puzzle mới", "Puzzle của tôi", the whole editor and an enabled solve form** · Feedback · Medium
Reproduce: guest or anon → /puzzles, open /puzzles/new, fill a whole puzzle. Observed: only after submit the user learns it is member-only (anon: prompt appears after click; guest: 500, see C1; anon `/puzzles/mine` shows the message but logs 401 red in console). First-time-user lens: effort wasted.
Location: `client/js/puzzle-editor.js`, `client/js/puzzles-mine.js`, `client/puzzles.html:31-33`.
Smallest patch: show `#pz-login`/`#ed-error` on load for non-members and hide the two action buttons for guest/anon.

**M2 — Filter bar: three unlabeled chip groups, uneven rhythm** · Visual · Medium
Surface: `/puzzles` 1280 and 375. Observed: Level left, Luật pushed ~600 px right (`justify-content:space-between`), Chủ đề on a separate row; gaps 16/14/20 px (inline `margin:0 0 16px`, `.pchips` 14, `.pbar` 20); at 375 three wrapped rows with no group names — Minh cannot tell "Freestyle/Standard/Caro VN" is a rule filter. Evidence: `puzzle-list-1280-before.png`, `puzzle-list-375-after.png`.
Location: `client/css/platform.css:75,81`, `client/puzzles.html:30-40`.
Smallest patch: option A from the layout review — one block, small visible labels (Độ khó / Luật / Chủ đề), `justify-content:flex-start`, one gap token, move `#pz-tags` inside the block.

**L1 — Pager leaves scroll where it was** · Interaction · Low
Observed: click "Sau" at page bottom → `scrollY=483`, lands inside the new list. Location: `client/js/puzzles.js:85-86`. Patch: `listEl.scrollIntoView({block:'start'})` after a page change.

**L2 — Cryptic editor hints** · Visual · Low
"Đen 0 · Trắng 0 — Đen đi: số quân đen = trắng" and "Cổng (2 lần bấm)" need prior knowledge. Location: `client/js/puzzle-editor.js` (count line). Patch: plain sentence, e.g. "Đen 4 · Trắng 4 — lượt Đen (hai bên có số quân bằng nhau)".

**L3 — `/puzzles/mine` is one unpaged list** · Architecture · Low
Observed: 49 "Sửa" links in one page for 49 puzzles (author view). Location: `server/routes/puzzles.js` `/mine` + `puzzles-mine.js`. Patch: reuse the list pager, or cap + "Xem thêm".

## What passed (proof in manifest / screenshots)
Filters (level, tag, empty state "Chưa có puzzle nào khớp bộ lọc."), keyboard Tab/Enter on chips; solve flow: invalid coords "Toạ độ không hợp lệ.", wrong "Chưa đúng, thử lại nhé.", right "Chính xác!" + next link, solved state survives reload and shows "Đã giải" in the list; bad id → "Không tìm thấy puzzle."; no horizontal scroll and no overlap with the fixed tab bar at 375 (submit bottom 518 < tab bar 632); editor import text/garbage messages, HTML5 required, double-click submit created 1 puzzle, edit → "Chờ duyệt"; pagination 47 → 3 pages.

## Roadmap
Quick wins: C1 guard (+ regression test), H1 one-liner (+ jsdom test), L1, L2. Structural: M1 gating, M2 filter block, L3 paging for mine.

## Hold this in your hands
The solving screen is the best part: a clean board, one clear instruction line, instant plain-Vietnamese feedback, and the solved state remembers you — it feels like a small, finished tool. The shell around it is where it frays: the list page's address bar lies about where you are, the filters read like a pile of equal-weight tags, and a guest who does everything the screen invites ends on "Lỗi máy chủ". Fix those three and the puzzle area feels trustworthy rather than demo-grade.
