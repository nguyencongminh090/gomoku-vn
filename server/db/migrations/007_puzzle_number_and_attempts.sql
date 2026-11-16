-- #333: stable sequential puzzle number (never reused; puzzles are never deleted). Backfilled by creation order.
-- #336: one row per solve attempt (moves tried, verdict, time).
ALTER TABLE puzzles ADD COLUMN number INTEGER;
UPDATE puzzles SET number = (
  SELECT COUNT(*) FROM puzzles q WHERE q.created_at < puzzles.created_at OR (q.created_at = puzzles.created_at AND q.id <= puzzles.id));
CREATE UNIQUE INDEX IF NOT EXISTS idx_puzzles_number ON puzzles(number);

CREATE TABLE IF NOT EXISTS puzzle_attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES users(id),
  puzzle_id  TEXT NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  moves      TEXT NOT NULL,                        -- JSON [{x,y},...] the solver tried
  correct    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_puzzle_attempts_user ON puzzle_attempts(puzzle_id, user_id, created_at);
