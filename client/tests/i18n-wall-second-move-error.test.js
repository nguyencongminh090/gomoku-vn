/**
 * TODO.md #103 follow-up — GameEngine.js's WALL-rule second-move check
 * (dc94b8f) sends `code: 'WALL_SECOND_MOVE_MIN_DISTANCE'` to the client.
 * room-socket.js's serverMessage() looks that up as
 * t('err.' + code.toLowerCase()) — the #103 merge added the server-side
 * check but never added the matching i18n key, so players hit by the rule
 * would see the raw key string ("err.wall_second_move_min_distance")
 * instead of a translated message, in both languages.
 *
 * @jest-environment jsdom
 */

'use strict';

function loadI18nModule() {
  jest.resetModules();
  localStorage.clear();
  require('../js/i18n.js');
}

describe('i18n key for WALL_SECOND_MOVE_MIN_DISTANCE (TODO.md #103 follow-up)', () => {
  const KEY = 'err.wall_second_move_min_distance';

  test('vi: translates to a real message, not the raw key', () => {
    loadI18nModule();
    window.setLanguage('vi');
    expect(window.t(KEY)).not.toBe(KEY);
    expect(window.t(KEY)).toMatch(/khoảng cách/);
  });

  test('en: translates to a real message, not the raw key', () => {
    loadI18nModule();
    window.setLanguage('en');
    expect(window.t(KEY)).not.toBe(KEY);
    expect(window.t(KEY)).toMatch(/distance/i);
  });
});
