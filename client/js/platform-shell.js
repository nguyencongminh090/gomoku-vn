/**
 * platform-shell.js — Arena top nav + mobile tab bar for the platform pages
 * (rankings, profile, clubs; #189). Mirrors client/platform-arena-mockup.html:
 * sticky nav with link row, light/dark toggle, user chip; bottom tabs on mobile.
 *
 * Needs, in order: i18n.js, ui-mode.js, session.js. Builds DOM with
 * textContent only. The user chip is a member-only extra: it asks
 * /api/rankings/me for the username (guests / signed-out never call it).
 */

'use strict';

(function () {
  const t = (key) => (typeof window.t === 'function' ? window.t(key) : key);
  const SPRITE = '/assets/icons/phosphor-sprite.svg';
  const ITEMS = [
    { id: 'lobby', href: '/index.html', icon: 'ph-bold-house', key: 'shell.lobby' },
    { id: 'rankings', href: '/rankings.html', icon: 'ph-bold-trophy', key: 'lobby.rankings' },
    { id: 'clubs', href: '/clubs.html', icon: 'ph-regular-users-three', key: 'lobby.clubs' },
    { id: 'history', href: '/history.html', icon: 'ph-regular-clock-counter-clockwise', key: 'lobby.history' },
  ];

  function el(tag, text, cls) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }

  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', SPRITE + '#' + name);
    svg.appendChild(use);
    return svg;
  }

  function initials(name) {
    return String(name || '?').trim().slice(0, 2).toUpperCase();
  }

  function build(active) {
    const host = document.getElementById('pl-shell');
    if (!host) return;
    host.replaceChildren();

    const nav = el('header', undefined, 'pnav');
    const brand = el('a', undefined, 'pnav__brand');
    brand.href = '/index.html';
    const logo = document.createElement('img');
    logo.src = '/assets/brand/logo-mark.svg';
    logo.alt = '';
    logo.width = logo.height = 20;
    brand.append(logo, el('span', 'Play3CR'));

    const links = el('nav', undefined, 'pnav__links');
    links.setAttribute('aria-label', t('shell.nav'));
    for (const it of ITEMS) {
      const a = el('a', t(it.key));
      a.href = it.href;
      if (it.id === active) { a.className = 'is-active'; a.setAttribute('aria-current', 'page'); }
      links.appendChild(a);
    }

    const right = el('div', undefined, 'pnav__right');
    const mode = el('button', undefined, 'pnav__mode');
    mode.type = 'button';
    mode.setAttribute('aria-label', t('shell.toggle_mode'));
    mode.textContent = '\u25D0'; // ◐ — the sprite has no sun/moon glyph
    mode.addEventListener('click', () => {
      if (window.setColorMode && window.getColorMode) window.setColorMode(window.getColorMode() === 'light' ? 'dark' : 'light');
    });
    right.appendChild(mode);
    if (typeof window.openSettingsPanel === 'function') {
      const gear = el('button', undefined, 'pnav__mode');
      gear.type = 'button';
      gear.setAttribute('aria-label', t('gset.title'));
      gear.appendChild(icon('ph-regular-gear-six'));
      gear.addEventListener('click', () => window.openSettingsPanel());
      right.appendChild(gear);
    }

    const user = window.GvnSession && window.GvnSession.getUser && window.GvnSession.getUser();
    if (user && !user.isGuest) {
      const me = el('a', undefined, 'pnav__me');
      me.href = '#';
      const av = el('span', initials(user.displayName), 'pav');
      const name = el('span', undefined, 'pnav__name');
      name.append(user.displayName);
      me.append(av, name);
      right.appendChild(me);
      fetch('/api/rankings/me', { credentials: 'same-origin' })
        .then((r) => (r.ok ? r.json() : null))
        .then((m) => { if (m && m.username) me.href = '/u/' + encodeURIComponent(m.username); })
        .catch(() => { /* chip stays inert */ });
    } else {
      const login = el('a', t('shell.login'), 'pnav__login');
      login.href = '/login.html';
      right.appendChild(login);
    }

    nav.append(brand, links, right);

    const tabbar = el('nav', undefined, 'ptabbar');
    tabbar.setAttribute('aria-label', t('shell.nav_mobile'));
    for (const it of ITEMS) {
      const a = el('a');
      a.href = it.href;
      if (it.id === active) { a.className = 'is-active'; a.setAttribute('aria-current', 'page'); }
      a.append(icon(it.icon), el('span', t(it.key)));
      tabbar.appendChild(a);
    }
    host.append(nav, tabbar);
  }

  /** Avatar circle: image if the member has one, else initials. cls e.g. 'pav--xl pav--sq'. */
  function avatar(url, name, cls) {
    const a = el('span', url ? '' : initials(name), 'pav' + (cls ? ' ' + cls : ''));
    if (url) a.style.backgroundImage = 'url("' + url + '")';
    a.setAttribute('aria-hidden', 'true');
    return a;
  }

  window.PlatformShell = { build, initials, avatar };
})();
