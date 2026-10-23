-- Puzzle delete: #number must stay unique even after the highest-numbered puzzle is deleted. Seeded from current MAX.
CREATE TABLE IF NOT EXISTS puzzle_number_seq (
  id   INTEGER PRIMARY KEY CHECK (id = 1),
  last INTEGER NOT NULL
);
INSERT OR IGNORE INTO puzzle_number_seq (id, last) SELECT 1, COALESCE(MAX(number), 0) FROM puzzles;
