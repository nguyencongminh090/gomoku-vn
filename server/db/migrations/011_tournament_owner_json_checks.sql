-- rebuild
-- B345: tournament_games owns per-game data (moves/walls/portals/winner, one row per game, #78). tournament_pairings owns
-- the series state only: result (overall outcome) and games (per-game summary the lifecycle reloads). The write-only
-- tournament_pairings.moves copy (last game only, never read) is dropped. json_valid CHECKs on every JSON column.
-- B347: CHECKs on tournaments.status/format (config.TOURNAMENT_FORMATS), pairing state (PairingLifecycle), withdrawn 0/1.
-- tournament_games.winner gets no CHECK: saveTournamentGame can fall back to a raw id.
CREATE TABLE tournaments_new (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  format         TEXT NOT NULL CHECK (format IN ('swiss', 'round_robin', 'double_elim')),
  organizer_id   TEXT REFERENCES users(id),             -- null for a guest organizer
  organizer_name TEXT,
  rule_set       TEXT NOT NULL CHECK (json_valid(rule_set)),
  status         TEXT NOT NULL CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
  created_at     TEXT NOT NULL,
  started_at     TEXT,
  completed_at   TEXT,
  cancelled_at   TEXT,
  cancel_reason  TEXT,
  club_id        TEXT REFERENCES clubs(id) ON DELETE SET NULL
);
INSERT INTO tournaments_new (id, name, format, organizer_id, organizer_name, rule_set, status, created_at, started_at, completed_at,
  cancelled_at, cancel_reason, club_id)
SELECT id, name, format, organizer_id, organizer_name, rule_set, status, created_at, started_at, completed_at,
  cancelled_at, cancel_reason, club_id FROM tournaments;
DROP TABLE tournaments;
ALTER TABLE tournaments_new RENAME TO tournaments;

CREATE TABLE tournament_players_new (
  entry_id      TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  player_id     TEXT REFERENCES users(id),               -- null for guests
  guest_id      TEXT,
  display_name  TEXT NOT NULL,
  seed          INTEGER,
  final_rank    INTEGER,
  withdrawn     INTEGER NOT NULL DEFAULT 0 CHECK (withdrawn IN (0, 1)),
  registered_at TEXT NOT NULL
);
INSERT INTO tournament_players_new (entry_id, tournament_id, player_id, guest_id, display_name, seed, final_rank, withdrawn, registered_at)
SELECT entry_id, tournament_id, player_id, guest_id, display_name, seed, final_rank, withdrawn, registered_at FROM tournament_players;
DROP TABLE tournament_players;
ALTER TABLE tournament_players_new RENAME TO tournament_players;
CREATE INDEX idx_tournament_players_tournament_id ON tournament_players(tournament_id);
CREATE INDEX idx_tournament_players_player_id ON tournament_players(player_id);

CREATE TABLE tournament_pairings_new (
  id               TEXT PRIMARY KEY,
  round_id         TEXT NOT NULL REFERENCES tournament_rounds(id),
  tournament_id    TEXT NOT NULL REFERENCES tournaments(id),
  player1_entry_id TEXT REFERENCES tournament_players(entry_id),
  player2_entry_id TEXT REFERENCES tournament_players(entry_id),  -- null = bye
  state            TEXT NOT NULL CHECK (state IN ('Paired', 'Negotiating', 'Reported', 'Ready', 'InProgress', 'Completed',
                     'Walkover', 'DoubleNoShow', 'OrganizerAdjusted', 'Cancelled')),
  agreed_time      TEXT,
  deadline         TEXT NOT NULL,
  paired_at        TEXT NOT NULL,
  result           TEXT CHECK (result IS NULL OR json_valid(result)),  -- series outcome {winnerEntryId, reason}
  games            TEXT CHECK (games  IS NULL OR json_valid(games)),   -- series summary [{index, winnerEntryId, endedAt}]; replays live in tournament_games
  started_at       TEXT,
  ended_at         TEXT,
  noshow_count     INTEGER NOT NULL DEFAULT 0
);
INSERT INTO tournament_pairings_new (id, round_id, tournament_id, player1_entry_id, player2_entry_id, state, agreed_time, deadline,
  paired_at, result, games, started_at, ended_at, noshow_count)
SELECT id, round_id, tournament_id, player1_entry_id, player2_entry_id, state, agreed_time, deadline,
  paired_at, result, games, started_at, ended_at, noshow_count FROM tournament_pairings;
DROP TABLE tournament_pairings;
ALTER TABLE tournament_pairings_new RENAME TO tournament_pairings;
CREATE INDEX idx_tournament_pairings_round_id ON tournament_pairings(round_id);
CREATE INDEX idx_tournament_pairings_tournament_id ON tournament_pairings(tournament_id);
CREATE INDEX idx_tournament_pairings_state ON tournament_pairings(state);

CREATE TABLE tournament_games_new (
  id                TEXT PRIMARY KEY,
  tournament_id     TEXT NOT NULL REFERENCES tournaments(id),
  pairing_id        TEXT NOT NULL REFERENCES tournament_pairings(id),
  game_index        INTEGER NOT NULL,        -- 0-based, matches pairing.games[].index
  black_entry_id    TEXT REFERENCES tournament_players(entry_id),
  white_entry_id    TEXT REFERENCES tournament_players(entry_id),
  black_player_name TEXT NOT NULL,
  white_player_name TEXT NOT NULL,
  winner            TEXT,                    -- 'BLACK' | 'WHITE' | 'draw' | null
  reason            TEXT,
  board_size        INTEGER NOT NULL,
  rule_wall         INTEGER NOT NULL DEFAULT 0,
  rule_portal       INTEGER NOT NULL DEFAULT 0,
  moves             TEXT CHECK (moves   IS NULL OR json_valid(moves)),
  walls             TEXT CHECK (walls   IS NULL OR json_valid(walls)),
  portals           TEXT CHECK (portals IS NULL OR json_valid(portals)),
  started_at        TEXT NOT NULL,
  ended_at          TEXT
);
INSERT INTO tournament_games_new (id, tournament_id, pairing_id, game_index, black_entry_id, white_entry_id, black_player_name,
  white_player_name, winner, reason, board_size, rule_wall, rule_portal, moves, walls, portals, started_at, ended_at)
SELECT id, tournament_id, pairing_id, game_index, black_entry_id, white_entry_id, black_player_name,
  white_player_name, winner, reason, board_size, rule_wall, rule_portal, moves, walls, portals, started_at, ended_at FROM tournament_games;
DROP TABLE tournament_games;
ALTER TABLE tournament_games_new RENAME TO tournament_games;
CREATE INDEX idx_tournament_games_tournament_id ON tournament_games(tournament_id);
CREATE INDEX idx_tournament_games_pairing_id ON tournament_games(pairing_id);
