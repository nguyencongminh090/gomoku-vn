-- =============================================================================
-- GomokuVN SQLite Schema
-- Tables: users, games, player_games
-- =============================================================================

-- Users — persistent accounts
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,       -- UUID v4
  username     TEXT UNIQUE NOT NULL,   -- login handle (3-20 chars)
  password_hash TEXT NOT NULL,         -- bcrypt hash (cost 12)
  display_name TEXT NOT NULL,          -- shown in-game
  created_at   TEXT NOT NULL,          -- ISO 8601 timestamp
  last_login_at TEXT                   -- ISO 8601 timestamp, null until first login
);

-- Games — completed game records (written ONLY on game end)
CREATE TABLE IF NOT EXISTS games (
  id                 TEXT PRIMARY KEY,
  room_id            TEXT NOT NULL,
  black_player_id    TEXT REFERENCES users(id),  -- null for guests
  white_player_id    TEXT REFERENCES users(id),  -- null for guests
  black_player_name  TEXT NOT NULL,
  white_player_name  TEXT NOT NULL,
  winner             TEXT,             -- player_id | 'draw' | null (interrupted)
  reason             TEXT,             -- 'normal' | 'resign' | 'timeout' | 'draw_agreement' | 'board_full'
  board_size         INTEGER NOT NULL,
  rule_wall          INTEGER NOT NULL DEFAULT 0,   -- 0 or 1
  rule_portal        INTEGER NOT NULL DEFAULT 0,   -- 0 or 1
  moves              TEXT,            -- JSON array of {x, y, color, timestamp}
  walls              TEXT,            -- JSON array of {x, y}
  portals            TEXT,            -- JSON array of {a:{x,y}, b:{x,y}}
  started_at         TEXT NOT NULL,
  ended_at           TEXT
);

-- Player → Game join table (enables per-player history lookup)
CREATE TABLE IF NOT EXISTS player_games (
  player_id  TEXT NOT NULL REFERENCES users(id),
  game_id    TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  PRIMARY KEY (player_id, game_id)
);

-- Indexes for fast per-player history and recency queries
CREATE INDEX IF NOT EXISTS idx_player_games_player_id ON player_games(player_id);
CREATE INDEX IF NOT EXISTS idx_games_room_id ON games(room_id);
CREATE INDEX IF NOT EXISTS idx_games_ended_at ON games(ended_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_black_player_id ON games(black_player_id);
CREATE INDEX IF NOT EXISTS idx_games_white_player_id ON games(white_player_id);

-- =============================================================================
-- Tournament tables (features/tournament/, TODO.md #48)
--
-- Unlike rooms (in-memory only, see RoomManager.js header), tournaments and
-- their pairings ARE persisted from creation, not just on completion — round
-- history matters for organizer dispute resolution and post-hoc audit, per
-- docs/instruction/B48-*.md. Live in-progress scheduling chatter (dispute
-- text, etc.) still lives in TournamentManager's in-memory objects; only the
-- state transitions themselves are written here.
-- =============================================================================

-- Tournaments — one row per tournament, any format
CREATE TABLE IF NOT EXISTS tournaments (
  id            TEXT PRIMARY KEY,        -- UUID v4
  name          TEXT NOT NULL,
  format        TEXT NOT NULL,           -- 'swiss' | 'round_robin' | 'double_elim'
  organizer_id  TEXT REFERENCES users(id), -- null for a guest organizer
  rule_set      TEXT NOT NULL,           -- JSON — shared RuleSet schema (all formats)
  status        TEXT NOT NULL,           -- 'draft' | 'active' | 'completed'
  created_at    TEXT NOT NULL,           -- ISO 8601 timestamp
  started_at    TEXT,                    -- ISO 8601 timestamp, null until startTournament()
  completed_at  TEXT                     -- ISO 8601 timestamp, null until final round ends
);

-- Tournament players — one row per registered entry (guest-tolerant, like games.*_player_id)
CREATE TABLE IF NOT EXISTS tournament_players (
  entry_id      TEXT PRIMARY KEY,        -- UUID v4 — the real PK, since player_id may be null (guest)
  tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  player_id     TEXT REFERENCES users(id), -- null for guests
  display_name  TEXT NOT NULL,
  seed          INTEGER,                 -- bracket/pairing seed, set by startTournament()
  final_rank    INTEGER,                 -- set once the tournament completes
  withdrawn     INTEGER NOT NULL DEFAULT 0, -- 0 or 1
  registered_at TEXT NOT NULL            -- ISO 8601 timestamp
);

-- Tournament rounds — one row per round, any format (bracket_side only meaningful for double_elim)
CREATE TABLE IF NOT EXISTS tournament_rounds (
  id            TEXT PRIMARY KEY,        -- UUID v4
  tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  round_index   INTEGER NOT NULL,
  bracket_side  TEXT                     -- 'winners' | 'losers' | 'grand_final' | null (swiss/round_robin)
);

-- Tournament pairings — one row per match, tracks the full lifecycle state machine
-- (see features/tournament/diagram/uml_diagram/state-diagram-match-lifecycle.md)
CREATE TABLE IF NOT EXISTS tournament_pairings (
  id                TEXT PRIMARY KEY,    -- UUID v4 (this is the "pairingId" used server-side)
  round_id          TEXT NOT NULL REFERENCES tournament_rounds(id),
  tournament_id     TEXT NOT NULL REFERENCES tournaments(id),
  player1_entry_id  TEXT REFERENCES tournament_players(entry_id),
  player2_entry_id  TEXT REFERENCES tournament_players(entry_id), -- null = bye
  state             TEXT NOT NULL,       -- Paired|Negotiating|Reported|Ready|InProgress|Completed|Walkover|DoubleNoShow|OrganizerAdjusted
  agreed_time       TEXT,                -- ISO 8601 timestamp, set once both sides agree
  deadline          TEXT NOT NULL,       -- ISO 8601 timestamp — per-match deadline (decision 2)
  paired_at         TEXT NOT NULL,       -- ISO 8601 timestamp
  result            TEXT,                -- JSON — {winnerEntryId, reason: 'normal'|'walkover'|'void_replay'|'organizer_adjusted'}
  moves             TEXT,                -- JSON array, same shape as games.moves once InProgress
  started_at        TEXT,
  ended_at          TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tournament_players_tournament_id ON tournament_players(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_players_player_id ON tournament_players(player_id);
CREATE INDEX IF NOT EXISTS idx_tournament_rounds_tournament_id ON tournament_rounds(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_pairings_round_id ON tournament_pairings(round_id);
CREATE INDEX IF NOT EXISTS idx_tournament_pairings_tournament_id ON tournament_pairings(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_pairings_state ON tournament_pairings(state);
