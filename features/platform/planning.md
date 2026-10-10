# Platform — Planning

Status: **open — awaiting UI demo review.** Not authorization to implement ([design-intake](../../.claude/rules/design-intake.md)).
Source: [user_story](user_story.md).

## Decided (2026-10-09)
- Scale: **public, thousands** of users. Release 1 = Profile + Rankings + Clubs.
- **UI demo first** (standalone `*-mockup.html`, per `design-workflow` Stage 3), then user picks a direction, *then* implement.
- Proposed (unconfirmed): Glicko-2 rating; guests allowed for casual play; avatars on object storage (R2) vs local disk undecided.

- **Proposed 2026-10-09 (user):** several UI skins selectable in User Settings — A Zen, C Arena, D Bento (B Sumie dropped: rail layout). **Decided 2026-10-09: default skin = C Arena, with BOTH dark (default) and light modes** (mode is an axis independent of skin; A/D get light/dark later). Remaining: Q9 details.

## Open questions
1. Visual style: pick one of the existing lobby mockups (Zen/Ledger/Editorial/…) as the platform look, or new direction? (answer via mockup review)
2. ~~Avatar storage~~ **Resolved 2026-10-09 (#177):** local disk, re-encoded 256² WebP ≤ 30 KB (~6–12 KB typical), 2 MB input cap, JPEG/PNG/WebP only; no moderation queue yet.
3. ~~Rating~~ **Resolved 2026-10-09 (#175):** Glicko-2, start 1200 / RD 350 / vol 0.06, tau 0.5, provisional while RD > 110. Ranked = room toggle (default on), both players members; tournament games unrated.
4. ~~Rating matrix~~ **Resolved 2026-10-09 (#175):** one pool per winning rule (freestyle / standard / caro); wall/portal/swap2 games rate in their rule's pool; **no speed split** (per_move / per_game / blitz share the pool).
5. ~~Club rules~~ **Resolved 2026-10-09 (#178):** open|invite per club (owner picks); any member may create; 500 members / 3 clubs per user; roles owner > officer > member.
6. ~~Profile privacy~~ **Resolved 2026-10-09 (#177):** public by default; per-user opt-outs hide game history and bio.
7. i18n now (VI/EN) or VI-only?
8. ~~SQLite at thousands?~~ **Resolved 2026-10-09 (#174): KEEP SQLite (WAL) + 3 limits; no Postgres now.**
   Measured (synthetic, `better-sqlite3`, real schema + `ratings`/`rating_history` tables, 1 tx per game end = games row + 2 player_games + 2 rating updates + 2 history rows; 3 categories, ext4 SSD):
   | Scale | Write (1 tx/game) | Reads (p50 / p99) |
   |---|---|---|
   | 5k users, 200k games, 414k history rows, 921 MB (tmpfs) | ~9.5k games/s, p99 1 ms | top100 0.04/0.08 ms; my-rank 0.09/0.24; user history 0.04/0.09; game history 0.20/0.40 |
   | 20k users, 500k games, 1.0M history rows, 2.3 GB (disk) | 112–150 games/s sustained under continuous write; p50 0.09–4.6 ms, **p99 160–290 ms, max ~590 ms** | top100 0.04/0.17; my-rank 0.29/0.58; history 0.03/0.12; game history 0.16/0.36 |
   Load model (assumption, not measured in prod): ≤6000 concurrent players (#29 ceiling) → ≤3000 games, avg ~10 min ⇒ ≈5 game-ends/s peak, ≈25× below sustained write capacity; reads are sub-ms with indexes `ratings(category, rating DESC)` and `rating_history(user_id, category, id DESC)`.
   **Limits / conditions to keep SQLite:**
   1. better-sqlite3 is synchronous: the 160–590 ms p99/max stalls (WAL checkpoint/fsync under saturated writes) would block the event loop and the room clocks ⇒ rating writes must go through a small async queue (batch per tick, off the `game:move` path), never inline in the move handler.
   2. Set `synchronous=NORMAL` (currently default FULL) and keep `wal_autocheckpoint` default; re-measure p99 on the deploy host (#4-style) before release.
   3. Re-evaluate (→ Postgres, `data-storage-selection`) if: sustained >50 game-ends/s, multiple server processes (#6), DB >~10 GB, or leaderboard queries need joins beyond `ratings`+`users`.
   Not measured: contention with live socket traffic, backup cost at GB scale, mixed read/write concurrency. Note: `data-storage-selection` = keep the single store while it meets needs.

9. ~~Multi-skin~~ **Resolved 2026-10-09:** skin = colour + radius tokens only (no density/layout change); persist cookie first (server emits `data-skin`/`data-mode` in HTML, no flash, CSP-safe), `users.ui_skin` synced later in #177; default mode dark; one shared board for all skins (contrast-checked per skin, board/stone rules untouched).

## Sequencing (each step = own todo, model per CLAUDE.md)
1. **B172 design brief + UI demo** (shell, profile, rankings, club) → user review. ← only step actionable now.
2. B173 design tokens + app shell (after style chosen).
3. B174 DB/scale decision (before schema work).
4. B175 rating engine + game→rating hook; B176 rankings page.
5. B177 profile + avatar upload; B178 clubs.
Steps 4–5 may reorder after Q2/Q3/Q8 are answered.

## Release 2 — full Arena mockup
Status: **open questions below; not authorization to implement.** Gap found 2026-10-09 by screenshot diff
(mockup vs real, 1280 + 390, faked API): rankings/profile/clubs/club ≈ match; lobby, history, tournament,
room use the old shell; everything in the table below has no backend.

| # | Item | Backend | Size |
|---|---|---|---|
| R1 | Arena shell on lobby/history/tournament(+match); lobby → Chơi/Phòng/Giải đấu screens on existing data (user report 2026-10-09: lobby tab inconsistent with other tabs) | none | M |
| R2 | Home: active games, "Hôm nay" (upcoming tournaments), live boards (mini board + viewers) | read endpoints | M |
| R3 | Quick match queue (rule × time, rated/casual), est. wait | new queue + socket | L |
| R4 | Friends, challenges, notifications (bell), persisted DMs (today: ephemeral #159) | schema + socket | L |
| R5 | Settings page: country/city, privacy (strangers' challenges, hide online); badges + win streak | schema | M |
| R6 | Club tabs: members, club tournaments, events, club chat, club-vs-club | schema | L |
| R7 | Learn: replay restyle + annotations; puzzles; openings; eval bar (needs engine) | engine? content? | L |
| R8 | Admin: reports, cheat flags, avatar review, users | schema + roles | L |
B191 items fold into R4–R6.

### Decided (user, 2026-10-09)
1. ~~Order~~ R1 → R8 in sequence (UI first, then backend features).
2. ~~Time chips~~ Fischer = the existing `blitz` mode (found 2026-10-09, no new clock mode needed) for 1+0/3+2/5+3/10+0; **drop Thư tín** (correspondence).
3. ~~Rule chips~~ use real rules Free-style / Standard / Caro VN; no Renju.
4. ~~Engine~~ eval bar + move-quality labels = **placeholder** in R7 for now. Later source: user project `/run/media/ngmint/Data/Programming/Programming/HTML/GomokuBoardSite/` (engine work).
5. ~~"Phòng" nav item in R1~~ deferred to R2 (user 2026-10-09): until Chơi becomes the dashboard, both would open the same room list.
### Open questions
5. Puzzles/openings content source (hand-made, generated from games, imported)?
6. Room top bar gets the full nav? (B191.6 said no — stray clicks mid-game.)
