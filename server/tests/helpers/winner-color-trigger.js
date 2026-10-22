'use strict';

// Tests that INSERT into games with only `winner` (B257): derive winner_color like migration 004's backfill.
function installWinnerColorTrigger(db) {
  db.exec(`CREATE TRIGGER IF NOT EXISTS t_winner_color AFTER INSERT ON games WHEN NEW.winner IS NOT NULL BEGIN
    UPDATE games SET winner_color = CASE
      WHEN NEW.winner = 'BLACK' THEN 'BLACK' WHEN NEW.winner = 'WHITE' THEN 'WHITE' WHEN NEW.winner = 'draw' THEN 'DRAW'
      WHEN NEW.winner = NEW.black_player_id THEN 'BLACK' WHEN NEW.winner = NEW.white_player_id THEN 'WHITE' END
    WHERE id = NEW.id; END`);
}
module.exports = { installWinnerColorTrigger };
