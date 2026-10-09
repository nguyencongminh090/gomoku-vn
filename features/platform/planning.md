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
2. Avatar storage: local disk vs Cloudflare R2? Upload limits, moderation of images.
3. Rating: Glicko-2 vs Elo; initial rating/RD; provisional threshold; do tournament games affect rating?
4. Variants × speeds list for the rating matrix (which variants/time controls get separate ratings).
5. Club: open vs invite-only; max members; who may create (rating/age gate?); club roles.
6. Profile privacy defaults; public game history or opt-out?
7. i18n now (VI/EN) or VI-only?
8. SQLite OK at thousands (WAL, one writer) for rating history + leaderboards, or plan Postgres? Needs measurement.

9. ~~Multi-skin~~ **Resolved 2026-10-09:** skin = colour + radius tokens only (no density/layout change); persist cookie first (server emits `data-skin`/`data-mode` in HTML, no flash, CSP-safe), `users.ui_skin` synced later in #177; default mode dark; one shared board for all skins (contrast-checked per skin, board/stone rules untouched).

## Sequencing (each step = own todo, model per CLAUDE.md)
1. **B172 design brief + UI demo** (shell, profile, rankings, club) → user review. ← only step actionable now.
2. B173 design tokens + app shell (after style chosen).
3. B174 DB/scale decision (before schema work).
4. B175 rating engine + game→rating hook; B176 rankings page.
5. B177 profile + avatar upload; B178 clubs.
Steps 4–5 may reorder after Q2/Q3/Q8 are answered.
