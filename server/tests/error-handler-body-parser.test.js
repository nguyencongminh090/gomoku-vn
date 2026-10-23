'use strict';

/** #349: express.json() failures are 4xx and not logged as unhandled errors. */

const express = require('express');
const logger = require('../utils/logger');
const { errorHandler } = require('../middleware/errorHandler');

let server;
afterEach(() => new Promise((r) => (server ? server.close(r) : r())));

async function call(app, method, path, body) {
  server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers: { 'content-type': 'application/json' }, body,
  });
  return { status: res.status, body: await res.json() };
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.post('/echo', (req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  return app;
}

describe('errorHandler — body-parser errors', () => {
  let errSpy;
  beforeEach(() => { errSpy = jest.spyOn(logger, 'error').mockImplementation(() => {}); jest.spyOn(logger, 'warn').mockImplementation(() => {}); });
  afterEach(() => jest.restoreAllMocks());

  test('oversized body → 413 PAYLOAD_TOO_LARGE', async () => {
    const res = await call(makeApp(), 'POST', '/echo', JSON.stringify({ a: 'x'.repeat(300000) }));
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
    expect(errSpy).not.toHaveBeenCalled();
  });

  test('malformed JSON → 400 BODY_INVALID', async () => {
    const res = await call(makeApp(), 'POST', '/echo', '{bad');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BODY_INVALID');
    expect(errSpy).not.toHaveBeenCalled();
  });

  test('unexpected error still 500 and logged', async () => {
    const app = express();
    app.get('/boom', () => { throw new Error('boom'); });
    app.use(errorHandler);
    const res = await call(app, 'GET', '/boom');
    expect(res.status).toBe(500);
    expect(errSpy).toHaveBeenCalled();
  });
});
