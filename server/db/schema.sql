-- =============================================================================
-- GomokuVN SQLite Schema
-- Tables: users, games, player_games
-- =============================================================================

-- Users — persistent accounts
--
-- oauth_provider/oauth_id (TODO.md #91): an OAuth-created account still gets
-- a real password_hash (a random, never-shared bcrypt hash) so the NOT NULL
-- constraint doesn't need loosening — it authenticates via Google only, the
-- hash is simply unreachable through POST /login. username is likewise
-- still generated (see generateOAuthUsername in routes/auth.js) so every
-- row keeps the same UNIQUE NOT NULL shape regardless of how it was created.
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,       -- UUID v4
  username     TEXT UNIQUE NOT NULL,   -- login handle (3-20 chars)
  password_hash TEXT NOT NULL,         -- bcrypt hash (cost 12)
  display_name TEXT NOT NULL,          -- shown in-game
  created_at   TEXT NOT NULL,          -- ISO 8601 timestamp
  last_login_at TEXT,                  -- ISO 8601 timestamp, null until first login
  oauth_provider TEXT,                 -- 'google', null for password accounts
  oauth_id       TEXT                  -- provider's stable subject id, null for password accounts
);

-- Lookup by (provider, id) is how the OAuth callback finds a returning user.
CREATE INDEX IF NOT EXISTS idx_users_oauth ON users(oauth_provider, oauth_id);

-- Sessions — server-side session store (TODO.md #68, features/jwt-httponly-cookie/)
--
-- The browser holds ONLY `sessions.id` (a 256-bit opaque random string) in an
-- HttpOnly cookie. Identity comes from this row, never from a credential the
-- client carries — which is what makes revocation possible at all. A signed
-- JWT cannot be invalidated before it expires; a row can.
--
-- DELIBERATELY no `REFERENCES users(id)` on user_id: guests get id
-- `guest_<uuid8>` and are NEVER written to `users` (see routes/auth.js POST
-- /guest), so a foreign key would kill every guest session the moment
-- `PRAGMA foreign_keys = ON` (database.js) took effect. Same shape already
-- used twice in this schema: games.black_player_id ("null for guests") and
-- tournament_players (entry_id is the PK, player_id nullable).
--
-- Because there is no FK, user_id is populated for guests too (their
-- `guest_xxxx` id) rather than left null — the rest of the app keys players
-- by a non-null userId everywhere. `is_guest`, not nullness, marks a guest.
-- The column stays nullable only so a future non-player session type has
-- somewhere to go.
CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,       -- opaque 256-bit random, base64url — SECRET, cookie-only
  user_id       TEXT,                   -- null for guests (see note above — no FK on purpose)
  display_name  TEXT NOT NULL,
  is_guest      INTEGER NOT NULL DEFAULT 0,  -- 0 or 1
  created_at    TEXT NOT NULL,          -- ISO 8601 timestamp
  last_seen_at  TEXT NOT NULL,          -- ISO 8601 timestamp, refreshed on socket handshake
  expires_at    TEXT NOT NULL,          -- ISO 8601 timestamp — 7d (user) / 24h (guest)
  revoked_at    TEXT                    -- ISO 8601 timestamp; non-null = revoked (logout, kicked)
);

-- Lookup by user is how "revoke every session for this account" works
-- (session:kicked, and a future "log out everywhere"); expires_at drives the
-- periodic sweep of dead rows.
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

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
  organizer_name TEXT,                    -- display name, kept even for guest organizers (TODO.md #77)
  rule_set      TEXT NOT NULL,           -- JSON — shared RuleSet schema (all formats)
  status        TEXT NOT NULL,           -- 'draft' | 'active' | 'completed' | 'cancelled'
  created_at    TEXT NOT NULL,           -- ISO 8601 timestamp
  started_at    TEXT,                    -- ISO 8601 timestamp, null until startTournament()
  completed_at  TEXT,                    -- ISO 8601 timestamp, null until final round ends
  cancelled_at  TEXT,                    -- ISO 8601 timestamp, null unless cancelTournament() (TODO.md #59)
  cancel_reason TEXT                     -- optional freeform organizer note, null unless cancelled
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
  state             TEXT NOT NULL,       -- Paired|Negotiating|Reported|Ready|InProgress|Completed|Walkover|DoubleNoShow|OrganizerAdjusted|Cancelled
  agreed_time       TEXT,                -- ISO 8601 timestamp, set once both sides agree
  deadline          TEXT NOT NULL,       -- ISO 8601 timestamp — per-match deadline (decision 2)
  paired_at         TEXT NOT NULL,       -- ISO 8601 timestamp
  result            TEXT,                -- JSON — {winnerEntryId, reason: 'normal'|'draw'|'walkover'|'void_replay'|'organizer_adjusted'|'draw_replay'|'series_decided'} — the pairing's OVERALL (series) outcome
  games             TEXT,                -- JSON array — [{index, winnerEntryId|null (draw), endedAt}], one entry per game played in the pairing's series (TODO.md #50); single-game pairings (ruleSet.seriesMode='single') always have exactly one entry once Completed
  moves             TEXT,                -- JSON array, same shape as games.moves once InProgress — the CURRENT/last game's move history only (not per-series)
  started_at        TEXT,
  ended_at          TEXT
);

-- Tournament games — one row per INDIVIDUAL game played within a pairing
-- (TODO.md #78). tournament_pairings.moves only ever holds the CURRENT/last
-- game's move history (overwritten every game in a series) — this table is
-- the full, per-game, never-overwritten history, mirroring `games` above but
-- keyed to a tournament/pairing and using tournament entries (not raw user
-- ids) for player identity, since entry ids are already client-visible
-- (serializePairing) and don't need the guest-id stripping `games` does.
CREATE TABLE IF NOT EXISTS tournament_games (
  id                 TEXT PRIMARY KEY,
  tournament_id      TEXT NOT NULL REFERENCES tournaments(id),
  pairing_id         TEXT NOT NULL REFERENCES tournament_pairings(id),
  game_index         INTEGER NOT NULL,        -- 0-based, matches pairing.games[].index
  black_entry_id     TEXT REFERENCES tournament_players(entry_id),
  white_entry_id     TEXT REFERENCES tournament_players(entry_id),
  black_player_name  TEXT NOT NULL,
  white_player_name  TEXT NOT NULL,
  winner             TEXT,             -- 'BLACK' | 'WHITE' | 'draw' | null
  reason             TEXT,
  board_size         INTEGER NOT NULL,
  rule_wall          INTEGER NOT NULL DEFAULT 0,
  rule_portal        INTEGER NOT NULL DEFAULT 0,
  moves              TEXT,            -- JSON array of {x, y, color, timestamp}
  walls              TEXT,            -- JSON array of {x, y}
  portals            TEXT,            -- JSON array of {a:{x,y}, b:{x,y}}
  started_at         TEXT NOT NULL,
  ended_at           TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tournament_players_tournament_id ON tournament_players(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_players_player_id ON tournament_players(player_id);
CREATE INDEX IF NOT EXISTS idx_tournament_rounds_tournament_id ON tournament_rounds(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_pairings_round_id ON tournament_pairings(round_id);
CREATE INDEX IF NOT EXISTS idx_tournament_pairings_tournament_id ON tournament_pairings(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_pairings_state ON tournament_pairings(state);
CREATE INDEX IF NOT EXISTS idx_tournament_games_tournament_id ON tournament_games(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_games_pairing_id ON tournament_games(pairing_id);
