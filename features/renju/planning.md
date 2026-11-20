# Renju — planning
Sources: [rules note](../../docs/knowledge/renju-rif-rules.md). Design: [user_story](user_story.md), [state](diagram/opening-state.md), [sequence](diagram/uml_diagram/opening.md).

## Architecture
- Pure shared module `client/js/renju.js` (forbidden detector: five-wins, recursive 3-3 exception, 4-4 same-line, overline). Server requires it (like `coords.js`); client draws ✕; PuzzleVerifier reuses. Fixture tests.
- `opening` enum + data-driven step machine replacing `ruleSwap2` booleans/PLACE3/PLACE2. Swap2 must stay identical (undo snapshot ~L680, reconnect state ~L778, TimerManager; read diagnostic-page-sync rule).
- Enum: add `renju` in one place; CHECK constraints (schema.sql, migrations 012/013, ratings.category) -> new migration on live DB; RatingService category, `rankings.cat_renju` i18n, MatchQueue/ChallengeService/PuzzleService RULES, engine `RULE_IDS` (Rapfi RULE 2/4 — verify the shipped build has it).
- 15x15 only; no walls/portals/torus.
- Tests that assert renju is rejected (engine-rulemapper:16, MatchQueue:113, lobby-home:388, db-constraints:132) flip only in the phase enabling that surface.

## Phases (one todo code each)
P1 rule core + enum/DB + FreeRenju (+walls) · P2 Taraguchi-10 + Yamaguchi step machine · P3 UI + browser pass. See "Revision 2026-11-20" below.

## Open questions (blocking todo)
1. Forbidden move: blocked (rejected) or Black loses?
2. Surfaces in P1: rated + leaderboard, quick-match, tournaments, puzzles, bots?
3. RESOLVED: 26 coordinates in the knowledge note (from Wikipedia diagram images; needs one human check). **Long Pro**: still no source -> skipped until supplied.
4. Engine: does the shipped Rapfi support Renju; bots Renju in P1 or refuse?

## Decisions (user, 2026-11-20)
- Forbidden move = **Black loses immediately** (RIF paper rule; unless the move makes five). Server judges; client still marks forbidden points.
- Phase-1 surfaces: custom rooms + challenges, tournaments, puzzles + bots. NOT quick-match, rated queue stays as is until asked.
- 26 patterns: user asked to search a database -> none exists in text; coordinates read from diagram images (verify once).
- Still open: Long Pro source; does the shipped Rapfi have RULE 2/4 (check before bots); rating pool for 'renju' in challenges/tournaments.

## Revision 2026-11-20 (supersedes the phases/constraints above)
- Variants in scope: **FreeRenju, Taraguchi-10, Yamaguchi**. Long Pro = Pro = today's WALL opening rule (unchanged for non-Renju). Soosyrv/Sakata/Tarannikov/Jonsson/Swap: out of scope.
- **Walls are allowed with Renju** (supersedes "15x15, no walls"); Renju+WALL skips the wall first-move zone and 2nd-move >=4 rule for now. Portals/torus still excluded. Forbidden detector must treat a wall like a blocker (like board edge); add fixtures.
- Phases: P1 = renju.js + enum/DB + FreeRenju (+ walls) · P2 = opening step machine for Taraguchi-10 (swap after moves 1-3, zones 3x3/5x5/7x7/9x9, 10 offers) and Yamaguchi (26-pattern, swap, W4 anywhere, N offers, Black places N non-symmetric, W picks + plays 6) · P3 = UI + browser pass. Swap2 stays untouched unless the step machine needs it.
- UI picker notes: [ui-opening-picker.md](ui-opening-picker.md).
- Open: Yamaguchi N cap (renju.net gives none; propose max 8, same as Soosyrv-8); "non-symmetric" check needs a symmetry canonicaliser for 5th-move candidates; whether Yamaguchi's 26-pattern first step needs the opening picker UI (Black picks 1 of 26 by name).

## Revision 2 2026-11-20 — free opening + auto name
- 26-pattern **picker dropped**; see [ui-opening-picker.md](ui-opening-picker.md): free opening, auto-detect name after move 3 (else "free-open").
- Impact: P1 FreeRenju gets the label via `renju-openings.js` (small, pure, symmetry-tested). Yamaguchi step 1 (Black chooses a pattern) disappears; what remains of Yamaguchi/Taraguchi-10 is TBD (open question in the note).
