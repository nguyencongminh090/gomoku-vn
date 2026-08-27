'use strict';

/**
 * logger.test.js — output-shape guarantees for utils/logger.js.
 *
 * The logger is required fresh per-test (jest.resetModules) because format
 * selection reads process.env / stdout.isTTY at call time but color/format
 * helpers are cheap to re-evaluate — we still reset to keep each test
 * hermetic against env mutation.
 */

function freshLogger(env = {}) {
  jest.resetModules();
  const saved = {};
  for (const k of ['LOG_FORMAT', 'LOG_COLOR', 'DEBUG']) {
    saved[k] = process.env[k];
    if (k in env) process.env[k] = env[k];
    else delete process.env[k];
  }
  const logger = require('../utils/logger');
  return { logger, restore: () => Object.assign(process.env, saved) };
}

describe('logfmt internals', () => {
  const { logger, restore } = freshLogger({ LOG_FORMAT: 'logfmt' });
  afterAll(restore);
  const { fmtVal, fmtFields, buildMessage } = logger._internals;

  test('fmtVal leaves bare tokens unquoted', () => {
    expect(fmtVal('bob')).toBe('bob');
    expect(fmtVal(200)).toBe('200');
    expect(fmtVal('203.0.113.9')).toBe('203.0.113.9');
  });

  test('fmtVal quotes + escapes values with spaces, = or "', () => {
    expect(fmtVal('hello world')).toBe('"hello world"');
    expect(fmtVal('a=b')).toBe('"a=b"');
    expect(fmtVal('say "hi"')).toBe('"say \\"hi\\""');
  });

  test('fmtVal renders empty string and nullish predictably', () => {
    expect(fmtVal('')).toBe('""');
    expect(fmtVal(null)).toBe('');
    expect(fmtVal(undefined)).toBe('');
  });

  test('fmtFields skips undefined values, keeps leading space', () => {
    expect(fmtFields({ a: 1, b: undefined, c: 'x' })).toBe(' a=1 c=x');
    expect(fmtFields({})).toBe('');
    expect(fmtFields(null)).toBe('');
  });

  test('buildMessage joins parts and unrolls Error stacks', () => {
    expect(buildMessage(['[Auth]', 'Login'])).toBe('[Auth] Login');
    const err = new Error('boom');
    expect(buildMessage(['failed:', err])).toContain('boom');
  });
});

describe('emit() — logfmt mode', () => {
  let spy;
  let restore;
  beforeEach(() => { spy = jest.spyOn(console, 'info').mockImplementation(() => {}); });
  afterEach(() => { spy.mockRestore(); restore(); });

  test('produces one ts= level= msg= line, fields appended', () => {
    ({ restore } = attach({ LOG_FORMAT: 'logfmt' }));
    const line = spy.mock.calls[0][0];
    expect(line).toMatch(/^ts=\d{4}-\d\d-\d\dT[\d:.]+Z level=info msg="\[Auth\] Login" user=bob ip=203\.0\.113\.9 geo=VN$/);
  });

  test('a trailing plain object is treated as fields, not message', () => {
    ({ restore } = attach({ LOG_FORMAT: 'logfmt' }));
    expect(spy.mock.calls[0][0]).not.toContain('{');
  });

  function attach(env) {
    const f = freshLogger(env);
    f.logger.info('[Auth] Login', { user: 'bob', ip: '203.0.113.9', geo: 'VN' });
    return f;
  }
});

describe('emit() — pretty mode', () => {
  let spy;
  let restore;
  beforeEach(() => { spy = jest.spyOn(console, 'info').mockImplementation(() => {}); });
  afterEach(() => { spy.mockRestore(); restore && restore(); });

  test('keeps the [LEVEL] [time] prefix and appends fields', () => {
    const f = freshLogger({ LOG_FORMAT: 'pretty', LOG_COLOR: 'false' });
    restore = f.restore;
    f.logger.info('[Socket] Connected', { sid: 'abc', geo: 'VN' });
    const line = spy.mock.calls[0][0];
    expect(line).toMatch(/^\[INFO \] \[\d\d:\d\d:\d\d\] \[Socket\] Connected sid=abc geo=VN$/);
  });
});

describe('level gating', () => {
  test('debug is silent unless DEBUG=true', () => {
    const spy = jest.spyOn(console, 'debug').mockImplementation(() => {});
    const off = freshLogger({ LOG_FORMAT: 'logfmt' });
    off.logger.debug('hidden');
    expect(spy).not.toHaveBeenCalled();
    off.restore();

    const on = freshLogger({ LOG_FORMAT: 'logfmt', DEBUG: 'true' });
    on.logger.debug('shown');
    expect(spy).toHaveBeenCalledTimes(1);
    on.restore();
    spy.mockRestore();
  });

  test('error routes to console.error', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const f = freshLogger({ LOG_FORMAT: 'logfmt' });
    f.logger.error('[Server] boom');
    expect(spy.mock.calls[0][0]).toContain('level=error msg="[Server] boom"');
    f.restore();
    spy.mockRestore();
  });
});
