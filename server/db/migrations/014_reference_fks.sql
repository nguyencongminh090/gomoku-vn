-- rebuild
-- B346: FKs for reference columns that always hold a member id. Decided per column:
--   notifications.actor_id  -> users ON DELETE SET NULL (every push() actor is a member; nullable already; orphans healed to NULL)
--   elo_swaps.winner_id/loser_id -> users, and CHECK that they are the swap's two users (user_lo/user_hi)
--   rating_history.opponent_id -> users (a rated game needs two members, RatingService.isRatedSetup)
--   rating_history.game_id  intentionally unconstrained: a series is rated with its last game id even when that game's
--                           row failed to save, and an FK error would abort the whole rating batch.
--   admin_edges.*, game_reports.*, news.author_id: unchanged, no FK on purpose (schema.sql #206/#208/#224: logs outlive users).
-- sqlite_sequence is carried over so AUTOINCREMENT ids are never reused.
UPDATE notifications SET actor_id = NULL WHERE actor_id IS NOT NULL AND actor_id NOT IN (SELECT id FROM users);

CREATE TABLE notifications_new (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES users(id),
  type       TEXT NOT NULL,          -- NotificationService.TYPES
  actor_id   TEXT REFERENCES users(id) ON DELETE SET NULL,  -- who caused it (dedupe / cancel key)
  payload    TEXT NOT NULL DEFAULT '{}',
  read_at    TEXT,
  created_at TEXT NOT NULL
);
INSERT INTO notifications_new (id, user_id, type, actor_id, payload, read_at, created_at)
SELECT id, user_id, type, actor_id, payload, read_at, created_at FROM notifications;
DELETE FROM sqlite_sequence WHERE name = 'notifications_new';
INSERT INTO sqlite_sequence (name, seq) SELECT 'notifications_new', MAX(COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'notifications'), 0),
  COALESCE((SELECT MAX(id) FROM notifications_new), 0));
DROP TABLE notifications;
ALTER TABLE notifications_new RENAME TO notifications;
CREATE INDEX idx_notifications_user ON notifications(user_id, id);

CREATE TABLE elo_swaps_new (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  category      TEXT NOT NULL,
  user_lo       TEXT NOT NULL REFERENCES users(id),
  user_hi       TEXT NOT NULL REFERENCES users(id),
  winner_id     TEXT NOT NULL REFERENCES users(id),
  loser_id      TEXT NOT NULL REFERENCES users(id),
  winner_before REAL NOT NULL,
  winner_after  REAL NOT NULL,
  loser_before  REAL NOT NULL,
  loser_after   REAL NOT NULL,
  game_ids      TEXT NOT NULL,                   -- JSON array of the series' games
  created_at    TEXT NOT NULL,
  CHECK (winner_id IN (user_lo, user_hi) AND loser_id IN (user_lo, user_hi) AND winner_id <> loser_id)
);
INSERT INTO elo_swaps_new (id, category, user_lo, user_hi, winner_id, loser_id, winner_before, winner_after, loser_before, loser_after,
  game_ids, created_at)
SELECT id, category, user_lo, user_hi, winner_id, loser_id, winner_before, winner_after, loser_before, loser_after,
  game_ids, created_at FROM elo_swaps;
DELETE FROM sqlite_sequence WHERE name = 'elo_swaps_new';
INSERT INTO sqlite_sequence (name, seq) SELECT 'elo_swaps_new', MAX(COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'elo_swaps'), 0),
  COALESCE((SELECT MAX(id) FROM elo_swaps_new), 0));
DROP TABLE elo_swaps;
ALTER TABLE elo_swaps_new RENAME TO elo_swaps;
CREATE INDEX idx_elo_swaps_pair ON elo_swaps(user_lo, user_hi, created_at DESC);

CREATE TABLE rating_history_new (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       TEXT NOT NULL REFERENCES users(id),
  category      TEXT NOT NULL,
  game_id       TEXT NOT NULL,                   -- no FK on purpose (see header)
  opponent_id   TEXT NOT NULL REFERENCES users(id),
  score         REAL NOT NULL,                   -- 1 win | 0.5 draw | 0 loss
  rating_before REAL NOT NULL,
  rating_after  REAL NOT NULL,
  rd_before     REAL NOT NULL,
  rd_after      REAL NOT NULL,
  created_at    TEXT NOT NULL
);
INSERT INTO rating_history_new (id, user_id, category, game_id, opponent_id, score, rating_before, rating_after, rd_before, rd_after,
  created_at)
SELECT id, user_id, category, game_id, opponent_id, score, rating_before, rating_after, rd_before, rd_after,
  created_at FROM rating_history;
DELETE FROM sqlite_sequence WHERE name = 'rating_history_new';
INSERT INTO sqlite_sequence (name, seq) SELECT 'rating_history_new', MAX(COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'rating_history'), 0),
  COALESCE((SELECT MAX(id) FROM rating_history_new), 0));
DROP TABLE rating_history;
ALTER TABLE rating_history_new RENAME TO rating_history;
CREATE INDEX idx_rating_history_user ON rating_history(user_id, category, id DESC);
