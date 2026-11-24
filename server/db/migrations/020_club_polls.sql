-- rebuild
-- B449: club chat polls (/binhchon). club_messages.kind gains 'poll' (CHECK came from ALTER ADD COLUMN in 019,
-- so the table is rebuilt). Ids are copied and sqlite_sequence carried over so ids are never reused (clients keep
-- a last-seen message id per club for the unread dot).
CREATE TABLE club_messages_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  club_id     TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  sender_id   TEXT NOT NULL REFERENCES users(id),
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'pin', 'challenge', 'poll')),
  meta        TEXT
);
INSERT INTO club_messages_new (id, club_id, sender_id, body, created_at, kind, meta)
  SELECT id, club_id, sender_id, body, created_at, kind, meta FROM club_messages;
CREATE TEMP TABLE _club_msg_seq AS SELECT seq FROM sqlite_sequence WHERE name = 'club_messages';
DROP TABLE club_messages;
ALTER TABLE club_messages_new RENAME TO club_messages;
DELETE FROM sqlite_sequence WHERE name = 'club_messages';
INSERT INTO sqlite_sequence (name, seq)
  SELECT 'club_messages', MAX(COALESCE((SELECT seq FROM _club_msg_seq), 0), COALESCE((SELECT MAX(id) FROM club_messages), 0));
DROP TABLE _club_msg_seq;
CREATE INDEX IF NOT EXISTS idx_club_messages_club ON club_messages(club_id, id);

-- One row per poll message. options = JSON array of DmText-cleaned strings (2-6). Closed when closed_at is set
-- or now >= closes_at (lazy, no timer). Deleting the message (staff delete, CHAT_KEEP trim, club delete) cascades.
CREATE TABLE club_polls (
  message_id  INTEGER PRIMARY KEY REFERENCES club_messages(id) ON DELETE CASCADE,
  creator_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  options     TEXT NOT NULL CHECK (json_valid(options) AND json_type(options) = 'array'),
  closes_at   TEXT NOT NULL,
  closed_at   TEXT
);
CREATE INDEX idx_club_polls_creator ON club_polls(creator_id, closed_at);

-- One vote per member per poll; option = 0-based index into club_polls.options.
CREATE TABLE club_poll_votes (
  message_id  INTEGER NOT NULL REFERENCES club_polls(message_id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option      INTEGER NOT NULL CHECK (option >= 0 AND option < 6),
  voted_at    TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id)
) WITHOUT ROWID;
