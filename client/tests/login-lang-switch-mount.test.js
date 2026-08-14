/**
 * TODO.md #120 / docs/todo/B120-login-html-thieu-language-toggle-do-selector-cu-hong.md
 *
 * i18n.js's DOMContentLoaded auto-init has always tried to mount a language
 * switcher on the login page (createLangSwitcher()), but it targeted
 * `.card__logo` — a class that belonged to an older login page layout.
 * The current page-split/login-shell redesign never carried that class over,
 * so the switcher silently stopped mounting anything. Fixed by giving
 * login.html a dedicated `.login-lang-switch-row` container and pointing
 * i18n.js at that instead.
 *
 * jsdom's document is already past 'DOMContentLoaded' by the time a test
 * requires a module, so the event has to be dispatched manually to exercise
 * the auto-init block — same reasoning as client/tests/i18n-wall-second-move-
 * error.test.js for why this file is jsdom-based rather than needing a real
 * browser.
 *
 * @jest-environment jsdom
 */

'use strict';

function loadI18nModule() {
  jest.resetModules();
  localStorage.clear();
  require('../js/i18n.js');
  document.dispatchEvent(new Event('DOMContentLoaded', { bubbles: true, cancelable: true }));
}

describe('login.html language switcher mount point (TODO.md #120)', () => {
  test('mounts a .lang-switch button inside .login-lang-switch-row when present', () => {
    document.body.innerHTML = '<div class="login-lang-switch-row"></div>';
    loadI18nModule();

    const mount = document.querySelector('.login-lang-switch-row');
    const btn = mount.querySelector('.lang-switch');
    expect(btn).not.toBeNull();
    expect(btn.id).toBe('btn-lang');
  });

  test('the old .card__logo selector no longer mounts anything (regression check for the dead selector)', () => {
    document.body.innerHTML = '<div class="card__logo"></div>';
    loadI18nModule();

    expect(document.querySelector('.card__logo .lang-switch')).toBeNull();
  });

  test('does not throw when neither mount point is present (e.g. authenticated pages)', () => {
    document.body.innerHTML = '<div id="unrelated"></div>';
    expect(() => loadI18nModule()).not.toThrow();
  });

  test('clicking the button toggles the language and updates its own label', () => {
    document.body.innerHTML = '<div class="login-lang-switch-row"></div>';
    loadI18nModule();

    const btn = document.querySelector('.login-lang-switch-row .lang-switch');
    const initialText = btn.textContent;
    btn.click();

    expect(btn.textContent).not.toBe(initialText);
    expect(['EN', 'VI']).toContain(btn.textContent);
  });
});
