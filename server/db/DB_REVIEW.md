> **Status: applied 2026-08-01.** Findings #1, #2, #3, and #5 have been implemented in
> `schema.sql` and against the live `gomoku.db` via
> [migrations/001_add_fk_and_indexes.sql](migrations/001_add_fk_and_indexes.sql) and
> [migrations/002_rebuild_player_games_and_games_fk.sql](migrations/002_rebuild_player_games_and_games_fk.sql).
> Findings #4, #6, #7, #8 remain intentionally unactioned — see each finding for why.
> Live-data note: applying #1/#2 required deciding how to handle pre-existing
> `guest_XXXXXXXX` synthetic ids sitting in `games.black/white_player_id` and
> `player_games.player_id` (306/596 rows affected) — these were nulled/deleted per
> owner decision (see migration 002's header). Pre-migration backup:
> `gomoku.db.bak-pre-migration-20260801171535`.

# SQLite Database Review — `users` / `games` / `player_games`

Scope: [schema.sql](schema.sql) + query patterns in [database.js](database.js).
`db.pragma('foreign_keys = ON')` is set in database.js:29, so FK enforcement is live for whatever
constraints actually exist in the schema — which is the root of most findings below.

## Findings

### 1. `player_games.player_id` has no FK to `users(id)` — Critical
`player_games` declares `FOREIGN KEY (game_id) REFERENCES games(id)` but nothing constrains
`player_id`. Any bug in caller code (typo'd id, stale id after a user is renamed/re-created,
future user-delete feature) silently inserts an orphaned row that `getPlayerHistory` will still
join and return as if valid. Because `foreign_keys = ON` is already active, adding this
constraint costs nothing at runtime beyond the write path — it's currently just missing.

### 2. `games.black_player_id` / `games.white_player_id` have no FK to `users(id)` — Moderate
Same class of issue as #1, on the denormalized copy of the player reference stored per-game.
Nullable for guests (correct), but for registered players nothing stops an id that doesn't
exist in `users`. Lower severity than #1 because these columns are display/reference-only —
`getPlayerHistory` reaches players through `player_games`, not these columns — but any future
"show this user's profile from a game row" feature would inherit the orphan risk silently.

### 3. `player_games` → `games` FK has no `ON DELETE` action — Minor
There's currently no code path that deletes a `games` row, so this is dormant risk, not an
active bug. But as written, deleting a game while `foreign_keys = ON` would fail hard (not
cascade) rather than clean up `player_games`, which is very likely a surprise the day someone
adds a "delete/prune old games" admin feature. Worth deciding intent now (`CASCADE` vs
`RESTRICT`) rather than discovering it under a production incident.

### 4. `games.winner` overloads three meanings in one TEXT column — Minor
`winner` holds either a player id (matching `black_player_id`/`white_player_id`), the literal
string `'draw'`, or `NULL` (interrupted). This is a data-modeling smell rather than a bug: it
makes the column impossible to type-check or FK-constrain, and any query like "how many games
did user X win" has to compare against two different columns to know which color X played.
Flagged for awareness — fixing it means adding a `winner_color TEXT CHECK (winner_color IN
('BLACK','WHITE','DRAW'))` column alongside the existing one, which is a table rebuild (see
migration notes) and a call-site change in `saveGame`. Not included as a blind migration since
it changes the write contract; call it out as a follow-up decision rather than force it here.

### 5. `getRecentGames` sorts on `ended_at` with no supporting index — Moderate
`getRecentGames` (database.js:162) runs `ORDER BY ended_at DESC LIMIT ? OFFSET ?` against the
full `games` table with no `WHERE` clause. Without an index on `ended_at`, SQLite has to
materialize and sort the whole table on every call (this is the lobby/history "recent games"
endpoint, so it's a hot path). `idx_games_room_id` doesn't help it at all — see #6.

### 6. `idx_games_room_id` isn't used by any current query — Minor
`grep` across `server/` shows nothing filters on `games.room_id` today (`getGameById` filters
on `id`, not `room_id`; nothing in `routes/games.js` or `routes/auth.js` queries by it either).
The index isn't harmful — it just costs a write-amplification tax on every `saveGame()` insert
for a lookup pattern that doesn't exist yet. Leaving it is reasonable if a "game history for a
room" feature is planned; otherwise it's dead weight. No migration provided — this is a
keep-or-drop judgment call for you, not a correctness fix.

### 7. `player_games` composite PK has no secondary index for `game_id`-only lookups — Minor
`PRIMARY KEY (player_id, game_id)` only accelerates lookups that start with `player_id` (which
is exactly what `getPlayerHistory` does, so today it's fine). If anything ever needs "which
players were in game X" without going through `games.black_player_id`/`white_player_id`
directly, that's a table scan. No current caller needs it, so no migration included — noting it
so it's not a surprise later.

### 8. JSON-encoded `moves` / `walls` / `portals` bypass relational integrity — Minor
These columns store JSON blobs of move/board data with no schema validation at the SQLite
level — a malformed JSON string would insert silently and only fail at `JSON.parse()` time on
read. This is a reasonable and common tradeoff for append-only, per-game audit data that's never
queried by SQLite itself (better-sqlite3 doesn't even have `moves` indexed into or filtered by
SQL anywhere in database.js), so it is **not** a recommendation to normalize into child tables —
that would be over-engineering for write-once/read-whole data. Flagged only so it's a documented
decision: if these columns are ever queried into (e.g. "find all games with a wall at x,y"),
that's the point normalization becomes worth the cost, not before.

### 9. Naming, ID format, and timestamp conventions — No issues found
`snake_case` columns, `TEXT` UUIDv4 primary keys, and ISO 8601 `TEXT` timestamps are used
consistently across all three tables. No inconsistency to fix.

## Migrations

See [migrations/001_add_fk_and_indexes.sql](migrations/001_add_fk_and_indexes.sql) for the
indexes (#5), which are safely idempotent via `CREATE INDEX IF NOT EXISTS`, matching the style
already in `schema.sql`.

**Findings #1 and #2 (missing FKs on `player_games.player_id`, `games.black_player_id`,
`games.white_player_id`) have no in-place SQLite migration path.** SQLite's `ALTER TABLE` cannot
add a `FOREIGN KEY` constraint to an existing table — full stop. The only way to add one is the
standard SQLite "12-step" table-rebuild:

1. `PRAGMA foreign_keys=OFF;`
2. Begin transaction.
3. `CREATE TABLE <name>_new (...)` with the new FK constraints included from the start.
4. `INSERT INTO <name>_new SELECT * FROM <name>;` (copy existing data — any rows that would now
   violate the new FK need to be resolved *before* this step, e.g. by nulling out orphaned ids,
   since the copy itself doesn't enforce FKs while `PRAGMA foreign_keys=OFF`).
5. `DROP TABLE <name>;`
6. `ALTER TABLE <name>_new RENAME TO <name>;`
7. Re-create any indexes that were on the old table (they don't survive the rename).
8. Commit transaction.
9. `PRAGMA foreign_keys=ON;`

This is provided as a documented, ready-to-run script
([migrations/002_rebuild_player_games_and_games_fk.sql](migrations/002_rebuild_player_games_and_games_fk.sql))
rather than folded into `schema.sql`'s `CREATE TABLE IF NOT EXISTS` statements, because:
- It's inherently a one-time data migration, not a schema-bootstrap statement — running it
  against a fresh empty DB is harmless but running it via the `IF NOT EXISTS` bootstrap path on
  every server start (as `schema.sql` does) is the wrong trigger for a rebuild that copies rows.
- It should run once, deliberately, ideally after a backup of `gomoku.db`, since a table rebuild
  is not something you want interrupted mid-way by a process crash without a rollback point.

Before running it, decide on the orphan-handling policy for #1/#2 (the script below nulls
orphaned ids rather than deleting rows, to avoid silent data loss — adjust if you'd rather
delete instead).
