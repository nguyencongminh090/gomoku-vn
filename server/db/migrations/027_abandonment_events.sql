-- #495 (features/presence-status Q5 A): a member's rated abandonments ('abandon': absence budget ran out) and
-- aborts ('abort': left before both players acted), for the repeat-leaver limit (>= 3 in 24 h).
-- Kept 7 days by an hourly prune. Never written for outage voids, both-players-gone or a server restart.
CREATE TABLE abandonment_events (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  kind    TEXT NOT NULL CHECK (kind IN ('abandon', 'abort')),
  at      INTEGER NOT NULL
);
CREATE INDEX idx_abandonment_events_user_at ON abandonment_events(user_id, at);
CREATE INDEX idx_abandonment_events_at ON abandonment_events(at);
