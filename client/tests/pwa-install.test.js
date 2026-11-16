/**
 * PWA install banner (home): detection helpers + banner lifecycle.
 * @jest-environment jsdom
 */
'use strict';

const fs = require('fs');
const path = require('path');

const IOS_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IOS_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1';

const added = [];
const realAdd = window.addEventListener.bind(window);
window.addEventListener = (type, fn, opts) => { added.push([type, fn]); realAdd(type, fn, opts); };
afterEach(() => { for (const [t, fn] of added.splice(0)) window.removeEventListener(t, fn); });

async function load() {
  jest.resetModules();
  document.body.innerHTML = '';
  window.localStorage.clear();
  // Real module source, de-ESM'd (the repo's jest setup is CJS; see .claude/rules/testing.md).
  let src = fs.readFileSync(path.join(__dirname, '../js/pwa-install.js'), 'utf8')
    .replace(/^export /gm, '').replace(/^initPwaInstall\(\);\s*$/m, '');
  const mod = new Function(src + '\nreturn { isStandalone, isIosBrowser, wasDismissed, initPwaInstall };')();
  mod.initPwaInstall();
  return mod;
}

describe('pwa-install', () => {
  test('isIosBrowser: Safari + iOS Chrome/Edge/Firefox yes, in-app webview + desktop no', async () => {
    const m = await load();
    expect(m.isIosBrowser(IOS_SAFARI, 5)).toBe(true);
    expect(m.isIosBrowser(IOS_CHROME, 5)).toBe(true);
    expect(m.isIosBrowser(IOS_SAFARI.replace('Safari/604.1', 'Safari/604.1 Instagram 300.0'), 5)).toBe(false);
    expect(m.isIosBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', 0)).toBe(false); // real Mac
    expect(m.isIosBrowser('Mozilla/5.0 (X11; Linux x86_64) Chrome/120 Safari/537.36', 0)).toBe(false);
  });

  test('wasDismissed honours a 14-day window', async () => {
    const m = await load();
    const now = Date.now();
    window.localStorage.setItem('play3cr_pwa_dismissed', String(now - 2 * 86400000));
    expect(m.wasDismissed(now)).toBe(true);
    window.localStorage.setItem('play3cr_pwa_dismissed', String(now - 15 * 86400000));
    expect(m.wasDismissed(now)).toBe(false);
  });

  test('beforeinstallprompt shows banner; Install calls prompt(); appinstalled removes it', async () => {
    await load();
    const ev = new Event('beforeinstallprompt', { cancelable: true });
    ev.prompt = jest.fn();
    ev.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    const banner = document.querySelector('.pwa-banner');
    expect(banner).not.toBeNull();
    banner.querySelector('.pwa-banner__cta').click();
    expect(ev.prompt).toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.querySelector('.pwa-banner')).toBeNull();
  });

  test('close remembers dismissal', async () => {
    await load();
    const ev = new Event('beforeinstallprompt', { cancelable: true });
    window.dispatchEvent(ev);
    document.querySelector('.pwa-banner__close').click();
    expect(document.querySelector('.pwa-banner')).toBeNull();
    expect(window.localStorage.getItem('play3cr_pwa_dismissed')).toBeTruthy();
  });
});

describe('pwa wiring', () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  test('index.html links manifest + apple icon; manifest icons exist', () => {
    const html = read('index.html');
    expect(html).toMatch(/rel="manifest" href="manifest\.webmanifest"/);
    expect(html).toMatch(/css\/pwa-banner\.css/);
    const man = JSON.parse(read('manifest.webmanifest'));
    expect(man.display).toBe('standalone');
    for (const i of man.icons) expect(fs.existsSync(path.join(__dirname, '..', i.src))).toBe(true);
    expect(fs.existsSync(path.join(__dirname, '..', 'assets/pwa/apple-touch-icon.png'))).toBe(true);
  });
  test('service worker offline page exists and is the one precached', () => {
    expect(read('sw.js')).toMatch(/OFFLINE_URL = 'offline\.html'/);
    expect(fs.existsSync(path.join(__dirname, '..', 'offline.html'))).toBe(true);
  });
});
