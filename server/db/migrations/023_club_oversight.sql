ALTER TABLE clubs ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0,1));
ALTER TABLE clubs ADD COLUMN locked INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1));

-- Keep reported evidence when chat retention trims the source message.
CREATE TABLE club_reports (
  id INTEGER PRIMARY KEY, club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  message_id INTEGER NOT NULL, reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  excerpt TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL, resolved_at TEXT,
  UNIQUE(message_id, reporter_id)
);
CREATE INDEX club_reports_reporter_time ON club_reports(reporter_id,created_at);
CREATE INDEX club_reports_queue ON club_reports(resolved_at,id);

-- Club ids and slugs are snapshots. Deleting a club must preserve the administrative record.
CREATE TABLE club_admin_log (
  id INTEGER PRIMARY KEY, actor_id TEXT REFERENCES users(id) ON DELETE SET NULL, club_id TEXT,
  slug TEXT, action TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX club_admin_history ON club_admin_log(club_id,id);
