// pwa-install.js — registers the service worker and shows a sticky "install the app" banner on the home page.
//   Chrome/Edge/Android: captures `beforeinstallprompt`, the button opens the native install dialog.
//   iOS Safari: no such event exists — the button reveals the "Share → Add to Home Screen" steps.
//   Hidden when already installed (standalone) or dismissed in the last DISMISS_DAYS days.
const DISMISS_KEY = 'play3cr_pwa_dismissed';
const DISMISS_DAYS = 14;

const t = (k) => (window.t ? window.t(k) : k);

export function isStandalone(win = window) {
  return !!((win.matchMedia && win.matchMedia('(display-mode: standalone)').matches) || win.navigator.standalone);
}

/** iPhone/iPad browser that can "Add to Home Screen": Safari, and Chrome/Edge/Firefox on iOS 16.4+.
 *  In-app webviews (Facebook, Instagram, Line, Zalo…) have no Share → Add to Home Screen, so they're excluded. */
export function isIosBrowser(ua = navigator.userAgent, maxTouch = navigator.maxTouchPoints) {
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouch > 1); // iPadOS reports as Mac
  return ios && /Safari/.test(ua) && !/FBAN|FBAV|Instagram|Line\/|Zalo|OPiOS/.test(ua);
}

export function wasDismissed(now = Date.now(), storage = window.localStorage) {
  try {
    const at = Number(storage.getItem(DISMISS_KEY));
    return !!at && now - at < DISMISS_DAYS * 86400000;
  } catch (_) { return false; }
}

function rememberDismissed(storage = window.localStorage) {
  try { storage.setItem(DISMISS_KEY, String(Date.now())); } catch (_) { /* private mode: banner returns next visit */ }
}

function buildBanner({ ios, onInstall, onClose }) {
  const el = document.createElement('aside');
  el.className = 'pwa-banner';
  el.setAttribute('role', 'region');
  el.setAttribute('aria-label', t('pwa.title'));
  el.innerHTML = `
    <img class="pwa-banner__icon" src="assets/pwa/icon-192.png" alt="" width="40" height="40">
    <div class="pwa-banner__text">
      <strong class="pwa-banner__title"></strong>
      <span class="pwa-banner__sub"></span>
    </div>
    <button type="button" class="pwa-banner__cta"></button>
    <button type="button" class="pwa-banner__close"></button>`;
  const q = (s) => el.querySelector(s);
  q('.pwa-banner__title').textContent = t('pwa.title');
  q('.pwa-banner__sub').textContent = t(ios ? 'pwa.sub_ios' : 'pwa.sub');
  q('.pwa-banner__cta').textContent = t(ios ? 'pwa.how' : 'pwa.install');
  const close = q('.pwa-banner__close');
  close.textContent = '×';
  close.setAttribute('aria-label', t('pwa.close'));
  q('.pwa-banner__cta').addEventListener('click', () => onInstall(el));
  close.addEventListener('click', onClose);
  return el;
}

export function initPwaInstall(win = window) {
  if ('serviceWorker' in win.navigator) {
    win.addEventListener('load', () => win.navigator.serviceWorker.register('sw.js').catch(() => {}), { once: true });
  }
  if (isStandalone(win) || wasDismissed()) return null;

  let deferred = null;
  let banner = null;
  const remove = () => { if (banner) { banner.remove(); banner = null; document.body.classList.remove('has-pwa-banner'); } };
  const show = (ios) => {
    if (banner) return;
    banner = buildBanner({
      ios,
      onClose: () => { rememberDismissed(); remove(); },
      onInstall: async (el) => {
        if (ios) { // steps are text; toggle them in place
          const sub = el.querySelector('.pwa-banner__sub');
          sub.textContent = t('pwa.steps_ios');
          el.querySelector('.pwa-banner__cta').hidden = true;
          return;
        }
        if (!deferred) return;
        deferred.prompt();
        const choice = await deferred.userChoice.catch(() => null);
        deferred = null;
        if (choice && choice.outcome === 'accepted') remove(); else { rememberDismissed(); remove(); }
      },
    });
    document.body.appendChild(banner);
    document.body.classList.add('has-pwa-banner');
  };

  win.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; show(false); });
  win.addEventListener('appinstalled', () => { deferred = null; remove(); });
  if (isIosBrowser()) show(true);
  return { remove };
}

initPwaInstall();
