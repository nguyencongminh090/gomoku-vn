'use strict';

/**
 * admin.js — local CLI for direct, destructive maintenance of gomoku.db.
 *
 * Usage: node server/scripts/admin.js <command> [--flag=value ...]
 *
 * CLI-only: never require this from server routes or socket handlers.
 */

const path     = require('path');
const fs       = require('fs');
const bcrypt   = require('bcrypt');
const { select, autocomplete, confirm, input, password: passwordPrompt } = require('enquirer');
const { db }   = require('../db/database');

const BCRYPT_ROUNDS = 12; // matches config.js BCRYPT_ROUNDS used by createUser
const DB_PATH      = path.join(__dirname, '..', 'db', 'gomoku.db');
const BACKUP_DIR   = path.join(__dirname, '..', 'db', 'backups');
const LOG_PATH     = path.join(BACKUP_DIR, 'admin.log');
const VALID_TABLES = ['users', 'games', 'player_games'];

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  for (const arg of rest) {
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq === -1) {
      flags[arg.slice(2)] = true;
    } else {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1);
    }
  }
  return { command, flags };
}

function isConfirmed(flags) {
  return (flags.confirm !== undefined && flags.confirm !== 'false')
    || (flags.yes !== undefined && flags.yes !== 'false');
}

// ---------------------------------------------------------------------------
// Backup + audit log
// ---------------------------------------------------------------------------

function isoStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function backupDatabase() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  db.pragma('wal_checkpoint(TRUNCATE)'); // flush WAL so the copy is self-contained
  const backupPath = path.join(BACKUP_DIR, `gomoku-${isoStamp()}.db`);
  fs.copyFileSync(DB_PATH, backupPath);
  return backupPath;
}

function logAction({ command, flags, rowsAffected, backupPath }) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const entry = {
    timestamp: new Date().toISOString(),
    command,
    flags,
    rowsAffected,
    backupPath: backupPath || null,
  };
  fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n');
}

// ---------------------------------------------------------------------------
// Interactive prompts (enquirer — CommonJS-compatible, unlike inquirer 9+
// which is ESM-only; also gives us Select/AutoComplete for free)
// ---------------------------------------------------------------------------

function askInput(message) {
  return input({ name: 'value', message }).then((v) => v.trim());
}

function askPassword(message) {
  return passwordPrompt({ name: 'value', message });
}

function askSelect(message, choices) {
  // enquirer normalizes `choices` in place (strings -> Choice objects), so
  // pass a clone — otherwise a shared array like VALID_TABLES or MENU gets
  // permanently corrupted after the first prompt.
  const safeChoices = choices.map((c) => (typeof c === 'string' ? c : { ...c }));
  return select({ name: 'value', message, choices: safeChoices });
}

function listUsernames() {
  return db.prepare('SELECT username FROM users ORDER BY username').all().map((r) => r.username);
}

function askUsername(message) {
  const choices = listUsernames();
  if (choices.length === 0) return askInput(message);
  return autocomplete({ name: 'value', message, limit: 10, choices });
}

async function confirmAction(flags, previewLines) {
  if (isConfirmed(flags)) return true;
  console.log(previewLines.join('\n'));
  return confirm({ name: 'value', message: 'Proceed?' });
}

// ---------------------------------------------------------------------------
// Shared lookups
// ---------------------------------------------------------------------------

