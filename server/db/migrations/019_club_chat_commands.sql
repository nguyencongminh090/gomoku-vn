-- B447: club chat slash commands + notifications.
-- clubs.chat_settings = JSON of staff toggles (ClubService.CHAT_DEFAULTS merged over it); NULL = all defaults.
-- club_messages.kind: 'text' (plain), 'pin' (/ghim), 'challenge' (/giaohuu); meta = JSON for non-text kinds.
ALTER TABLE clubs ADD COLUMN chat_settings TEXT;
ALTER TABLE club_messages ADD COLUMN kind TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'pin', 'challenge'));
ALTER TABLE club_messages ADD COLUMN meta TEXT;
