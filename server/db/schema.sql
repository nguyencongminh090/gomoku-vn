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
-- NOT created here — a fresh DB gets oauth_provider/oauth_id from the CREATE
-- TABLE above, but this same schema.sql also runs unconditionally against an
-- EXISTING pre-#91 DB (whose users table lacks those columns) every startup,
-- and CREATE INDEX IF NOT EXISTS is not itself conditional on the columns
-- existing — it would throw before database.js's ALTER TABLE migration
-- (which runs after this file's exec()) ever got a chance to add them.
-- database.js creates this index (as UNIQUE, since TODO.md #94 — closes a
-- TOCTOU race in /google/callback that could otherwise insert two rows for
-- the same (oauth_provider, oauth_id)) unconditionally, AFTER that
-- migration, which is what actually makes this safe for both a fresh DB and
-- an existing one. Do not re-add it here.

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
  ended_at           TEXT,
  ranked             INTEGER NOT NULL DEFAULT 0    -- 1 = queued for rating (TODO.md #175)
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
  cancel_reason TEXT,                    -- optional freeform organizer note, null unless cancelled
  club_id       TEXT REFERENCES clubs(id) ON DELETE SET NULL -- club-hosted tournament (TODO.md #200 slice 4), else null
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

-- =============================================================================
-- Ratings (features/platform, TODO.md #175)
--
-- Glicko-2, one pool per `category` = winning rule ('freestyle' | 'standard' |
-- 'caro'); wall/portal/swap2 games rate in their winning rule's pool and there
-- is no speed split (planning.md Q3/Q4). Members only — guests never get a row.
-- rating_history.game_id has no FK on purpose: rating writes run on an async
-- queue after saveGame, and a failed game insert must not roll back a batch.
-- =============================================================================

CREATE TABLE IF NOT EXISTS ratings (
  user_id     TEXT NOT NULL REFERENCES users(id),
  category    TEXT NOT NULL,
  rating      REAL NOT NULL,
  rd          REAL NOT NULL,
  volatility  REAL NOT NULL,
  games       INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, category)
);

CREATE TABLE IF NOT EXISTS rating_history (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        TEXT NOT NULL REFERENCES users(id),
  category       TEXT NOT NULL,
  game_id        TEXT NOT NULL,
  opponent_id    TEXT NOT NULL,
  score          REAL NOT NULL,        -- 1 win | 0.5 draw | 0 loss
  rating_before  REAL NOT NULL,
  rating_after   REAL NOT NULL,
  rd_before      REAL NOT NULL,
  rd_after       REAL NOT NULL,
  created_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ratings_category_rating ON ratings(category, rating DESC);
CREATE INDEX IF NOT EXISTS idx_rating_history_user ON rating_history(user_id, category, id DESC);

-- Clubs (TODO.md #178). slug = URL form of the name (UNIQUE, so also enforces
-- unique names). role: owner | officer | member | pending (join request on an
-- 'invite' club). Exactly one 'owner' row per club (ClubService enforces it).
CREATE TABLE IF NOT EXISTS clubs (
  id           TEXT PRIMARY KEY,                 -- UUID v4
  slug         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  join_policy  TEXT NOT NULL DEFAULT 'open',     -- 'open' | 'invite'
  owner_id     TEXT NOT NULL REFERENCES users(id),
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS club_members (
  club_id    TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id),
  role       TEXT NOT NULL,
  joined_at  TEXT NOT NULL,
  PRIMARY KEY (club_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_club_members_user ON club_members(user_id);

-- Club events, shown as "Sắp tới" on the club page (TODO.md #200 slice 2).
-- starts_at = ISO UTC; kind is 'event' for now (reserved for later kinds).
CREATE TABLE IF NOT EXISTS club_events (
  id          TEXT PRIMARY KEY,                  -- UUID v4
  club_id     TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  starts_at   TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'event',
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_club_events_club ON club_events(club_id, starts_at);

-- Club chat (TODO.md #200 slice 3). body = DmText.clean wire form (angle brackets
-- escaped, profanity masked); decode at render. ClubService keeps the newest 200 per club.
-- Leaving a club keeps one's old messages (sender_id has no cascade).
CREATE TABLE IF NOT EXISTS club_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  club_id     TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  sender_id   TEXT NOT NULL REFERENCES users(id),
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_club_messages_club ON club_messages(club_id, id);

-- Friends (TODO.md #198). One row per pair, canonical order user_a < user_b.
-- status 'pending' = requested_by asked the other; 'accepted' = mutual friends.
CREATE TABLE IF NOT EXISTS friendships (
  user_a        TEXT NOT NULL REFERENCES users(id),
  user_b        TEXT NOT NULL REFERENCES users(id),
  requested_by  TEXT NOT NULL REFERENCES users(id),
  status        TEXT NOT NULL DEFAULT 'pending',   -- 'pending' | 'accepted'
  created_at    TEXT NOT NULL,
  PRIMARY KEY (user_a, user_b),
  CHECK (user_a < user_b)
);

CREATE INDEX IF NOT EXISTS idx_friendships_b ON friendships(user_b);

-- Notifications (TODO.md #198 slice 2). payload = small JSON ({from:{username,displayName}, ...}).
CREATE TABLE IF NOT EXISTS notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id),
  type        TEXT NOT NULL,          -- friend_request | friend_accepted | challenge | challenge_accepted | dm
  actor_id    TEXT,                   -- who caused it (dedupe / cancel key)
  payload     TEXT NOT NULL DEFAULT '{}',
  read_at     TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, id);

-- Direct messages (TODO.md #198 slice 4): member ↔ member, text stored in wire form
-- (angle brackets escaped, profanity masked). conv_key = the two user ids sorted, joined by '|'.
-- read_at is the recipient's read stamp. Newest DM_KEEP per conversation are kept.
CREATE TABLE IF NOT EXISTS direct_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  conv_key    TEXT NOT NULL,
  sender_id   TEXT NOT NULL REFERENCES users(id),
  recipient_id TEXT NOT NULL REFERENCES users(id),
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  read_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_dm_conv ON direct_messages(conv_key, id);
CREATE INDEX IF NOT EXISTS idx_dm_unread ON direct_messages(recipient_id, read_at);

-- Puzzles (TODO.md #203, features/learn). Members submit, admins review. stones = JSON
-- [{x,y,color:'BLACK'|'WHITE'}] (y top-down); answers = JSON [[{x,y},...],...] — the SOLVER's
-- moves only; any one matching answer solves it. mode 'final_move' = one decisive move.
CREATE TABLE IF NOT EXISTS puzzles (
  id            TEXT PRIMARY KEY,                  -- UUID v4
  author_id     TEXT NOT NULL REFERENCES users(id),
  title         TEXT NOT NULL,
  prompt        TEXT NOT NULL DEFAULT '',
  rule          TEXT NOT NULL,                     -- 'freestyle' | 'standard' | 'caro'
  board_size    INTEGER NOT NULL,
  stones        TEXT NOT NULL,
  to_move       TEXT NOT NULL,                     -- 'BLACK' | 'WHITE'
  mode          TEXT NOT NULL,                     -- 'sequence' | 'final_move'
  answers       TEXT NOT NULL,
  level         TEXT NOT NULL,                     -- author's proposal until a reviewer sets it
  status        TEXT NOT NULL DEFAULT 'pending',   -- 'pending' | 'approved' | 'rejected'
  position_hash TEXT NOT NULL,                     -- rule+size+to_move+stones, for duplicate flags
  review_note   TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  reviewed_at   TEXT,
  reviewed_by   TEXT REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_puzzles_status ON puzzles(status, created_at);
CREATE INDEX IF NOT EXISTS idx_puzzles_author ON puzzles(author_id);
CREATE INDEX IF NOT EXISTS idx_puzzles_hash ON puzzles(position_hash);

CREATE TABLE IF NOT EXISTS puzzle_tags (
  puzzle_id  TEXT NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  tag        TEXT NOT NULL,
  PRIMARY KEY (puzzle_id, tag)
);

CREATE TABLE IF NOT EXISTS puzzle_progress (
  user_id    TEXT NOT NULL REFERENCES users(id),
  puzzle_id  TEXT NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  attempts   INTEGER NOT NULL DEFAULT 0,
  solved_at  TEXT,                                 -- null until first correct answer
  PRIMARY KEY (user_id, puzzle_id)
);

-- Forum (TODO.md #203 7c, features/learn). Plain text only (rendered with textContent). Staff = users.role (moderator|admin).
-- Deleting is soft (deleted = 1): the row stays so reports/ids keep resolving; readers never get the body.
CREATE TABLE IF NOT EXISTS forum_threads (
  id            TEXT PRIMARY KEY,                  -- UUID v4
  category      TEXT NOT NULL,                     -- fixed list in ForumService.CATEGORIES
  author_id     TEXT NOT NULL REFERENCES users(id),
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  last_post_at  TEXT NOT NULL,                     -- bumped by each reply (list order)
  reply_count   INTEGER NOT NULL DEFAULT 0,        -- live (non-deleted) replies
  deleted       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_forum_threads_cat ON forum_threads(category, deleted, last_post_at);

CREATE TABLE IF NOT EXISTS forum_posts (
  id          TEXT PRIMARY KEY,
  thread_id   TEXT NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
  author_id   TEXT NOT NULL REFERENCES users(id),
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  deleted     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_forum_posts_thread ON forum_posts(thread_id, created_at);

CREATE TABLE IF NOT EXISTS forum_reports (
  id           TEXT PRIMARY KEY,
  target_type  TEXT NOT NULL,                      -- 'thread' | 'post'
  target_id    TEXT NOT NULL,
  thread_id    TEXT NOT NULL,                      -- where to find it (the thread itself for target_type 'thread')
  reporter_id  TEXT NOT NULL REFERENCES users(id),
  reason       TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  resolved_at  TEXT,
  UNIQUE (reporter_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_forum_reports_open ON forum_reports(resolved_at, created_at);
