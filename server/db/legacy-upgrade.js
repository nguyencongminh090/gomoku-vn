'use strict';

/**
 * legacy-upgrade.js — pre-versioning schema healing (B255).
 *
 * Runs ONLY for databases whose PRAGMA user_version is below the baseline (a
 * fresh file, or a pre-#255 file still on version 0), after schema.sql. Every
 * block is idempotent and gated on the target state. Frozen: new schema
 * changes go in migrations/NNN_*.sql (see migrate.js), never here.
 */

const logger = require('../utils/logger');

function upgradeLegacy(db) {
  // CREATE TABLE IF NOT EXISTS never adds a column to an already-existing
  // table, so a db file created before TODO.md #50 (pairing.games) is missing
  // this column — add it in place if so. Additive-only (nullable, no data
  // touched), safe to run every startup.
  const pairingColumns = db.prepare("PRAGMA table_info(tournament_pairings)").all().map((c) => c.name);
  if (pairingColumns.length > 0 && !pairingColumns.includes('games')) {
    db.exec('ALTER TABLE tournament_pairings ADD COLUMN games TEXT');
    logger.info('[DB] Migrated tournament_pairings: added games column (TODO.md #50)');
  }

  // Puzzle walls/portals: older puzzles tables lack the layout column (additive, safe each startup).
  const puzzleColumns = db.prepare('PRAGMA table_info(puzzles)').all().map((c) => c.name);
  if (puzzleColumns.length > 0 && !puzzleColumns.includes('layout')) {
    db.exec("ALTER TABLE puzzles ADD COLUMN layout TEXT NOT NULL DEFAULT '{}'");
    logger.info('[DB] Migrated puzzles: added layout column (walls/portals)');
  }

  // Puzzle tags narrowed to attack/defense/trap/vct/vcf: old three/four_three become attack.
  if (puzzleColumns.length > 0) {
    db.exec(`INSERT OR IGNORE INTO puzzle_tags (puzzle_id, tag) SELECT puzzle_id, 'attack' FROM puzzle_tags WHERE tag IN ('three','four_three');
      DELETE FROM puzzle_tags WHERE tag IN ('three','four_three')`);
  }

  // B241: consecutive double-no-show count per pairing (replay cap).
  if (pairingColumns.length > 0 && !pairingColumns.includes('noshow_count')) {
    db.exec('ALTER TABLE tournament_pairings ADD COLUMN noshow_count INTEGER NOT NULL DEFAULT 0');
    logger.info('[DB] Migrated tournament_pairings: added noshow_count column (B241)');
  }

  // Same additive-migration need as above, for the 'cancelled' tournament
  // status (TODO.md #59) — a db file created before this feature is missing
  // these two columns.
  const tournamentColumns = db.prepare("PRAGMA table_info(tournaments)").all().map((c) => c.name);
  if (tournamentColumns.length > 0 && !tournamentColumns.includes('cancelled_at')) {
    db.exec('ALTER TABLE tournaments ADD COLUMN cancelled_at TEXT');
    db.exec('ALTER TABLE tournaments ADD COLUMN cancel_reason TEXT');
    logger.info('[DB] Migrated tournaments: added cancelled_at/cancel_reason columns (TODO.md #59)');
  }

  // Same additive-migration need as above, for organizer_name (TODO.md #77) —
  // previously in-memory only (TournamentManager.js's tournament.organizerName),
  // needed now so a reloaded tournament can still render its organizer's name.
  if (tournamentColumns.length > 0 && !tournamentColumns.includes('organizer_name')) {
    db.exec('ALTER TABLE tournaments ADD COLUMN organizer_name TEXT');
    logger.info('[DB] Migrated tournaments: added organizer_name column (TODO.md #77)');
  }

  // Guest tournament entries (#240): persist the stable guest_xxxx id so a reload can re-link the entry.
  const playerColumns = db.prepare('PRAGMA table_info(tournament_players)').all().map((c) => c.name);
  if (playerColumns.length > 0 && !playerColumns.includes('guest_id')) {
    db.exec('ALTER TABLE tournament_players ADD COLUMN guest_id TEXT');
    logger.info('[DB] Migrated tournament_players: added guest_id column (#240)');
  }

  // Club-hosted tournaments (TODO.md #200 slice 4): nullable FK, SET NULL when the club is deleted.
  if (tournamentColumns.length > 0 && !tournamentColumns.includes('club_id')) {
    db.exec('ALTER TABLE tournaments ADD COLUMN club_id TEXT REFERENCES clubs(id) ON DELETE SET NULL');
    logger.info('[DB] Migrated tournaments: added club_id column (TODO.md #200)');
  }

  // Club identity + pinned announcement (TODO.md #235): additive columns on pre-existing clubs tables.
  const clubColumns = db.prepare('PRAGMA table_info(clubs)').all().map((c) => c.name);
  if (clubColumns.length > 0 && !clubColumns.includes('color')) {
    db.exec("ALTER TABLE clubs ADD COLUMN color TEXT NOT NULL DEFAULT 'blue'");
    db.exec("ALTER TABLE clubs ADD COLUMN tag TEXT NOT NULL DEFAULT ''");
    db.exec("ALTER TABLE clubs ADD COLUMN announcement TEXT NOT NULL DEFAULT ''");
    logger.info('[DB] Migrated clubs: added color/tag/announcement columns (TODO.md #235)');
  }

  // Club avatar + banner versions (TODO.md #250): 0 = none, else the cache-busting ?v= of the stored file.
  if (clubColumns.length > 0 && !clubColumns.includes('avatar_v')) {
    db.exec('ALTER TABLE clubs ADD COLUMN avatar_v INTEGER NOT NULL DEFAULT 0');
    db.exec('ALTER TABLE clubs ADD COLUMN banner_v INTEGER NOT NULL DEFAULT 0');
    logger.info('[DB] Migrated clubs: added avatar_v/banner_v columns (TODO.md #250)');
  }

  // Same additive-migration need as above, for oauth_provider/oauth_id
  // (TODO.md #91) — a db file created before Google login is missing these
  // two columns.
  const userColumns = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
  if (userColumns.length > 0 && !userColumns.includes('oauth_provider')) {
    db.exec('ALTER TABLE users ADD COLUMN oauth_provider TEXT');
    db.exec('ALTER TABLE users ADD COLUMN oauth_id TEXT');
    logger.info('[DB] Migrated users: added oauth_provider/oauth_id columns (TODO.md #91)');
  }

  // Same additive-migration need as above, for games.ranked (TODO.md #175).
  const gameColumns = db.prepare("PRAGMA table_info(games)").all().map((c) => c.name);
  if (gameColumns.length > 0 && !gameColumns.includes('ranked')) {
    db.exec('ALTER TABLE games ADD COLUMN ranked INTEGER NOT NULL DEFAULT 0');
    logger.info('[DB] Migrated games: added ranked column (TODO.md #175)');
  }

  // Profile fields (TODO.md #177): bio, avatar version (0 = no avatar; bumped per
  // upload so the URL cache-busts), and the two privacy opt-outs.
  if (userColumns.length > 0 && !userColumns.includes('bio')) {
    db.exec("ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT ''");
    db.exec('ALTER TABLE users ADD COLUMN avatar_v INTEGER NOT NULL DEFAULT 0');
    db.exec('ALTER TABLE users ADD COLUMN hide_history INTEGER NOT NULL DEFAULT 0');
    db.exec('ALTER TABLE users ADD COLUMN hide_bio INTEGER NOT NULL DEFAULT 0');
    logger.info('[DB] Migrated users: added bio/avatar_v/hide_history/hide_bio columns (TODO.md #177)');
  }

  // Selected UI skin (TODO.md #180); the cookie is authoritative on a device,
  // this column carries the choice to a new one.
  if (userColumns.length > 0 && !userColumns.includes('ui_skin')) {
    db.exec("ALTER TABLE users ADD COLUMN ui_skin TEXT NOT NULL DEFAULT 'arena'");
    logger.info('[DB] Migrated users: added ui_skin column (TODO.md #180)');
  }

  // Settings + privacy gates (TODO.md #199): location, who may DM / challenge /
  // friend-request (everyone|friends|nobody), and hide-online.
  if (userColumns.length > 0 && !userColumns.includes('who_can_dm')) {
    db.exec("ALTER TABLE users ADD COLUMN country TEXT NOT NULL DEFAULT ''");
    db.exec("ALTER TABLE users ADD COLUMN city TEXT NOT NULL DEFAULT ''");
    db.exec("ALTER TABLE users ADD COLUMN who_can_dm TEXT NOT NULL DEFAULT 'everyone'");
    db.exec("ALTER TABLE users ADD COLUMN who_can_challenge TEXT NOT NULL DEFAULT 'everyone'");
    db.exec("ALTER TABLE users ADD COLUMN who_can_friend TEXT NOT NULL DEFAULT 'everyone'");
    db.exec('ALTER TABLE users ADD COLUMN hide_online INTEGER NOT NULL DEFAULT 0');
    logger.info('[DB] Migrated users: added country/city/who_can_*/hide_online columns (TODO.md #199)');
  }

  // Shareable friend code "username#1234" (TODO.md #232): the 4-digit tag is assigned lazily on first use.
  if (userColumns.length > 0 && !userColumns.includes('friend_tag')) {
    db.exec('ALTER TABLE users ADD COLUMN friend_tag TEXT');
    logger.info('[DB] Migrated users: added friend_tag column (TODO.md #232)');
  }

  // Reviewer flag for member-submitted puzzles (TODO.md #203). R8 Admin builds real roles later;
  // until then it is granted from the CLI (server/scripts/admin.js set-admin).
  if (userColumns.length > 0 && !userColumns.includes('is_admin')) {
    db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
    logger.info('[DB] Migrated users: added is_admin column (TODO.md #203)');
  }

  // Staff roles (TODO.md #205, R8): replaces the bare is_admin flag. is_admin stays as a dead column
  // (SQLite DROP COLUMN buys nothing); admins are carried over once.
  if (userColumns.length > 0 && !userColumns.includes('role')) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member'");
    if (userColumns.includes('is_admin')) db.exec("UPDATE users SET role = 'admin' WHERE is_admin = 1");
    logger.info('[DB] Migrated users: added role column (TODO.md #205)');
  }

  // Account lock (TODO.md #206, R8 8b): NULL = active, else ISO time it was locked.
  if (userColumns.length > 0 && !userColumns.includes('locked_at')) {
    db.exec('ALTER TABLE users ADD COLUMN locked_at TEXT');
    logger.info('[DB] Migrated users: added locked_at column (TODO.md #206)');
  }

  // The baseline stamp asserts migrations/001-003 were applied by hand. 001 is an index already in
  // schema.sql; 003 is additive, so heal it here; 002 deletes orphan rows, so never run it unattended.
  if (userColumns.length > 0 && !userColumns.includes('last_login_at')) {
    db.exec('ALTER TABLE users ADD COLUMN last_login_at TEXT');
    logger.info('[DB] Migrated users: added last_login_at column (migration 003)');
  }
  assertMigration002(db);
}

