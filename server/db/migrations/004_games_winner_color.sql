-- B257: typed winner column (expand step; `winner` is kept until a later contract step).
-- ADD COLUMN with CHECK is validated against existing rows; the new column is NULL so it passes, then backfilled.
ALTER TABLE games ADD COLUMN winner_color TEXT CHECK (winner_color IN ('BLACK','WHITE','DRAW'));

UPDATE games SET winner_color = CASE
  WHEN winner = 'BLACK' THEN 'BLACK'
  WHEN winner = 'WHITE' THEN 'WHITE'
  WHEN winner = 'draw'  THEN 'DRAW'
  WHEN winner IS NOT NULL AND winner = black_player_id THEN 'BLACK'
  WHEN winner IS NOT NULL AND winner = white_player_id THEN 'WHITE'
  ELSE NULL END
WHERE winner IS NOT NULL;
