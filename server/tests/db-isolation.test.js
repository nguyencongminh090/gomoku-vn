'use strict';

// B348: PrivateChatHandler/SocketHandler/flood-protection loaded db/connection.js transitively with no DB mock, so
// `npm test` opened and migrated the real server/db/gomoku.db. Guard: per-file temp DB + refusal of the default path.
const fs = require('fs');
const path = require('path');

jest.mock('../utils/logger', () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }));

const REAL = path.join(__dirname, '../db/gomoku.db');

test('setup gives this file its own temp DB, not the real one', () => {
  expect(process.env.GOMOKU_DB_PATH).toBeTruthy();
  expect(path.resolve(process.env.GOMOKU_DB_PATH)).not.toBe(REAL);
});

test('a suite that loads db/connection without a mock opens the temp file', () => {
  let conn;
  jest.isolateModules(() => { conn = require('../db/connection'); });
  expect(conn.DB_PATH).toBe(process.env.GOMOKU_DB_PATH);
  expect(fs.existsSync(conn.DB_PATH)).toBe(true);
  conn.db.close();
});

test.each([[undefined], [REAL], ['server/db/gomoku.db']])(
  'connection.js refuses the real DB under Jest (GOMOKU_DB_PATH=%s)', (p) => {
    const saved = process.env.GOMOKU_DB_PATH;
    const Database = jest.fn();
    try {
      if (p === undefined) delete process.env.GOMOKU_DB_PATH; else process.env.GOMOKU_DB_PATH = p;
      jest.isolateModules(() => {
        jest.doMock('better-sqlite3', () => Database);
        expect(() => require('../db/connection')).toThrow(/refusing to open/);
      });
      expect(Database).not.toHaveBeenCalled();
    } finally {
      process.env.GOMOKU_DB_PATH = saved;
    }
  });
