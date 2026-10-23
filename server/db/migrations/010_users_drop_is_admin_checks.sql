-- rebuild
-- B344: users.role is the only admin source (utils/roles.js); drop the dead is_admin column (#203, superseded by #205).
-- Not healed from is_admin: a demoted admin still has is_admin = 1, so copying it back would re-promote them.
-- B347: CHECKs on role / who_can_* (routes/profile.js AUDIENCES) and the 0/1 hide_* flags.
-- idx_users_oauth is recreated plain; ensureOauthUniqueIndex upgrades it to UNIQUE at boot when there are no duplicates.
CREATE TABLE users_new (
  id                TEXT PRIMARY KEY,       -- UUID v4
  username          TEXT UNIQUE NOT NULL,   -- login handle (3-20 chars)
  password_hash     TEXT NOT NULL,          -- bcrypt hash (cost 12)
  display_name      TEXT NOT NULL,          -- shown in-game
  created_at        TEXT NOT NULL,          -- ISO 8601 timestamp
  last_login_at     TEXT,                   -- ISO 8601 timestamp, null until first login
  oauth_provider    TEXT,                   -- 'google', null for password accounts
  oauth_id          TEXT,                   -- provider's stable subject id, null for password accounts
  bio               TEXT NOT NULL DEFAULT '',
  avatar_v          INTEGER NOT NULL DEFAULT 0,
  hide_history      INTEGER NOT NULL DEFAULT 0 CHECK (hide_history IN (0, 1)),
  hide_bio          INTEGER NOT NULL DEFAULT 0 CHECK (hide_bio IN (0, 1)),
  ui_skin           TEXT NOT NULL DEFAULT 'arena',
  country           TEXT NOT NULL DEFAULT '',
  city              TEXT NOT NULL DEFAULT '',
  who_can_dm        TEXT NOT NULL DEFAULT 'everyone' CHECK (who_can_dm IN ('everyone', 'friends', 'nobody')),
  who_can_challenge TEXT NOT NULL DEFAULT 'everyone' CHECK (who_can_challenge IN ('everyone', 'friends', 'nobody')),
  who_can_friend    TEXT NOT NULL DEFAULT 'everyone' CHECK (who_can_friend IN ('everyone', 'friends', 'nobody')),
  hide_online       INTEGER NOT NULL DEFAULT 0 CHECK (hide_online IN (0, 1)),
  friend_tag        TEXT,
  role              TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'moderator', 'admin')),  -- roles.ROLES; the only admin flag
  locked_at         TEXT
);
INSERT INTO users_new (id, username, password_hash, display_name, created_at, last_login_at, oauth_provider, oauth_id, bio, avatar_v,
  hide_history, hide_bio, ui_skin, country, city, who_can_dm, who_can_challenge, who_can_friend, hide_online, friend_tag, role, locked_at)
SELECT id, username, password_hash, display_name, created_at, last_login_at, oauth_provider, oauth_id, bio, avatar_v,
  hide_history, hide_bio, ui_skin, country, city, who_can_dm, who_can_challenge, who_can_friend, hide_online, friend_tag, role, locked_at FROM users;
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;
CREATE INDEX idx_users_oauth ON users(oauth_provider, oauth_id);
