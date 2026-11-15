-- B385: DmService.pruneExpired (`DELETE FROM direct_messages WHERE created_at < ?`, at boot, hourly and from DM reads
-- ≤ 1/min) planned as SCAN direct_messages on the game thread. Index created_at so it is a range seek.
-- Measured on a copy of exports/vncaro-sim.db (steady state, nothing expired): 8.9k rows 0.30 -> 0.006 ms,
-- 89k rows 7.2 -> 0.006 ms; insert 5.6 -> 6.4 us.
CREATE INDEX idx_dm_created ON direct_messages(created_at);
