-- =============================================================================
-- Migration 002 — add missing FK constraints via table rebuild
-- Addresses DB_REVIEW.md findings #1 and #2:
--   - player_games.player_id  -> users(id)  (no FK today)
--   - games.black_player_id   -> users(id)  (no FK today)
--   - games.white_player_id   -> users(id)  (no FK today)
--
-- SQLite cannot ALTER TABLE ... ADD FOREIGN KEY on an existing table.
-- This performs the standard SQLite table-rebuild ("12-step") procedure.
--
-- NOT idempotent by nature (it copies data once) — back up gomoku.db before
-- running, and run this as a one-off migration, NOT via the schema.sql
-- bootstrap path that executes on every server start.
--
-- Orphan-handling policy (confirmed against live data before running): every
-- orphaned reference found in production gomoku.db was a legacy guest_XXXXXXXX
-- synthetic id (306 games / 596 player_games rows total; 108 black_player_id,
-- 116 white_player_id, and 226 player_games.player_id rows carried a guest_*
-- value instead of NULL — pre-dating the isGuest guard now in saveGame()).
-- games.black/white_player_id are NULLed to match the "-- null for guests"
-- schema intent; player_games rows are DELETEd since player_id is part of the
-- PRIMARY KEY and can't be NULL. No registered-user (users.id) reference was
-- ever orphaned.
-- =============================================================================

PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

-- ---------------------------------------------------------------------------
-- Step 1: resolve orphans that would violate the new FKs
-- ---------------------------------------------------------------------------

UPDATE games
SET black_player_id = NULL
WHERE black_player_id IS NOT NULL
  AND black_player_id NOT IN (SELECT id FROM users);

UPDATE games
SET white_player_id = NULL
WHERE white_player_id IS NOT NULL
  AND white_player_id NOT IN (SELECT id FROM users);

DELETE FROM player_games
WHERE player_id NOT IN (SELECT id FROM users);

-- ---------------------------------------------------------------------------
-- Step 2: rebuild games with FKs on black_player_id / white_player_id
-- ---------------------------------------------------------------------------

CREATE TABLE games_new (
  id                 TEXT PRIMARY KEY,
  room_id            TEXT NOT NULL,
  black_player_id    TEXT REFERENCES users(id),
  white_player_id    TEXT REFERENCES users(id),
  black_player_name  TEXT NOT NULL,
  white_player_name  TEXT NOT NULL,
  winner             TEXT,
  reason             TEXT,
  board_size         INTEGER NOT NULL,
  rule_wall          INTEGER NOT NULL DEFAULT 0,
  rule_portal        INTEGER NOT NULL DEFAULT 0,
  moves              TEXT,
  walls              TEXT,
  portals            TEXT,
  started_at         TEXT NOT NULL,
  ended_at           TEXT
);

INSERT INTO games_new SELECT * FROM games;

DROP TABLE games;

ALTER TABLE games_new RENAME TO games;

CREATE INDEX IF NOT EXISTS idx_games_room_id ON games(room_id);
CREATE INDEX IF NOT EXISTS idx_games_ended_at ON games(ended_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_black_player_id ON games(black_player_id);
CREATE INDEX IF NOT EXISTS idx_games_white_player_id ON games(white_player_id);

-- ---------------------------------------------------------------------------
-- Step 3: rebuild player_games with FK on player_id
-- (game_id -> games(id) FK is kept and given an explicit ON DELETE CASCADE,
--  addressing finding #3 — deleting a game now cleans up its player_games
--  rows instead of failing under foreign_keys=ON.)
-- ---------------------------------------------------------------------------

CREATE TABLE player_games_new (
  player_id  TEXT NOT NULL REFERENCES users(id),
  game_id    TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  PRIMARY KEY (player_id, game_id)
);

INSERT INTO player_games_new SELECT * FROM player_games;

DROP TABLE player_games;

ALTER TABLE player_games_new RENAME TO player_games;

CREATE INDEX IF NOT EXISTS idx_player_games_player_id ON player_games(player_id);

COMMIT;

PRAGMA foreign_keys = ON;

-- Sanity check after running: this should return zero rows.
--   PRAGMA foreign_key_check;
