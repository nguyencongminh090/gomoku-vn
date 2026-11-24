-- B450: club calendar reminders + RSVP.
-- reminded_at = when the 30-min reminder sweep claimed the event (NULL = not yet). The sweep derives its work
-- from starts_at, so a restart/deploy loses nothing (no in-memory timers).
ALTER TABLE club_events ADD COLUMN reminded_at TEXT;
CREATE INDEX idx_club_events_due ON club_events(starts_at) WHERE reminded_at IS NULL;

-- "Tham gia" RSVPs: only these members get the reminder. Event delete / user delete cascade.
CREATE TABLE club_event_rsvps (
  event_id    TEXT NOT NULL REFERENCES club_events(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (event_id, user_id)
) WITHOUT ROWID;
CREATE INDEX idx_club_event_rsvps_user ON club_event_rsvps(user_id);
