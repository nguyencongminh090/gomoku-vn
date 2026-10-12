# Rating integrity — Planning

Status: **open** (recorded 2026-10-12). Resolve with the user, then formalize into `docs/todo/<CODE>` +
`TODO.md` line. A feature folder is not authorization to implement.

## Open questions
1. **Scope of v1.** Detection + admin list only, or also rating effect? (Recommended: detect + flag first.)
2. **Pair damping.** Count ranked games between one pair only N times per 24 h (value of N)? Skip the
   update, or scale delta? `glicko2()` has no weight, so scale/skip happens in `rateGame`.
3. **Signals.** Which of: opponent entropy, top-opponent gain share, pair asymmetry, community detection?
   Thresholds, and how they scale with population size.
4. **IP/device.** Store a hashed IP/device id per session/game? Privacy, retention, Cloudflare Tunnel
   (`getClientIp()` precedent). Without it only behavioural signals exist.
5. **Action on a flag.** Hide from public rankings until reviewed? Freeze rating? Admin-only note?
6. **False-positive guard.** Exempt/annotate friends, club members, tournament opponents?
7. **Run mode.** Nightly batch vs on game end; where results live (new table vs admin page query).
8. **Matchmaking.** Prefer opponents not met recently (separate item, optional).

## Sequencing (proposal)
1. Read-only metrics query + admin list (no rating effect). Tests on synthetic rings.
2. Pair damping in `rateGame` (needs Q2).
3. Community detection once real data exists to tune thresholds.
4. IP/device link (needs Q4).

## Touches
`server/managers/RatingService.js` (`rateGame`), `server/db/database.js` (queries), `server/routes/admin.js`
+ admin page, `scripts/` (batch job), schema migration if a flag table is added, tests.
Knowledge: check `docs/knowledge/INDEX.md` (security/storage) before deciding Q4/Q5.

## Decisions (2026-10-12, user)
- **Q1 scope v1:** detect + admin list only; no rating effect (so Q2 pair damping → later item).
- **Q3 signals:** all four — opponent entropy/unique opponents, top-opponent gain share, pair asymmetry,
  community detection (Louvain). Louvain last in sequencing: thresholds need real data; scale with population.
- **Q5 action:** admin-only note; no ranking/rating effect.
- **Q7 run mode:** computed on demand by a query on the admin page; no new table, no migration.
- **Still open (not blocking v1):** Q2 (damping N, skip vs scale), Q4 (IP/device, privacy), Q6 (friend/club
  context shown as annotation, per user_story rule), Q8 (matchmaking).
