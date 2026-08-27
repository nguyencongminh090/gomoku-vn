/**
 * TODO.md #161 / docs/todo/B161-gop-2-che-do-ui-lite-default-bo-pro.md
 *
 * The Density-Mode system was cut from three modes to two: 'pro' is gone, its
 * detail folded into 'default'. This guards:
 *   - ui-mode.js: MODES is exactly [lite, default]; a stored/attribute 'pro'
 *     normalises to 'default' (NOT the 'lite' whitelist-fallback); setUiMode
 *     rejects 'pro'.
 *   - ui-mode-preload.js: a stored 'pro' is rewritten to 'default' in
 *     localStorage and applied to <html> before first paint.
 *
 * jsdom for the same reason as client/tests/settings-panel-no-theme-row.test.js.
 *
 * @jest-environment jsdom
 */

'use strict';

function loadUiMode() {
  jest.resetModules();
  require('../js/ui-mode.js');
}

function loadPreload() {
  jest.resetModules();
  require('../js/ui-mode-preload.js');
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-ui-mode');
});

describe('ui-mode.js — two-mode system (TODO.md #161)', () => {
  test('getUiMode() defaults to lite when nothing is set', () => {
    loadUiMode();
    expect(window.getUiMode()).toBe('lite');
  });

  test('getUiMode() reads a valid attribute value', () => {
    document.documentElement.setAttribute('data-ui-mode', 'default');
    loadUiMode();
    expect(window.getUiMode()).toBe('default');
  });

  test('getUiMode() normalises a stale "pro" attribute to default, not lite', () => {
    document.documentElement.setAttribute('data-ui-mode', 'pro');
    loadUiMode();
    expect(window.getUiMode()).toBe('default');
  });

  test('getUiMode() falls back to lite for an unknown value', () => {
    document.documentElement.setAttribute('data-ui-mode', 'garbage');
    loadUiMode();
    expect(window.getUiMode()).toBe('lite');
  });

  test('setUiMode() switches between the two real modes and persists', () => {
    loadUiMode();
    window.setUiMode('default');
    expect(document.documentElement.getAttribute('data-ui-mode')).toBe('default');
    expect(localStorage.getItem('gvn_ui_mode')).toBe('default');
    window.setUiMode('lite');
    expect(document.documentElement.getAttribute('data-ui-mode')).toBe('lite');
    expect(localStorage.getItem('gvn_ui_mode')).toBe('lite');
  });

  test('setUiMode("pro") is rejected — not a valid mode any more', () => {
    document.documentElement.setAttribute('data-ui-mode', 'lite');
    loadUiMode();
    window.setUiMode('pro');
    expect(document.documentElement.getAttribute('data-ui-mode')).toBe('lite');
    expect(localStorage.getItem('gvn_ui_mode')).toBeNull();
  });

  test('setUiMode() fires uimodechange only on a real change', () => {
    document.documentElement.setAttribute('data-ui-mode', 'lite');
    loadUiMode();
    const handler = jest.fn();
    window.addEventListener('uimodechange', handler);
    window.setUiMode('lite');          // unchanged
    window.setUiMode('pro');           // invalid
    expect(handler).not.toHaveBeenCalled();
    window.setUiMode('default');       // real change
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail).toEqual({ mode: 'default' });
    window.removeEventListener('uimodechange', handler);
  });
});

describe('ui-mode-preload.js — one-time "pro" migration (TODO.md #161)', () => {
  test('stored "pro" is rewritten to "default" and applied to <html>', () => {
    localStorage.setItem('gvn_ui_mode', 'pro');
    loadPreload();
    expect(localStorage.getItem('gvn_ui_mode')).toBe('default');
    expect(document.documentElement.getAttribute('data-ui-mode')).toBe('default');
  });

  test('stored "default" is applied unchanged', () => {
    localStorage.setItem('gvn_ui_mode', 'default');
    loadPreload();
    expect(localStorage.getItem('gvn_ui_mode')).toBe('default');
    expect(document.documentElement.getAttribute('data-ui-mode')).toBe('default');
  });

  test('no stored value → lite, without writing localStorage', () => {
    loadPreload();
    expect(document.documentElement.getAttribute('data-ui-mode')).toBe('lite');
    expect(localStorage.getItem('gvn_ui_mode')).toBeNull();
  });

  test('an unknown stored value → lite', () => {
    localStorage.setItem('gvn_ui_mode', 'garbage');
    loadPreload();
    expect(document.documentElement.getAttribute('data-ui-mode')).toBe('lite');
  });
});