/** Throws (before the baseline stamp) if games/player_games still lack their users FK. */
function assertMigration002(db) {
  const missing = [['games', 'black_player_id'], ['games', 'white_player_id'], ['player_games', 'player_id']]
    .filter(([t, col]) => !db.prepare(`PRAGMA foreign_key_list(${t})`).all().some((fk) => fk.from === col && fk.table === 'users'));
  if (missing.length) {
    throw new Error(`[DB] migration 002 was never applied (no users FK on ${missing.map((m) => m.join('.')).join(', ')}). ` +
      'Back up the DB, run: sqlite3 <db> < server/db/migrations/002_rebuild_player_games_and_games_fk.sql, then restart.');
  }
}

/**
 * Runs EVERY boot (not version-gated): self-heals after a human dedupes oauth rows (#94/#100).
 * One cheap PRAGMA once the index is already UNIQUE.
 */
function ensureOauthUniqueIndex(db) {
  // idx_users_oauth started as a plain (non-unique) index, which left a TOCTOU
  // race in the /google/callback handler free to insert two `users` rows for
  // the same (oauth_provider, oauth_id) (TODO.md #94). Upgrading it to a
  // UNIQUE INDEX closes that at the DB layer. NULL <> NULL under SQL's rules
  // (SQLite included), so password accounts — which store NULL in both
  // columns — never collide with each other under this constraint.
  //
  // SQLite has no ALTER INDEX, so an existing plain index must be dropped and
  // recreated as UNIQUE — but CREATE UNIQUE INDEX throws immediately if any
  // duplicate pair already exists, which would stop the server from booting.
  // If this race was ever actually hit in production, silently deleting the
  // "loser" row would be destructive to real account data — not something to
  // do unattended (see docs/instruction/B94-*.md's "Phạm vi KHÔNG làm"). So:
  // detect duplicates first, and only install the UNIQUE index when none
  // exist; otherwise leave the old plain index in place and log loudly so a
  // human decides how to dedupe before the constraint can be added.
  // TODO.md #100: unlike every other migration block above, this one used to
  // run its full duplicate scan + DROP/CREATE INDEX on EVERY boot forever, even
  // once the index was already UNIQUE and nothing had changed since — the
  // other blocks all gate on "does the target state already exist?" and reduce
  // to a single cheap PRAGMA once migrated. Do the same here: skip straight
  // past the scan when idx_users_oauth already exists AND is already unique.
  // Self-healing is preserved — if it's still the old plain index (or missing
  // entirely), the scan-and-upgrade path below still runs exactly as before,
  // so a human who dedupes rows and restarts still gets the upgrade attempted
  // on the very next boot.
  const existingOauthIndex = db.prepare("PRAGMA index_list('users')").all()
    .find((idx) => idx.name === 'idx_users_oauth');
  if (!existingOauthIndex || !existingOauthIndex.unique) {
    const duplicateOauthPairs = db.prepare(
      `SELECT oauth_provider, oauth_id, COUNT(*) AS n FROM users
       WHERE oauth_provider IS NOT NULL AND oauth_id IS NOT NULL
       GROUP BY oauth_provider, oauth_id HAVING COUNT(*) > 1`
    ).all();
    if (duplicateOauthPairs.length > 0) {
      logger.error(
        `[DB] Found ${duplicateOauthPairs.length} duplicate (oauth_provider, oauth_id) pair(s) in users ` +
        '— skipping UNIQUE index upgrade (TODO.md #94). Dedupe these rows manually, then restart the ' +
        `server: ${JSON.stringify(duplicateOauthPairs)}`
      );
      db.exec('CREATE INDEX IF NOT EXISTS idx_users_oauth ON users(oauth_provider, oauth_id)');
    } else {
      db.exec('DROP INDEX IF EXISTS idx_users_oauth');
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oauth ON users(oauth_provider, oauth_id)');
    }
  }
}

module.exports = { upgradeLegacy, ensureOauthUniqueIndex };
