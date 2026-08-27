/**
 * TODO.md #160 / docs/todo/B160-go-bo-dark-ui-mode.md
 *
 * Dark UI Mode was removed entirely: the Light/Dark segment in the global
 * Settings panel, its getTheme()/setTheme() helpers, theme-preload.js, the
 * i18n keys, and the [data-theme="dark"] CSS blocks all went away.
 *
 * This guards the client-visible half of that removal — the Settings panel
 * must still render (Appearance group with the UI-density control, Language,
 * Account), must NOT render any theme control, and must never write
 * localStorage['theme'].
 *
 * jsdom rather than a real browser for the same reason as
 * client/tests/login-lang-switch-mount.test.js.
 *
 * @jest-environment jsdom
 */

'use strict';

function loadSettingsPanel() {
  jest.resetModules();
  localStorage.clear();

  // Minimal stubs the module reads.
  window.t = (key) => key;                       // i18n passthrough → labels are their keys
  window.GvnSession = { getUser: () => ({ displayName: 'Tester', isGuest: false }) };
  window.getUiMode = () => 'lite';
  window.setUiMode = jest.fn();
  window.getLanguage = () => 'vi';
  window.setLanguage = jest.fn();

  document.body.innerHTML = '<nav class="topnav"><div class="topnav__right"></div></nav>';
  require('../js/settings-panel.js');
  document.dispatchEvent(new Event('DOMContentLoaded', { bubbles: true, cancelable: true }));
}

function openPanelText() {
  window.openSettingsPanel();
  return document.querySelector('.gset-overlay').textContent;
}

describe('Settings panel after Dark UI removal (TODO.md #160)', () => {
  test('opening the panel does not throw and renders an overlay', () => {
    loadSettingsPanel();
    expect(() => window.openSettingsPanel()).not.toThrow();
    expect(document.querySelector('.gset-overlay')).not.toBeNull();
  });

  test('no theme control is rendered (no gset.theme* labels, no Light/Dark segment)', () => {
    loadSettingsPanel();
    const text = openPanelText();
    expect(text).not.toContain('gset.theme');
    expect(text).not.toContain('gset.theme_light');
    expect(text).not.toContain('gset.theme_dark');

    const segmentLabels = [...document.querySelectorAll('.gset-segment__opt')].map(b => b.textContent);
    expect(segmentLabels).not.toContain('gset.theme_light');
    expect(segmentLabels).not.toContain('gset.theme_dark');
  });

  test('the Appearance group still renders the UI-density control', () => {
    loadSettingsPanel();
    const text = openPanelText();
    expect(text).toContain('gset.appearance');
    expect(text).toContain('gset.density');
    const segmentLabels = [...document.querySelectorAll('.gset-segment__opt')].map(b => b.textContent);
    expect(segmentLabels).toEqual(expect.arrayContaining(['mode.lite', 'mode.default', 'mode.pro']));
  });

  test('opening the panel never writes localStorage["theme"]', () => {
    loadSettingsPanel();
    openPanelText();
    // exercise a re-render via the density control too
    const firstDensityOpt = document.querySelector('.gset-segment__opt');
    if (firstDensityOpt) firstDensityOpt.click();
    expect(localStorage.getItem('theme')).toBeNull();
  });

  test('setTheme / getTheme are not exposed on window', () => {
    loadSettingsPanel();
    expect(window.setTheme).toBeUndefined();
    expect(window.getTheme).toBeUndefined();
  });
});
