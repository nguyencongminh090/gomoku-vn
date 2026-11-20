-- rebuild
-- #425: 'renju' joins the rating pools (RatingService.CATEGORIES). SQLite cannot alter a CHECK, so the table is rebuilt (as in 013).
CREATE TABLE ratings_new (
  user_id    TEXT NOT NULL REFERENCES users(id),
  category   TEXT NOT NULL CHECK (category IN ('freestyle', 'standard', 'caro', 'renju')),
  rating     REAL NOT NULL,
  rd         REAL NOT NULL,
  volatility REAL NOT NULL,
  games      INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, category)
);
INSERT INTO ratings_new (user_id, category, rating, rd, volatility, games, updated_at)
SELECT user_id, category, rating, rd, volatility, games, updated_at FROM ratings;
DROP TABLE ratings;
ALTER TABLE ratings_new RENAME TO ratings;
CREATE INDEX idx_ratings_category_rating ON ratings(category, rating DESC);