function findUser(flags) {
  if (flags.id) return db.prepare('SELECT * FROM users WHERE id = ?').get(flags.id);
  if (flags.username) return db.prepare('SELECT * FROM users WHERE username = ?').get(flags.username);
  return undefined;
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

async function handleDeleteUser(flags) {
  if (!flags.id && !flags.username) {
    throw new Error('delete-user requires --id=<userId> or --username=<username>');
  }
  const user = findUser(flags);
  if (!user) {
    console.log('No matching user found.');
    return;
  }

  const gamesAffected = db.prepare(
    'SELECT COUNT(*) as count FROM games WHERE black_player_id = ? OR white_player_id = ?'
  ).get(user.id, user.id).count;
  const playerGamesCount = db.prepare(
    'SELECT COUNT(*) as count FROM player_games WHERE player_id = ?'
  ).get(user.id).count;

  const preview = [
    `About to delete user: ${user.username} (id=${user.id}, display_name=${user.display_name})`,
    `  - games to be updated (player_id nulled, record kept): ${gamesAffected}`,
    `  - player_games rows to remove: ${playerGamesCount}`,
  ];

  if (!(await confirmAction(flags, preview))) {
    console.log('Aborted.');
    return;
  }

  const backupPath = backupDatabase();

  const run = db.transaction(() => {
    db.prepare('UPDATE games SET black_player_id = NULL WHERE black_player_id = ?').run(user.id);
    db.prepare('UPDATE games SET white_player_id = NULL WHERE white_player_id = ?').run(user.id);
    db.prepare('DELETE FROM player_games WHERE player_id = ?').run(user.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  });
  run();

  const rowsAffected = 1 + gamesAffected + playerGamesCount;
  logAction({ command: 'delete-user', flags, rowsAffected, backupPath });
  console.log(`Deleted user ${user.username}. Games updated: ${gamesAffected}. player_games removed: ${playerGamesCount}.`);
  console.log(`Backup: ${backupPath}`);
}

async function handleDeleteGame(flags) {
  if (!flags.id) {
    throw new Error('delete-game requires --id=<gameId>');
  }
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(flags.id);
  if (!game) {
    console.log('No matching game found.');
    return;
  }

  const linkCount = db.prepare(
    'SELECT COUNT(*) as count FROM player_games WHERE game_id = ?'
  ).get(game.id).count;

  const preview = [
    `About to delete game: ${game.id} (room=${game.room_id}, ${game.black_player_name} vs ${game.white_player_name}, ended_at=${game.ended_at})`,
    `  - player_games rows to remove: ${linkCount}`,
  ];

  if (!(await confirmAction(flags, preview))) {
    console.log('Aborted.');
    return;
  }

  const backupPath = backupDatabase();

  const run = db.transaction(() => {
    db.prepare('DELETE FROM player_games WHERE game_id = ?').run(game.id);
    db.prepare('DELETE FROM games WHERE id = ?').run(game.id);
  });
  run();

  const rowsAffected = 1 + linkCount;
  logAction({ command: 'delete-game', flags, rowsAffected, backupPath });
  console.log(`Deleted game ${game.id}. player_games removed: ${linkCount}.`);
  console.log(`Backup: ${backupPath}`);
}

async function handlePurgeGames(flags) {
  if (!flags.before) {
    throw new Error('purge-games requires --before=<ISO-date>');
  }
  const before = flags.before;
  const games = db.prepare(
    'SELECT id, room_id, ended_at FROM games WHERE ended_at < ? ORDER BY ended_at'
  ).all(before);

  if (games.length === 0) {
    console.log('No games match.');
    return;
  }

  const linkCount = db.prepare(
    'SELECT COUNT(*) as count FROM player_games WHERE game_id IN (SELECT id FROM games WHERE ended_at < ?)'
  ).get(before).count;

  const preview = [
    `About to delete ${games.length} game(s) ended before ${before}:`,
    ...games.slice(0, 5).map((g) => `  - ${g.id} (room=${g.room_id}, ended_at=${g.ended_at})`),
    games.length > 5 ? `  ...and ${games.length - 5} more` : null,
    `  - player_games rows to remove: ${linkCount}`,
  ].filter(Boolean);

  if (!(await confirmAction(flags, preview))) {
    console.log('Aborted.');
    return;
  }

  const backupPath = backupDatabase();

  const run = db.transaction(() => {
    db.prepare(
      'DELETE FROM player_games WHERE game_id IN (SELECT id FROM games WHERE ended_at < ?)'
    ).run(before);
    db.prepare('DELETE FROM games WHERE ended_at < ?').run(before);
  });
  run();

  const rowsAffected = games.length + linkCount;
  logAction({ command: 'purge-games', flags, rowsAffected, backupPath });
  console.log(`Deleted ${games.length} game(s) and ${linkCount} player_games row(s).`);
  console.log(`Backup: ${backupPath}`);
}

async function handleTruncateTable(flags) {
  const table = flags.table;
  if (!VALID_TABLES.includes(table)) {
    throw new Error(`truncate-table requires --table=<${VALID_TABLES.join('|')}>`);
  }

  const count = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get().count;
  const sample = db.prepare(`SELECT * FROM ${table} LIMIT 3`).all();

  const preview = [
    `About to delete ALL rows from table "${table}" (${count} row(s)).`,
    `  Sample: ${JSON.stringify(sample)}`,
  ];

  if (!(await confirmAction(flags, preview))) {
    console.log('Aborted.');
    return;
  }

  const backupPath = backupDatabase();

  const run = db.transaction(() => {
    db.prepare(`DELETE FROM ${table}`).run();
  });
  run();

  logAction({ command: 'truncate-table', flags, rowsAffected: count, backupPath });
  console.log(`Truncated table "${table}". Rows removed: ${count}.`);
  console.log(`Backup: ${backupPath}`);
}

async function handleSetPassword(flags) {
  if (!flags.id && !flags.username) {
    throw new Error('set-password requires --id=<userId> or --username=<username>');
  }
  if (!flags.password) {
    throw new Error('set-password requires --password=<newPassword>');
  }
  const user = findUser(flags);
  if (!user) {
    console.log('No matching user found.');
    return;
  }

  const preview = [`About to set a new password for user: ${user.username} (id=${user.id})`];

  if (!(await confirmAction(flags, preview))) {
    console.log('Aborted.');
    return;
  }

  const passwordHash = await bcrypt.hash(flags.password, BCRYPT_ROUNDS);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, user.id);

  const loggedFlags = { ...flags, password: '[REDACTED]' };
  logAction({ command: 'set-password', flags: loggedFlags, rowsAffected: 1 });
  console.log(`Password updated for user ${user.username}.`);
}

// ---------------------------------------------------------------------------
// Column table rendering
// ---------------------------------------------------------------------------

function renderTable(headers, rows) {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i]).length), 0)
  );
  const line = (cells) => cells.map((c, i) => String(c).padEnd(widths[i])).join('  ');
  const lines = [line(headers), widths.map((w) => '-'.repeat(w)).join('  ')];
  for (const r of rows) lines.push(line(r));
  return lines;
}

