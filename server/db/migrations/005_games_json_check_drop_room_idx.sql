-- rebuild
-- B259: json_valid CHECK on games.moves/walls/portals (rebuild; SQLite can't ADD CHECK) and drop unused idx_games_room_id
-- (no query filters on room_id; write cost only). Existing rows were verified valid; a bad row aborts + rolls back.
CREATE TABLE games_new (
  id                 TEXT PRIMARY KEY,
  room_id            TEXT NOT NULL,
  black_player_id    TEXT REFERENCES users(id),  -- null for guests
  white_player_id    TEXT REFERENCES users(id),  -- null for guests
  black_player_name  TEXT NOT NULL,
  white_player_name  TEXT NOT NULL,
  winner             TEXT,
  reason             TEXT,
  board_size         INTEGER NOT NULL,
  rule_wall          INTEGER NOT NULL DEFAULT 0,
  rule_portal        INTEGER NOT NULL DEFAULT 0,
  moves              TEXT CHECK (moves   IS NULL OR json_valid(moves)),
  walls              TEXT CHECK (walls   IS NULL OR json_valid(walls)),
  portals            TEXT CHECK (portals IS NULL OR json_valid(portals)),
  started_at         TEXT NOT NULL,
  ended_at           TEXT,
  ranked             INTEGER NOT NULL DEFAULT 0,
  winner_color       TEXT CHECK (winner_color IN ('BLACK','WHITE','DRAW'))
);
INSERT INTO games_new (id, room_id, black_player_id, white_player_id, black_player_name, white_player_name, winner, reason,
  board_size, rule_wall, rule_portal, moves, walls, portals, started_at, ended_at, ranked, winner_color)
SELECT id, room_id, black_player_id, white_player_id, black_player_name, white_player_name, winner, reason,
  board_size, rule_wall, rule_portal, moves, walls, portals, started_at, ended_at, ranked, winner_color FROM games;
DROP TABLE games;
ALTER TABLE games_new RENAME TO games;
CREATE INDEX idx_games_ended_at ON games(ended_at DESC);
CREATE INDEX idx_games_black_player_id ON games(black_player_id);
CREATE INDEX idx_games_white_player_id ON games(white_player_id);
