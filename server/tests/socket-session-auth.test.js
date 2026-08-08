'use strict';

/**
 * socket-session-auth.test.js — verifySocketToken's decision table and the
 * CSWSH Origin check (TODO.md #68).
 *
 * Two things are being pinned here, and the second one is easy to lose:
 *
 * 1. A dead session cookie must NEVER fall through to the legacy-JWT path.
 *    The migration fallback exists so pre-#68 tabs keep working; if a revoked
 *    cookie could fall past it to a still-valid JWT, revocation would be
 *    undone by the very mechanism meant to be temporary.
 *
 * 2. Origin is checked at all. Socket.IO's `cors` option does not cover
 *    WebSocket — browsers do not apply CORS to it — so without this check,
 *    moving the credential into a cookie would trade XSS token theft for
 *    cross-site WebSocket hijacking.
 */

jest.mock('../db/database', () => ({
  createSession: jest.fn(),
  getSessionById: jest.fn(),
  revokeSession: jest.fn(() => ({ changes: 1 })),
  revokeSessionsForUser: jest.fn(() => ({ changes: 0 })),
  touchSession: jest.fn(),
  deleteExpiredSessions: jest.fn(() => ({ changes: 0 })),
}));

jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const jwt    = require('jsonwebtoken');
const config = require('../config');
const db     = require('../db/database');
const { verifySocketToken, isAllowedOrigin } = require('../middleware/auth');

const SESSION_ID = 'sess-abc';
const liveRow = (over = {}) => ({
  id: SESSION_ID,
  user_id: 'user-1',
  display_name: 'Alice',
  is_guest: 0,
  expires_at: new Date(Date.now() + 3600e3).toISOString(),
  revoked_at: null,
  ...over,
});

function mockSocket({ cookie, auth, origin = 'http://localhost:3000' } = {}) {
  return {
    handshake: {
      headers: { ...(cookie ? { cookie } : {}), ...(origin ? { origin } : {}) },
      auth: auth || {},
    },
  };
}

/** Run the middleware and report what it decided. */
function run(socket) {
  const next = jest.fn();
  verifySocketToken(socket, next);
  const err = next.mock.calls[0] && next.mock.calls[0][0];
  return { ok: !err, code: err ? err.message : null, user: socket.user };
}

const ORIGINAL_CORS = process.env.CORS_ORIGIN;
const ORIGINAL_ENV  = process.env.NODE_ENV;

beforeEach(() => {
  jest.clearAllMocks();
  db.getSessionById.mockReturnValue(undefined);
  delete process.env.CORS_ORIGIN;
  process.env.NODE_ENV = 'test';
});

afterAll(() => {
  if (ORIGINAL_CORS === undefined) delete process.env.CORS_ORIGIN;
  else process.env.CORS_ORIGIN = ORIGINAL_CORS;
  process.env.NODE_ENV = ORIGINAL_ENV;
});

describe('verifySocketToken — session cookie decision table', () => {
  test('valid session cookie → accepted, socket.user populated from the row', () => {
    db.getSessionById.mockReturnValue(liveRow());

    const socket = mockSocket({ cookie: `gvn_session=${SESSION_ID}` });
    const res = run(socket);

    expect(res.ok).toBe(true);
    expect(res.user).toMatchObject({ userId: 'user-1', displayName: 'Alice', isGuest: false });
    expect(socket.sessionId).toBe(SESSION_ID);
  });

  test('valid session cookie → last_seen_at is refreshed', () => {
    db.getSessionById.mockReturnValue(liveRow());

    run(mockSocket({ cookie: `gvn_session=${SESSION_ID}` }));

    expect(db.touchSession).toHaveBeenCalledWith(SESSION_ID, expect.any(String));
  });

  test('no cookie and no legacy token → AUTH_REQUIRED', () => {
    expect(run(mockSocket()).code).toBe('AUTH_REQUIRED');
  });

  test.each([
    ['unknown session id', undefined],
    ['revoked session', { revoked_at: new Date().toISOString() }],
    ['expired session', { expires_at: new Date(Date.now() - 1000).toISOString() }],
  ])('%s → AUTH_INVALID', (_label, over) => {
    db.getSessionById.mockReturnValue(over === undefined ? undefined : liveRow(over));

    expect(run(mockSocket({ cookie: `gvn_session=${SESSION_ID}` })).code).toBe('AUTH_INVALID');
  });

  test('a REVOKED cookie does not fall through to a valid legacy token', () => {
    // The regression this whole feature would be pointless without: if a dead
    // cookie could fall past to the JWT path, "kicked" and "logged out" would
    // both be undone by the next reconnect.
    db.getSessionById.mockReturnValue(liveRow({ revoked_at: new Date().toISOString() }));
    const legacy = jwt.sign({ userId: 'user-1', displayName: 'Alice' }, config.JWT_SECRET, { expiresIn: '1h' });

    const res = run(mockSocket({ cookie: `gvn_session=${SESSION_ID}`, auth: { token: legacy } }));

    expect(res.ok).toBe(false);
    expect(res.code).toBe('AUTH_INVALID');
  });

  test('when both are present and the cookie is valid, the cookie wins', () => {
    db.getSessionById.mockReturnValue(liveRow());
    const legacy = jwt.sign({ userId: 'someone-else', displayName: 'Mallory' }, config.JWT_SECRET, { expiresIn: '1h' });

    const res = run(mockSocket({ cookie: `gvn_session=${SESSION_ID}`, auth: { token: legacy } }));

    expect(res.user.userId).toBe('user-1');
  });
});

