'use strict';
// #433 regression: the tournament deadline-sweep interval must not hold the process open
// (jest --detectOpenHandles flagged it in every test that required SocketHandler/TournamentManager).
jest.mock('../utils/logger', () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }));

test('tournamentState deadline-sweep interval is unref()d so it never keeps the process alive', () => {
  const spy = jest.spyOn(global, 'setInterval');
  let mod;
  jest.isolateModules(() => { mod = require('../socket/tournamentState'); });
  const handle = spy.mock.results.find((r) => r.value && typeof r.value.hasRef === 'function');
  expect(handle).toBeDefined();
  expect(handle.value.hasRef()).toBe(false);
  spy.mockRestore();
  mod.shutdown();
});
