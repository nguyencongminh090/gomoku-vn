-- =============================================================================
-- Migration 001 — supporting indexes for existing query patterns
-- Safe to run any number of times (all statements use IF NOT EXISTS),
-- consistent with the style already used in schema.sql.
-- Addresses DB_REVIEW.md finding #5 (getRecentGames sorts on ended_at
-- with no supporting index).
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_games_ended_at ON games(ended_at DESC);
