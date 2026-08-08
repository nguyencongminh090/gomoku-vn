'use strict';

/**
 * auth-middleware-error-codes.test.js — Unit tests for `code` on
 * server/middleware/auth.js's verifyToken and server/middleware/
 * errorHandler.js's generic 500 (TODO.md #45 follow-up).
 *
 * These two were explicitly named in the original #45 audit
 * (docs/todo/B45-...md: "server/middleware/auth.js L33/41,
 * server/middleware/errorHandler.js L48 — cùng pattern") as sharing the same
 * data.error-only root cause as auth.js's login/register routes, but were
 * missed in the first pass at fixing that root cause. This pins that both
 * now carry a language-neutral `code` alongside the Vietnamese `error` text.
 */

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../db/database', () => ({
  createSession: jest.fn(),
  getSessionById: jest.fn(),
  revokeSession: jest.fn(() => ({ changes: 1 })),
  revokeSessionsForUser: jest.fn(() => ({ changes: 0 })),
  touchSession: jest.fn(),
  deleteExpiredSessions: jest.fn(() => ({ changes: 0 })),
}));

const db = require('../db/database');
const { verifyToken } = require('../middleware/auth');
const { errorHandler, AppError } = require('../middleware/errorHandler');

function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

const hourFromNow = () => new Date(Date.now() + 3600e3).toISOString();

beforeEach(() => {
  jest.clearAllMocks();
  db.getSessionById.mockReturnValue(undefined);
});

describe('verifyToken — error codes', () => {
  // Since TODO.md #68 this middleware reads a session cookie rather than a
  // Bearer JWT. The #45 contract it was written for is unchanged: every 401
  // still carries a language-neutral `code` next to the Vietnamese `error`.
  test('missing cookie → 401 AUTH_REQUIRED', () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    verifyToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    const body = res.json.mock.calls[0][0];
    expect(body.code).toBe('AUTH_REQUIRED');
    expect(body.error).toMatch(/đăng nhập/);
    expect(next).not.toHaveBeenCalled();
  });

  test('unknown/revoked/expired session → 401 AUTH_REQUIRED, indistinguishable from missing', () => {
    // Deliberately the SAME code as the missing-cookie case: telling "this id
    // was revoked" apart from "this id never existed" would confirm to a
    // caller that a guessed session id had once been real.
    const req = { headers: { cookie: 'gvn_session=no-such-session' } };
    const res = mockRes();
    const next = jest.fn();

    verifyToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0][0].code).toBe('AUTH_REQUIRED');
    expect(next).not.toHaveBeenCalled();
  });

  test('valid session → next() called, req.user set, no error response', () => {
    db.getSessionById.mockReturnValue({
      id: 'sid-1', user_id: 'u1', display_name: 'Alice', is_guest: 0,
      expires_at: hourFromNow(), revoked_at: null,
    });
    const req = { headers: { cookie: 'gvn_session=sid-1' } };
    const res = mockRes();
    const next = jest.fn();

    verifyToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user.userId).toBe('u1');
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('errorHandler — error codes', () => {
  test('unexpected (non-AppError) error → 500 SERVER_ERROR', () => {
    const req = { method: 'GET', path: '/api/whatever' };
    const res = mockRes();

    errorHandler(new Error('boom'), req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.code).toBe('SERVER_ERROR');
    expect(body.error).toMatch(/Lỗi máy chủ/);
  });

  test('an AppError still uses its own status/message, unaffected by the SERVER_ERROR fallback', () => {
    const req = { method: 'GET', path: '/api/whatever' };
    const res = mockRes();

    errorHandler(new AppError(404, 'Không tìm thấy.'), req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toBe('Không tìm thấy.');
    expect(body.code).toBeUndefined();
  });
});
