CREATE TABLE IF NOT EXISTS club_sanctions (
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('mute','ban')),
  until_at TEXT,
  CHECK ((kind = 'ban') = (until_at IS NULL)),
  PRIMARY KEY(club_id,user_id)
);
