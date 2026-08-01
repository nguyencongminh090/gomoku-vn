'use strict';

/**
 * load-env.test.js — Unit tests for the minimal .env reader.
 *
 * The loader exists because JWT_SECRET is a hard startup requirement (backend
 * fix #1) and there was no ordinary way to supply it locally. The rules that
 * matter for safety — a real environment variable always wins, and the file is
 * ignored entirely under NODE_ENV=test — are what these tests pin down.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { loadEnv, parseEnv } = require('../utils/load-env');

function writeTempEnv(contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gomoku-env-'));
  const file = path.join(dir, '.env');
  fs.writeFileSync(file, contents);
  return file;
}

describe('parseEnv', () => {
  test('reads plain KEY=value pairs', () => {
    expect(parseEnv('FOO=bar\nBAZ=qux')).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });

  test('ignores blank lines and comments', () => {
    expect(parseEnv('\n# a comment\nFOO=bar\n\n   # indented comment\n'))
      .toEqual({ FOO: 'bar' });
  });

  test('strips surrounding quotes', () => {
    expect(parseEnv('A="one"\nB=\'two\'')).toEqual({ A: 'one', B: 'two' });
  });

  test('accepts an export prefix', () => {
    expect(parseEnv('export FOO=bar')).toEqual({ FOO: 'bar' });
  });

  test('keeps = signs inside the value (base64 secrets end in them)', () => {
    expect(parseEnv('JWT_SECRET=abc==')).toEqual({ JWT_SECRET: 'abc==' });
  });

  test('skips malformed lines instead of throwing', () => {
    // A broken line must never stop the server from booting.
    expect(parseEnv('this is not valid\n=novalue\n1BAD=x\nGOOD=yes'))
      .toEqual({ GOOD: 'yes' });
  });
});

describe('loadEnv', () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  test('is a no-op under NODE_ENV=test, so the suite stays hermetic', () => {
    // NODE_ENV is 'test' throughout this suite (Jest sets it).
    const file = writeTempEnv('SHOULD_NOT_APPEAR=1');

    expect(loadEnv(file)).toEqual([]);
    expect(process.env.SHOULD_NOT_APPEAR).toBeUndefined();
  });

  test('applies values when not running tests', () => {
    process.env.NODE_ENV = 'development';
    const file = writeTempEnv('GOMOKU_TEST_VAR=hello');

    expect(loadEnv(file)).toEqual(['GOMOKU_TEST_VAR']);
    expect(process.env.GOMOKU_TEST_VAR).toBe('hello');
  });

  test('never overrides a variable already set in the real environment', () => {
    // The important one: a production process manager's JWT_SECRET must not be
    // silently replaced by a stray file on disk.
    process.env.NODE_ENV = 'production';
    process.env.GOMOKU_TEST_VAR = 'from-the-real-environment';
    const file = writeTempEnv('GOMOKU_TEST_VAR=from-the-file');

    expect(loadEnv(file)).toEqual([]);
    expect(process.env.GOMOKU_TEST_VAR).toBe('from-the-real-environment');
  });

  test('a missing file is not an error', () => {
    process.env.NODE_ENV = 'development';

    expect(() => loadEnv('/nonexistent/path/.env')).not.toThrow();
    expect(loadEnv('/nonexistent/path/.env')).toEqual([]);
  });
});
