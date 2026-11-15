-- B384: the games list / stats filters (player-name LIKE, result, date range) and their COUNTs scanned the wide `games`
-- rows (moves JSON) — 16-19 ms on a 22k-game DB, on the game thread. Widen idx_games_ended_at so those WHEREs are
-- answered from the index: the order (ended_at) is unchanged, and the filter columns ride along.
-- Measured on exports/vncaro-sim.db: stats 16.6 -> 1.9 ms, name COUNT 15.9 -> 3.2 ms, rare-name page 19.4 -> 2.4 ms.
DROP INDEX IF EXISTS idx_games_ended_at;
CREATE INDEX idx_games_ended_at ON games(ended_at, winner_color, black_player_name, white_player_name);
