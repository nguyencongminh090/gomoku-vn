-- #337: audit trail of puzzle title changes (author/reviewer rename keeps status, so reviewers need to see them).
CREATE TABLE IF NOT EXISTS puzzle_renames (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  puzzle_id  TEXT NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id),
  old_title  TEXT NOT NULL,
  new_title  TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_puzzle_renames_puzzle ON puzzle_renames(puzzle_id, id);
CREATE INDEX IF NOT EXISTS idx_puzzle_renames_created ON puzzle_renames(created_at);