describe('verifySocketToken — cookie header parsing robustness', () => {
  test('picks the session out of a header carrying several cookies', () => {
    db.getSessionById.mockReturnValue(liveRow());

    const res = run(mockSocket({
      cookie: `theme=dark; gvn_session=${SESSION_ID}; lang=vi`,
    }));

    expect(res.ok).toBe(true);
    expect(db.getSessionById).toHaveBeenCalledWith(SESSION_ID);
  });

  test.each([
    ['a value-less segment', 'novalue; other=1'],
    ['a stray equals sign', '=oops; x=1'],
    ['empty string', ''],
    ['only semicolons', ';;;'],
    ['a broken percent escape', 'gvn_session=%E0%A4%A'],
  ])('malformed cookie header (%s) is rejected, not crashed on', (_label, cookie) => {
    expect(() => run(mockSocket({ cookie }))).not.toThrow();
  });

  test('an unrelated cookie named similarly is not mistaken for the session', () => {
    run(mockSocket({ cookie: 'gvn_session_backup=abc' }));

    expect(db.getSessionById).not.toHaveBeenCalled();
  });
});

describe('verifySocketToken — legacy JWT fallback (migration window)', () => {
  test('a valid legacy token with no cookie is accepted', () => {
    const legacy = jwt.sign(
      { userId: 'user-9', displayName: 'Bob', isGuest: false },
      config.JWT_SECRET, { expiresIn: '1h' }
    );

    const res = run(mockSocket({ auth: { token: legacy } }));

    expect(res.ok).toBe(true);
    expect(res.user.userId).toBe('user-9');
    // No session row backs it, so there is nothing to revoke or touch.
    expect(res.user.sessionId).toBeNull();
    expect(db.touchSession).not.toHaveBeenCalled();
  });

  test('a forged legacy token is rejected', () => {
    const forged = jwt.sign({ userId: 'attacker' }, 'not-the-real-secret', { expiresIn: '1h' });

    expect(run(mockSocket({ auth: { token: forged } })).code).toBe('AUTH_INVALID');
  });

  test('an expired legacy token is rejected', () => {
    const expired = jwt.sign({ userId: 'user-9' }, config.JWT_SECRET, { expiresIn: '-1s' });

    expect(run(mockSocket({ auth: { token: expired } })).code).toBe('AUTH_INVALID');
  });
});

describe('Origin check — CSWSH defence', () => {
  test('a cross-site origin is refused before the credential is even looked at', () => {
    db.getSessionById.mockReturnValue(liveRow());

    const res = run(mockSocket({
      cookie: `gvn_session=${SESSION_ID}`,
      origin: 'https://evil.example',
    }));

    expect(res.code).toBe('AUTH_ORIGIN');
    expect(db.getSessionById).not.toHaveBeenCalled();
  });

  test('the configured origin is allowed', () => {
    process.env.CORS_ORIGIN = 'https://play3cr.example';
    db.getSessionById.mockReturnValue(liveRow());

    expect(run(mockSocket({ cookie: `gvn_session=${SESSION_ID}`, origin: 'https://play3cr.example' })).ok).toBe(true);
  });

  test('a comma-separated allow-list is honoured', () => {
    process.env.CORS_ORIGIN = 'https://a.example, https://b.example';

    expect(isAllowedOrigin('https://a.example')).toBe(true);
    expect(isAllowedOrigin('https://b.example')).toBe(true);
    expect(isAllowedOrigin('https://c.example')).toBe(false);
  });

  test('a missing Origin is allowed — non-browser clients cannot be CSWSH victims', () => {
    db.getSessionById.mockReturnValue(liveRow());

    expect(run(mockSocket({ cookie: `gvn_session=${SESSION_ID}`, origin: null })).ok).toBe(true);
  });

  test('in development, loopback origins are allowed on any port', () => {
    process.env.NODE_ENV = 'development';

    expect(isAllowedOrigin('http://localhost:3000')).toBe(true);
    expect(isAllowedOrigin('http://localhost:5173')).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:3000')).toBe(true);
    expect(isAllowedOrigin('https://evil.example')).toBe(false);
  });

  test('in production with no allow-list, every browser origin is refused rather than guessed', () => {
    process.env.NODE_ENV = 'production';

    expect(isAllowedOrigin('http://localhost:3000')).toBe(false);
    expect(isAllowedOrigin('https://play3cr.example')).toBe(false);
    // Still not a browser, still not a CSWSH vector.
    expect(isAllowedOrigin(undefined)).toBe(true);
  });

  test('an unparseable Origin is refused', () => {
    process.env.NODE_ENV = 'development';

    expect(isAllowedOrigin('not a url')).toBe(false);
  });
});
