-- B461: role of whoever issued the sanction (owner|officer). Lifting or overwriting it needs
-- rank(actor) >= rank(actor_role); NULL (rows from before 025) counts as 'owner'.
-- Runs once (user_version guard in migrate.js).
ALTER TABLE club_sanctions ADD COLUMN actor_role TEXT;
