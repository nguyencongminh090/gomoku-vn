-- =============================================================================
-- GomokuVN SQLite Schema
-- Tables: users, games, player_games
-- =============================================================================

-- Users — persistent accounts
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,       -- UUID v4
  username     TEXT UNIQUE NOT NULL,   -- login handle (3-20 chars)
  password_hash TEXT NOT NULL,         -- bcrypt hash (cost 12)
  display_name TEXT NOT NULL,          -- shown in-game
  created_at   TEXT NOT NULL,          -- ISO 8601 timestamp
  last_login_at TEXT                   -- ISO 8601 timestamp, null until first login
);

-- Games — completed game records (written ONLY on game end)
CREATE TABLE IF NOT EXISTS games (
  id                 TEXT PRIMARY KEY,
  room_id            TEXT NOT NULL,
  black_player_id    TEXT REFERENCES users(id),  -- null for guests
  white_player_id    TEXT REFERENCES users(id),  -- null for guests
  black_player_name  TEXT NOT NULL,
  white_player_name  TEXT NOT NULL,
  winner             TEXT,             -- player_id | 'draw' | null (interrupted)
  reason             TEXT,             -- 'normal' | 'resign' | 'timeout' | 'draw_agreement' | 'board_full'
  board_size         INTEGER NOT NULL,
  rule_wall          INTEGER NOT NULL DEFAULT 0,   -- 0 or 1
  rule_portal        INTEGER NOT NULL DEFAULT 0,   -- 0 or 1
  moves              TEXT,            -- JSON array of {x, y, color, timestamp}
  walls              TEXT,            -- JSON array of {x, y}
  portals            TEXT,            -- JSON array of {a:{x,y}, b:{x,y}}
  started_at         TEXT NOT NULL,
  ended_at           TEXT
);

-- Player → Game join table (enables per-player history lookup)
CREATE TABLE IF NOT EXISTS player_games (
  player_id  TEXT NOT NULL REFERENCES users(id),
  game_id    TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  PRIMARY KEY (player_id, game_id)
);

-- Indexes for fast per-player history and recency queries
CREATE INDEX IF NOT EXISTS idx_player_games_player_id ON player_games(player_id);
CREATE INDEX IF NOT EXISTS idx_games_room_id ON games(room_id);
CREATE INDEX IF NOT EXISTS idx_games_ended_at ON games(ended_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_black_player_id ON games(black_player_id);
CREATE INDEX IF NOT EXISTS idx_games_white_player_id ON games(white_player_id);
