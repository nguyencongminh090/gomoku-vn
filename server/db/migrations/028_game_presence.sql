-- #496 (features/presence-status §4, Q6 A): per-player presence summary of a RATED game, weak evidence for staff
-- review only (perm rating.integrity). One row per player per game, written once at game end, kept 90 days
-- (hourly prune). No raw event stream. Never changes a result or rating by itself.
CREATE TABLE game_presence (
  game_id          TEXT NOT NULL,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  disconnects      INTEGER NOT NULL CHECK (disconnects >= 0),
  disconnect_ms    INTEGER NOT NULL CHECK (disconnect_ms >= 0),
  away_count       INTEGER NOT NULL CHECK (away_count >= 0),
  away_ms          INTEGER NOT NULL CHECK (away_ms >= 0),
  away_ms_own_turn INTEGER NOT NULL CHECK (away_ms_own_turn >= 0),
  longest_away_ms  INTEGER NOT NULL CHECK (longest_away_ms >= 0),
  game_ms          INTEGER NOT NULL CHECK (game_ms >= 0),
  created_at       INTEGER NOT NULL,
  PRIMARY KEY (game_id, user_id)
);
CREATE INDEX idx_game_presence_user ON game_presence(user_id, created_at);
CREATE INDEX idx_game_presence_created ON game_presence(created_at);