// ---------------------------------------------------------------------------
// Read-only commands — no confirm/backup/admin.log, they don't change data
// ---------------------------------------------------------------------------

async function handleListUsers(flags) {
  const interactive = flags.search === undefined && process.stdin.isTTY;
  const search = interactive ? await askInput('Search username/display name (blank for all): ') : (flags.search || '');

  const rows = db.prepare(`
    SELECT u.*, (SELECT COUNT(*) FROM player_games pg WHERE pg.player_id = u.id) as game_count
    FROM users u
    WHERE username LIKE ? OR display_name LIKE ?
    ORDER BY username
  `).all(`%${search}%`, `%${search}%`);

  if (rows.length === 0) {
    console.log('No matching users.');
    return;
  }

  const headers = ['#', 'Username', 'ID', 'Display Name', 'Games', 'Created', 'Last Login'];
  const tableRows = rows.map((u, i) => [
    i + 1, u.username, u.id, u.display_name, u.game_count, u.created_at, u.last_login_at || 'never',
  ]);
  for (const line of renderTable(headers, tableRows)) console.log(`  ${line}`);
  console.log(`\n${rows.length} user(s) found.`);

  if (!interactive) return;

  const action = await askSelect('Follow-up action', ['none', 'delete-user', 'set-password']);
  if (action === 'none') return;

  const rowNum = await askInput('Row number to act on: ');
  const target = rows[parseInt(rowNum, 10) - 1];
  if (!target) {
    console.log('Invalid selection.');
    return;
  }

  if (action === 'delete-user') {
    await handleDeleteUser({ id: target.id });
  } else if (action === 'set-password') {
    const newPassword = await askPassword('New password: ');
    await handleSetPassword({ id: target.id, password: newPassword });
  }
}

