-- B257 follow-up: 004's backfill only matched `winner` to a player id, so legacy rows that resolveWinnerSeat
-- (server/db/games.js) still resolves were left NULL and dropped out of SQL stats/filters. Same order as there:
-- raw name match, then guest-by-elimination (exactly one seat has no player id → that seat won).
UPDATE games SET winner_color = CASE
  WHEN winner = black_player_name THEN 'BLACK'
  WHEN winner = white_player_name THEN 'WHITE'
  WHEN black_player_id IS NULL AND white_player_id IS NOT NULL THEN 'BLACK'
  WHEN white_player_id IS NULL AND black_player_id IS NOT NULL THEN 'WHITE'
  ELSE NULL END
WHERE winner_color IS NULL AND winner IS NOT NULL AND winner NOT IN ('BLACK', 'WHITE', 'draw');
