'use strict';

/**
 * rating-integrity-worker.test.js — B384: the admin report is computed in a worker thread on its
 * own read-only connection, and is byte-identical to the synchronous one.
 */

jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const worker_threads = require('worker_threads');
const database = require('../db/database');
const service = require('../managers/RatingIntegrityService');

const NOW = '2026-10-10T00:00:00.000Z';
const user = (id, role = 'member') => database.db.prepare("INSERT INTO users (id, username, password_hash, display_name, created_at, role) VALUES (?, ?, 'x', ?, ?, ?)").run(id, id, id.toUpperCase(), NOW, role);
let gid = 0;
function game(a, b, sa) {
  gid += 1;
  const ins = database.db.prepare("INSERT INTO rating_history (user_id, category, game_id, opponent_id, score, rating_before, rating_after, rd_before, rd_after, created_at) VALUES (?, 'classic', ?, ?, ?, 1500, ?, 100, 100, ?)");
  ins.run(a, `g${gid}`, b, sa, 1500 + (sa === 1 ? 10 : -10), NOW);
  ins.run(b, `g${gid}`, a, 1 - sa, 1500 + (sa === 1 ? -10 : 10), NOW);
}

beforeAll(() => {
  user('adm', 'admin'); user('mem'); user('boost'); user('feeder');
  for (let i = 0; i < 12; i++) user(`bg${i}`);
  database.db.prepare("INSERT INTO friendships (user_a, user_b, requested_by, status, created_at) VALUES ('boost', 'feeder', 'boost', 'accepted', ?)").run(NOW);
  for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) { game(`bg${i}`, `bg${j}`, (i + j) % 2); game(`bg${i}`, `bg${j}`, 1 - ((i + j) % 2)); }
  for (let i = 0; i < 12; i++) game('boost', 'feeder', 1);
});

test('reportJson() resolves to the same report as the synchronous path', async () => {
  const json = await service.reportJson('adm');
  expect(typeof json).toBe('string');
  const out = JSON.parse(json);
  expect(out).toEqual(JSON.parse(JSON.stringify(service.report('adm'))));
  expect(out.pairs[0]).toMatchObject({ aName: 'BOOST', bName: 'FEEDER', friends: true });
});

test('the worker sees rows committed after an earlier report (fresh read-only connection each run)', async () => {
  const before = JSON.parse(await service.reportJson('adm')).population;
  user('late1'); user('late2');
  for (let i = 0; i < 3; i++) game('late1', 'late2', 1);
  expect(JSON.parse(await service.reportJson('adm')).population).toBe(before + 2);
});

test.each([['mem'], [null], [undefined]])('non-admin %p is refused synchronously, before any worker starts', (id) => {
  const spy = jest.spyOn(worker_threads, 'Worker');
  expect(() => service.reportJson(id)).toThrow(service.RatingIntegrityError);
  expect(spy).not.toHaveBeenCalled();
  spy.mockRestore();
});

test('concurrent requests share one worker; the next request starts a new one', async () => {
  const Real = worker_threads.Worker; // a class: the spy must call through with `new`
  const spy = jest.spyOn(worker_threads, 'Worker').mockImplementation((...args) => new Real(...args));
  const a = service.reportJson('adm');
  const b = service.reportJson('adm');
  expect(b).toBe(a);
  await a;
  expect(spy).toHaveBeenCalledTimes(1);
  await service.reportJson('adm');
  expect(spy).toHaveBeenCalledTimes(2);
  spy.mockRestore();
});

test('the worker cannot write: its connection is read-only', async () => {
  const n = () => database.db.prepare('SELECT COUNT(*) n FROM rating_history').get().n;
  const rows = n();
  await service.reportJson('adm');
  expect(n()).toBe(rows);
  expect(database.db.prepare('SELECT COUNT(*) n FROM ratings').get().n).toBe(0);
});