const PAGE_SIZE = 20;

const TABLE_VIEWS = {
  users: {
    countSql: 'SELECT COUNT(*) as count FROM users',
    pageSql: `
      SELECT u.*, (SELECT COUNT(*) FROM player_games pg WHERE pg.player_id = u.id) as game_count
      FROM users u ORDER BY username LIMIT ? OFFSET ?
    `,
    columns: ['Username', 'Display Name', 'Games', 'Created', 'Last Login'],
    toRow: (u) => [u.username, u.display_name, u.game_count, u.created_at, u.last_login_at || 'never'],
  },
  games: {
    countSql: 'SELECT COUNT(*) as count FROM games',
    pageSql: `
      SELECT id, black_player_name, white_player_name, winner, reason, board_size, started_at, ended_at
      FROM games ORDER BY started_at DESC LIMIT ? OFFSET ?
    `,
    columns: ['ID', 'Black', 'White', 'Winner', 'Reason', 'Size', 'Started', 'Ended'],
    toRow: (g) => [
      g.id, g.black_player_name, g.white_player_name, g.winner || '-',
      g.reason || '-', g.board_size, g.started_at, g.ended_at || '-',
    ],
  },
  player_games: {
    countSql: 'SELECT COUNT(*) as count FROM player_games',
    pageSql: `
      SELECT u.username,
             pg.game_id,
             CASE WHEN g.black_player_id = pg.player_id THEN g.white_player_name ELSE g.black_player_name END as opponent,
             g.winner, g.ended_at
      FROM player_games pg
      JOIN users u ON u.id = pg.player_id
      JOIN games g ON g.id = pg.game_id
      ORDER BY g.ended_at DESC
      LIMIT ? OFFSET ?
    `,
    columns: ['Username', 'Game ID', 'Opponent', 'Winner', 'Ended'],
    toRow: (r) => [r.username, r.game_id, r.opponent, r.winner || '-', r.ended_at || '-'],
  },
};

async function handleViewTable(flags) {
  const table = flags.table;
  if (!VALID_TABLES.includes(table)) {
    throw new Error(`view-table requires --table=<${VALID_TABLES.join('|')}>`);
  }

  const view = TABLE_VIEWS[table];
  const total = db.prepare(view.countSql).get().count;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const interactive = flags.page === undefined && process.stdin.isTTY;

  let page = Math.min(Math.max(parseInt(flags.page, 10) || 1, 1), totalPages);

  for (;;) {
    const rows = db.prepare(view.pageSql).all(PAGE_SIZE, (page - 1) * PAGE_SIZE);
    console.log(`\n${table} — page ${page}/${totalPages} (${total} row(s) total)`);
    for (const line of renderTable(view.columns, rows.map(view.toRow))) console.log(`  ${line}`);

    if (!interactive) return;

    const options = [];
    if (page < totalPages) options.push('next');
    if (page > 1) options.push('prev');
    options.push('quit');

    const nav = await askSelect('Navigate', options);
    if (nav === 'quit') return;
    if (nav === 'next') page += 1;
    if (nav === 'prev') page -= 1;
  }
}

