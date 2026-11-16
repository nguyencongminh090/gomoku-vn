-- F402: the create-room modal pre-fills with the member's previous room settings.
-- JSON of the validated settings object (no room name); NULL = never created a room.
ALTER TABLE users ADD COLUMN last_room_settings TEXT;
