/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PRELOAD = fs.readFileSync(path.join(ROOT, 'js/login-light-preload.js'), 'utf8');
const LOGIN_HTML = fs.readFileSync(path.join(ROOT, 'login.html'), 'utf8');

describe('login page is always light', () => {
  it('forces data-mode=light even when the stored mode is dark, without persisting', () => {
    document.documentElement.setAttribute('data-mode', 'dark');
    localStorage.setItem('gvn_color_mode', 'dark');
    window.eval(PRELOAD);
    expect(document.documentElement.getAttribute('data-mode')).toBe('light');
    expect(localStorage.getItem('gvn_color_mode')).toBe('dark');
  });

  it('login.html loads the override after skin-preload.js', () => {
    const skin = LOGIN_HTML.indexOf('js/skin-preload.js');
    const light = LOGIN_HTML.indexOf('js/login-light-preload.js');
    expect(skin).toBeGreaterThan(-1);
    expect(light).toBeGreaterThan(skin);
  });
});