async function handleDbOverview() {
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const gameCount = db.prepare('SELECT COUNT(*) as c FROM games').get().c;
  const playerGameCount = db.prepare('SELECT COUNT(*) as c FROM player_games').get().c;

  const byReason = db.prepare(`
    SELECT COALESCE(reason, '(none — interrupted)') as reason, COUNT(*) as count
    FROM games GROUP BY reason ORDER BY count DESC
  `).all();

  const recentlyActive = db.prepare(`
    SELECT username, last_login_at FROM users
    WHERE last_login_at IS NOT NULL
    ORDER BY last_login_at DESC LIMIT 5
  `).all();

  let dbSizeKb = 0;
  try {
    dbSizeKb = fs.statSync(DB_PATH).size / 1024;
  } catch {
    // leave at 0 if the file is unreadable for some reason
  }

  console.log('Database overview');
  console.log('==================');
  console.log(`Users:         ${userCount}`);
  console.log(`Games:         ${gameCount}`);
  console.log(`player_games:  ${playerGameCount}`);
  console.log(`DB file size:  ${dbSizeKb.toFixed(1)} KB`);

  console.log('\nGames by reason:');
  for (const r of byReason) console.log(`  ${r.reason}: ${r.count}`);

  console.log('\nMost recently active users:');
  if (recentlyActive.length === 0) {
    console.log('  (no login activity recorded yet)');
  } else {
    for (const u of recentlyActive) console.log(`  ${u.username} — last login ${u.last_login_at}`);
  }
}

// ---------------------------------------------------------------------------
// Command map — add new commands here without touching the plumbing above
// ---------------------------------------------------------------------------

const commandHandlers = {
  'delete-user': handleDeleteUser,
  'delete-game': handleDeleteGame,
  'purge-games': handlePurgeGames,
  'truncate-table': handleTruncateTable,
  'set-password': handleSetPassword,
  'list-users': handleListUsers,
  'view-table': handleViewTable,
  'db-overview': handleDbOverview,
};

// ---------------------------------------------------------------------------
// Interactive menu (launched when no command is given on argv)
// ---------------------------------------------------------------------------

const MENU = [
  { name: 'list-users', message: 'list-users       — list / search users' },
  { name: 'view-table', message: 'view-table       — browse a table' },
  { name: 'db-overview', message: 'db-overview      — show DB stats' },
  { name: 'delete-user', message: 'delete-user      — remove a user (destructive)' },
  { name: 'delete-game', message: 'delete-game      — remove a game (destructive)' },
  { name: 'purge-games', message: 'purge-games      — bulk-delete old games (destructive)' },
  { name: 'truncate-table', message: 'truncate-table   — wipe a table (destructive)' },
  { name: 'set-password', message: 'set-password     — reset a user\'s password' },
  { name: 'exit', message: 'exit' },
];

async function promptFlags(command) {
  const flags = {};
  switch (command) {
    case 'delete-user':
    case 'set-password': {
      const method = await askSelect('Look up user by', ['username (autocomplete)', 'user ID']);
      if (method.startsWith('username')) {
        flags.username = await askUsername('Username: ');
      } else {
        flags.id = await askInput('User ID: ');
      }
      if (command === 'set-password') {
        flags.password = await askPassword('New password: ');
      }
      break;
    }
    case 'delete-game': {
      flags.id = await askInput('Game ID: ');
      break;
    }
    case 'purge-games': {
      flags.before = await askInput('Delete games ended before (ISO date): ');
      break;
    }
    case 'truncate-table':
    case 'view-table': {
      flags.table = await askSelect('Table', VALID_TABLES);
      break;
    }
    default:
      break;
  }
  return flags;
}

async function interactiveMenu() {
  console.log('Gomoku Admin CLI — interactive mode\n');
  for (;;) {
    const choice = await askSelect('Select a command', MENU);
    if (choice === 'exit') break;

    const flags = await promptFlags(choice);
    try {
      await commandHandlers[choice](flags);
    } catch (err) {
      console.error(`Error: ${err.message}`);
    }
    console.log('');
  }
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));

  if (!command) {
    await interactiveMenu();
    return;
  }

  const handler = commandHandlers[command];
  if (!handler) {
    console.error(`Unknown command: ${command}`);
    console.error(`Available commands: ${Object.keys(commandHandlers).join(', ')}`);
    process.exitCode = 1;
    return;
  }

  try {
    await handler(flags);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  }
}

main().then(() => process.exit(process.exitCode || 0));
