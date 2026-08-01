-- =============================================================================
-- Migration 003 — add users.last_login_at
-- Powers the admin CLI's "last active" reporting (list-users, db-overview).
--
-- SQLite has no `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, so this is NOT
-- idempotent and is NOT folded into schema.sql's CREATE TABLE IF NOT EXISTS
-- bootstrap path (same reasoning as migration 002) — run it once, deliberately,
-- against the live gomoku.db after a backup. Fresh databases get the column
-- straight from schema.sql's CREATE TABLE users (...).
-- =============================================================================

ALTER TABLE users ADD COLUMN last_login_at TEXT;
