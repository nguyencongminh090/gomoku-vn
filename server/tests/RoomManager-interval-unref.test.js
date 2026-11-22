'use strict';
// Regression: the idle-scan interval must not hold the process open (jest --detectOpenHandles flagged it
// in every test that required server/socket/state).
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

test('RoomManager idle-scan interval is unref()d so it never keeps the process alive', () => {
  const spy = jest.spyOn(global, 'setInterval');
  jest.isolateModules(() => { require('../managers/RoomManager'); });
  const handle = spy.mock.results.find((r) => r.value && typeof r.value.hasRef === 'function');
  expect(handle).toBeDefined();
  expect(handle.value.hasRef()).toBe(false);
  spy.mockRestore();
});
