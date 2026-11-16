-- rebuild
-- B347: CHECKs on clubs.join_policy (ClubService.POLICIES), ratings.category (RatingService.CATEGORIES),
-- forum_reports.target_type, and the 0/1 flags forum_threads/forum_posts.deleted, sessions.is_guest.
CREATE TABLE clubs_new (
  id           TEXT PRIMARY KEY,
  slug         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  join_policy  TEXT NOT NULL DEFAULT 'open' CHECK (join_policy IN ('open', 'invite')),
  owner_id     TEXT NOT NULL REFERENCES users(id),
  created_at   TEXT NOT NULL,
  color        TEXT NOT NULL DEFAULT 'blue',     -- preset key (ClubService.COLORS)
  tag          TEXT NOT NULL DEFAULT '',
  announcement TEXT NOT NULL DEFAULT '',
  avatar_v     INTEGER NOT NULL DEFAULT 0,
  banner_v     INTEGER NOT NULL DEFAULT 0
);
INSERT INTO clubs_new (id, slug, name, description, join_policy, owner_id, created_at, color, tag, announcement, avatar_v, banner_v)
SELECT id, slug, name, description, join_policy, owner_id, created_at, color, tag, announcement, avatar_v, banner_v FROM clubs;
DROP TABLE clubs;
ALTER TABLE clubs_new RENAME TO clubs;

CREATE TABLE ratings_new (
  user_id    TEXT NOT NULL REFERENCES users(id),
  category   TEXT NOT NULL CHECK (category IN ('freestyle', 'standard', 'caro')),
  rating     REAL NOT NULL,
  rd         REAL NOT NULL,
  volatility REAL NOT NULL,
  games      INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, category)
);
INSERT INTO ratings_new (user_id, category, rating, rd, volatility, games, updated_at)
SELECT user_id, category, rating, rd, volatility, games, updated_at FROM ratings;
DROP TABLE ratings;
ALTER TABLE ratings_new RENAME TO ratings;
CREATE INDEX idx_ratings_category_rating ON ratings(category, rating DESC);

CREATE TABLE forum_threads_new (
  id           TEXT PRIMARY KEY,
  category     TEXT NOT NULL,                     -- fixed list in ForumService.CATEGORIES
  author_id    TEXT NOT NULL REFERENCES users(id),
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  last_post_at TEXT NOT NULL,
  reply_count  INTEGER NOT NULL DEFAULT 0,
  deleted      INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
);
INSERT INTO forum_threads_new (id, category, author_id, title, body, created_at, last_post_at, reply_count, deleted)
SELECT id, category, author_id, title, body, created_at, last_post_at, reply_count, deleted FROM forum_threads;
DROP TABLE forum_threads;
ALTER TABLE forum_threads_new RENAME TO forum_threads;
CREATE INDEX idx_forum_threads_cat ON forum_threads(category, deleted, last_post_at);

CREATE TABLE forum_posts_new (
  id         TEXT PRIMARY KEY,
  thread_id  TEXT NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
  author_id  TEXT NOT NULL REFERENCES users(id),
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
);
INSERT INTO forum_posts_new (id, thread_id, author_id, body, created_at, deleted)
SELECT id, thread_id, author_id, body, created_at, deleted FROM forum_posts;
DROP TABLE forum_posts;
ALTER TABLE forum_posts_new RENAME TO forum_posts;
CREATE INDEX idx_forum_posts_thread ON forum_posts(thread_id, created_at);

CREATE TABLE forum_reports_new (
  id          TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('thread', 'post')),
  target_id   TEXT NOT NULL,
  thread_id   TEXT NOT NULL,
  reporter_id TEXT NOT NULL REFERENCES users(id),
  reason      TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  resolved_at TEXT,
  UNIQUE (reporter_id, target_type, target_id)
);
INSERT INTO forum_reports_new (id, target_type, target_id, thread_id, reporter_id, reason, created_at, resolved_at)
SELECT id, target_type, target_id, thread_id, reporter_id, reason, created_at, resolved_at FROM forum_reports;
DROP TABLE forum_reports;
ALTER TABLE forum_reports_new RENAME TO forum_reports;
CREATE INDEX idx_forum_reports_open ON forum_reports(resolved_at, created_at);

CREATE TABLE sessions_new (
  id           TEXT PRIMARY KEY,                  -- opaque 256-bit random, base64url — SECRET, cookie-only
  user_id      TEXT,                              -- guest_xxxx id for guests; no FK on purpose (#259)
  display_name TEXT NOT NULL,
  is_guest     INTEGER NOT NULL DEFAULT 0 CHECK (is_guest IN (0, 1)),
  created_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  revoked_at   TEXT
);
INSERT INTO sessions_new (id, user_id, display_name, is_guest, created_at, last_seen_at, expires_at, revoked_at)
SELECT id, user_id, display_name, is_guest, created_at, last_seen_at, expires_at, revoked_at FROM sessions;
DROP TABLE sessions;
ALTER TABLE sessions_new RENAME TO sessions;
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
