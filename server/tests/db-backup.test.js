'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { runBackup, startBackupScheduler, PREFIX } = require('../db/backup');

describe('db backup (#254)', () => {
  let dir, db;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gomoku-bak-'));
    db = new Database(path.join(dir, 'live.db'));
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE t(x); INSERT INTO t VALUES (1),(2);');
  });
  afterEach(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });

  test('writes a consistent, private backup with no .tmp left', async () => {
    const out = path.join(dir, 'backups');
    const p = await runBackup(db, { dir: out });
    expect(path.basename(p).startsWith(PREFIX)).toBe(true);
    expect(fs.statSync(p).mode & 0o777).toBe(0o600);
    expect(fs.statSync(out).mode & 0o777).toBe(0o700);
    expect(fs.readdirSync(out).some(f => f.endsWith('.tmp'))).toBe(false);
    const b = new Database(p, { readonly: true });
    expect(b.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(b.prepare('SELECT COUNT(*) c FROM t').get().c).toBe(2);
    b.close();
  });

  test('rotation keeps newest N and spares other files', async () => {
    const out = path.join(dir, 'backups');
    fs.mkdirSync(out);
    fs.writeFileSync(path.join(out, 'gomoku-2026-01-01T00-00-00-000Z.db'), 'manual');
    for (let i = 1; i <= 4; i++) fs.writeFileSync(path.join(out, `${PREFIX}2026-01-0${i}T00-00-00-000Z.db`), 'x');
    await runBackup(db, { dir: out, keep: 3 });
    const files = fs.readdirSync(out).sort();
    expect(files.filter(f => f.startsWith(PREFIX))).toHaveLength(3);
    expect(files).not.toContain(`${PREFIX}2026-01-01T00-00-00-000Z.db`);
    expect(files).toContain('gomoku-2026-01-01T00-00-00-000Z.db');
  });

  test('failed backup leaves no file and rejects', async () => {
    const out = path.join(dir, 'backups');
    const bad = { backup: () => Promise.reject(new Error('boom')) };
    await expect(runBackup(bad, { dir: out })).rejects.toThrow('boom');
    expect(fs.readdirSync(out)).toEqual([]);
  });

  test("scheduler: off under test, off at 0 hours, unref'd timer otherwise", () => {
    expect(startBackupScheduler(db, { dir, env: { NODE_ENV: 'test' } })).toBeNull();
    expect(startBackupScheduler(db, { dir, env: { DB_BACKUP_INTERVAL_HOURS: '0' } })).toBeNull();
    const t = startBackupScheduler(db, { dir, env: {} });
    expect(t).not.toBeNull();
    clearInterval(t);
  });
});
