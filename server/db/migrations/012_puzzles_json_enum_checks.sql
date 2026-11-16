-- rebuild
-- B345: json_valid CHECKs on puzzles.stones/answers/layout. B347: CHECKs on status/mode/level (PuzzleService MODES, LEVELS).
CREATE TABLE puzzles_new (
  id            TEXT PRIMARY KEY,
  author_id     TEXT NOT NULL REFERENCES users(id),
  title         TEXT NOT NULL,
  prompt        TEXT NOT NULL DEFAULT '',
  rule          TEXT NOT NULL,                     -- 'freestyle' | 'standard' | 'caro'
  board_size    INTEGER NOT NULL,
  stones        TEXT NOT NULL CHECK (json_valid(stones)),
  layout        TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(layout)),
  to_move       TEXT NOT NULL,                     -- 'BLACK' | 'WHITE'
  mode          TEXT NOT NULL CHECK (mode IN ('sequence', 'final_move')),
  answers       TEXT NOT NULL CHECK (json_valid(answers)),
  level         TEXT NOT NULL CHECK (level IN ('easy', 'medium', 'hard', 'expert')),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  position_hash TEXT NOT NULL,
  review_note   TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  reviewed_at   TEXT,
  reviewed_by   TEXT REFERENCES users(id),
  number        INTEGER
);
INSERT INTO puzzles_new (id, author_id, title, prompt, rule, board_size, stones, layout, to_move, mode, answers, level, status,
  position_hash, review_note, created_at, updated_at, reviewed_at, reviewed_by, number)
SELECT id, author_id, title, prompt, rule, board_size, stones, layout, to_move, mode, answers, level, status,
  position_hash, review_note, created_at, updated_at, reviewed_at, reviewed_by, number FROM puzzles;
DROP TABLE puzzles;
ALTER TABLE puzzles_new RENAME TO puzzles;
CREATE INDEX idx_puzzles_status ON puzzles(status, created_at);
CREATE INDEX idx_puzzles_author ON puzzles(author_id);
CREATE INDEX idx_puzzles_hash ON puzzles(position_hash);
CREATE UNIQUE INDEX idx_puzzles_number ON puzzles(number);
