-- rebuild
-- B236: club-vs-club team tournament format + persisted team entries and rating-ordered rosters.
DROP TABLE IF EXISTS tournaments_new;
CREATE TABLE tournaments_new (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  format         TEXT NOT NULL CHECK (format IN ('swiss', 'round_robin', 'double_elim', 'team')),
  organizer_id   TEXT REFERENCES users(id),
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
CREATE INDEX IF NOT EXISTS idx_tournaments_club_id ON tournaments(club_id);

CREATE TABLE IF NOT EXISTS tournament_teams (
  id            TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  club_id       TEXT REFERENCES clubs(id) ON DELETE SET NULL,
  club_slug     TEXT NOT NULL,
  club_name     TEXT NOT NULL,
  club_tag      TEXT NOT NULL DEFAULT '',
  club_color    TEXT NOT NULL DEFAULT 'blue',
  captain_id    TEXT NOT NULL REFERENCES users(id),
  captain_name  TEXT NOT NULL,
  team_order    INTEGER NOT NULL CHECK (team_order IN (1, 2)),
  final_rank    INTEGER,
  created_at    TEXT NOT NULL,
  UNIQUE (tournament_id, team_order),
  UNIQUE (tournament_id, club_id)
);
CREATE INDEX IF NOT EXISTS idx_tournament_teams_tournament_id ON tournament_teams(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_teams_club_id ON tournament_teams(club_id);
CREATE INDEX IF NOT EXISTS idx_tournament_teams_captain_id ON tournament_teams(captain_id);

CREATE TABLE IF NOT EXISTS tournament_team_roster (
  entry_id      TEXT PRIMARY KEY REFERENCES tournament_players(entry_id) ON DELETE CASCADE,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  team_id       TEXT NOT NULL REFERENCES tournament_teams(id) ON DELETE CASCADE,
  board_number  INTEGER NOT NULL CHECK (board_number >= 1),
  rating_at_reg INTEGER,
  UNIQUE (team_id, board_number)
);
CREATE INDEX IF NOT EXISTS idx_tournament_team_roster_tournament_id ON tournament_team_roster(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_team_roster_team_id ON tournament_team_roster(team_id);
