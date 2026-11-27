-- #501: store each game's winning rule (freestyle/standard/caro/renju) so the replay can show it.
-- Nullable: rows saved before this migration have no rule and stay NULL.
ALTER TABLE games ADD COLUMN winning_rule TEXT;
ALTER TABLE tournament_games ADD COLUMN winning_rule TEXT;
