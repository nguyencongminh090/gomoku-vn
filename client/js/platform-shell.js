/**
 * platform-shell.js — Arena top nav + mobile tab bar, one header site-wide
 * (rankings, profile, clubs #189; lobby, history, tournament B193). Mirrors client/platform-arena-mockup.html:
 * sticky nav with link row, light/dark toggle, user chip; bottom tabs on mobile.
 *
 * Needs, in order: i18n.js, ui-mode.js, session.js. Builds DOM with
 * textContent only. The user chip (members and guests) opens a menu (B211: Hồ sơ · Cài đặt · Quản trị · Đăng xuất);
 * for members it asks /api/rankings/me for the username and /api/admin/me for the staff entry (guests / signed-out never call them).
 * Members also get the notification bell (#198): /api/notifications polled every
 * 60 s while visible, plus live `notify:new` via PlatformShell.pushNotification.
 */

'use strict';

(function () {
  const t = (key, vars) => (typeof window.t === 'function' ? window.t(key, vars) : key);
  const SPRITE = '/assets/icons/phosphor-sprite.svg?v=260'; // ?v=: /assets is immutable-cached
  // Mockup nav (Chơi / Phòng / Giải đấu are the lobby's three screens, B195).
  const ITEMS = [
    { id: 'lobby', href: '/index.html', key: 'shell.lobby' },
    { id: 'rooms', href: '/index.html#rooms', key: 'shell.rooms' },
    { id: 'tournaments', href: '/index.html#tournaments', key: 'tabs.tournaments' },
    { id: 'rankings', href: '/rankings.html', key: 'lobby.rankings' },
    { id: 'clubs', href: '/clubs.html', key: 'lobby.clubs' },
    { id: 'learn', href: '/puzzles', key: 'shell.learn' },
  ];
  const TABS = [
    { id: 'lobby', href: '/index.html', icon: 'ph-bold-house', key: 'shell.lobby' },
    { id: 'rankings', href: '/rankings.html', icon: 'ph-regular-crown-simple', key: 'lobby.rankings' },
    { id: 'tournaments', href: '/index.html#tournaments', icon: 'ph-regular-trophy', key: 'shell.tournaments_short' },
    { id: 'clubs', href: '/clubs.html', icon: 'ph-regular-users-three', key: 'shell.clubs_short' },
    { id: 'me', href: '/login.html', icon: 'ph-regular-user-circle', key: 'shell.me' },
  ];
  const CATS = ['caro', 'standard', 'freestyle'];

  /** The member's most-played rating, e.g. "Caro VN 1612"; '' when unrated. */
  function bestRating(ratings) {
    let best = null;
    for (const c of CATS) {
      const r = ratings && ratings[c];
      if (r && (!best || r.games > best.r.games)) best = { c, r };
    }
    return best ? t('rankings.cat_' + best.c) + ' ' + Math.round(best.r.rating) : '';
  }

  function link(it, active, label) {
    const a = el('a', label);
    a.href = it.href;
    a.dataset.tab = it.id;
    if (it.id === active) { a.className = 'is-active'; a.setAttribute('aria-current', 'page'); }
    return a;
  }

  function el(tag, text, cls) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }

  /** Sun glyph for the colour-mode button (the sprite has no sun/moon): ring + 8 rays, stroke-drawn. */
  function sunIcon() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('viewBox', '0 0 256 256');
    svg.setAttribute('aria-hidden', 'true');
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('fill', 'none');
    g.setAttribute('stroke', 'currentColor');
    g.setAttribute('stroke-width', '16');
    g.setAttribute('stroke-linecap', 'round');
    const ring = document.createElementNS(ns, 'circle');
    ring.setAttribute('cx', '128'); ring.setAttribute('cy', '128'); ring.setAttribute('r', '56');
    g.appendChild(ring);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const ray = document.createElementNS(ns, 'line');
      ray.setAttribute('x1', (128 + 84 * Math.cos(a)).toFixed(1)); ray.setAttribute('y1', (128 + 84 * Math.sin(a)).toFixed(1));
      ray.setAttribute('x2', (128 + 104 * Math.cos(a)).toFixed(1)); ray.setAttribute('y2', (128 + 104 * Math.sin(a)).toFixed(1));
      g.appendChild(ray);
    }
    svg.appendChild(g);
    return svg;
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

  // ── Notification bell (#198 slice 2) ──
  const bell = { items: [], unread: 0, btn: null, badge: null, panel: null };
  const notifListeners = [];

  /** The notifications page (social.js) shows the same list the bell holds — one fetch, one poll. */
  const notifications = {
    onChange(fn) { notifListeners.push(fn); fn(bell.items, bell.unread); },
    text: (n) => t('notif.' + n.type, { name: n.payload && n.payload.from ? n.payload.from.displayName : '' }),
    target: (n) => notifTarget(n),
    markRead: (id) => markRead(id),
  };

  function notifTarget(n) {
    const from = n.payload && n.payload.from;
    if (n.type === 'friend_accepted' && from) return '/u/' + encodeURIComponent(from.username);
    if (n.type === 'challenge_accepted' && n.payload && n.payload.roomId) return '/room.html?id=' + encodeURIComponent(n.payload.roomId);
    if (n.type === 'dm' && from) return '/social.html#dm=' + encodeURIComponent(from.username);
    return '/social.html';
  }

  function renderBell() {
    for (const fn of notifListeners) fn(bell.items, bell.unread);
    if (!bell.btn) return;
    bell.badge.textContent = bell.unread > 99 ? '99+' : String(bell.unread);
    bell.badge.hidden = bell.unread === 0;
    bell.btn.setAttribute('aria-label', t('notif.title') + (bell.unread ? ' (' + bell.unread + ')' : ''));
    bell.panel.replaceChildren();
    const head = el('div', undefined, 'pbell__head');
    const readAll = el('button', t('notif.read_all'), 'pbell__link');
    readAll.type = 'button';
    readAll.disabled = bell.unread === 0;
    readAll.addEventListener('click', () => markRead(null));
    head.append(el('b', t('notif.title')), readAll);
    bell.panel.appendChild(head);
    if (!bell.items.length) bell.panel.appendChild(el('p', t('notif.empty'), 'pbell__empty'));
    for (const n of bell.items.slice(0, 8)) {
      const name = n.payload && n.payload.from ? n.payload.from.displayName : '';
      const a = el('a', t('notif.' + n.type, { name }), 'pbell__item' + (n.read ? '' : ' is-unread'));
      a.href = notifTarget(n);
      a.addEventListener('click', () => { if (!n.read) markRead(n.id); });
      bell.panel.appendChild(a);
    }
    const all = el('a', t('notif.open_social'), 'pbell__all');
    all.href = '/social.html';
    bell.panel.appendChild(all);
  }

  function markRead(id) {
    fetch('/api/notifications/read', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(id == null ? {} : { id }),
    }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d) return;
      bell.items.forEach((n) => { if (id == null || n.id === id) n.read = true; });
      bell.unread = d.unread;
      renderBell();
    }).catch(() => { /* next poll fixes it */ });
  }

  function refreshBell() {
    if (document.hidden) return Promise.resolve();
    return fetch('/api/notifications', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { bell.items = d.items; bell.unread = d.unread; renderBell(); } })
      .catch(() => { /* offline: keep what we have */ });
  }

  /** Live push from the socket (`notify:new`): put it on top without a refetch. */
  function pushNotification(n) {
    if (!bell.btn || !n) return;
    bell.items = [n].concat(bell.items.filter((x) => x.id !== n.id));
    bell.unread = typeof n.unread === 'number' ? n.unread : bell.unread + 1;
    renderBell();
  }

  function mountBell(right) {
    const wrap = el('div', undefined, 'pbell');
    const btn = el('button', undefined, 'pnav__mode pbell__btn');
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    btn.appendChild(icon('ph-regular-bell'));
    const badge = el('span', '0', 'pbell__badge');
    badge.hidden = true;
    btn.appendChild(badge);
    const panel = el('div', undefined, 'pbell__panel');
    panel.hidden = true;
    const toggle = (open) => {
      panel.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      if (open) refreshBell();
    };
    btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(panel.hidden); });
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) toggle(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) { toggle(false); btn.focus(); } });
    wrap.append(btn, panel);
    right.appendChild(wrap);
    Object.assign(bell, { btn, badge, panel });
    renderBell();
    refreshBell();
    if (!bell.timer) bell.timer = setInterval(refreshBell, 60000);
  }

  const chip = { av: null, name: '' };

  /** Show `url` (or initials when null) on the nav chip — called on load and right after an avatar change. */
  function setMyAvatar(url) {
    if (!chip.av) return;
    chip.av.textContent = url ? '' : initials(chip.name);
    chip.av.style.backgroundImage = url ? 'url("' + url + '")' : '';
  }

  /** User chip + dropdown (B211): Hồ sơ · Cài đặt · Quản trị (staff) · Đăng xuất; guests get Cài đặt · Tạo tài khoản. */
  function mountAccount(right, user) {
    const member = !user.isGuest;
    const wrap = el('div', undefined, 'pnav__acct');
    const me = el('button', undefined, 'pnav__me');
    me.type = 'button';
    me.setAttribute('aria-haspopup', 'true');
    me.setAttribute('aria-expanded', 'false');
    me.setAttribute('aria-label', t('shell.account_menu'));
    const name = el('span', undefined, 'pnav__name');
    const av = el('span', initials(user.displayName), 'pav');
    chip.av = av;
    chip.name = user.displayName;
    const sub = el('small', member ? t('shell.unrated') : t('nav.guest_badge')); // mockup always shows a second line
    name.append(user.displayName, sub);
    me.append(av, name, icon('ph-regular-caret-down'));

    const menu = el('div', undefined, 'pnav__menu');
    menu.hidden = true;
    menu.setAttribute('role', 'menu');
    const item = (tag, iconName, label, href) => {
      const n = el(tag, undefined, 'pnav__item');
      if (href) n.href = href; else n.type = 'button';
      n.setAttribute('role', 'menuitem');
      n.append(icon(iconName), el('span', label));
      return n;
    };
    const profile = member ? item('a', 'ph-regular-user-circle', t('shell.menu_profile'), '#') : null;
    const admin = member ? item('a', 'ph-regular-shield-check', t('shell.menu_admin'), '/admin') : null;
    if (admin) { admin.hidden = true; admin.classList.add('pnav__item--staff'); }
    menu.append(...[profile, item('a', 'ph-regular-gear-six', t('gset.title'), '/settings.html'), admin, el('hr')].filter(Boolean));
    if (member) {
      const out = item('button', 'ph-regular-sign-out', t('gset.btn_logout'));
      out.addEventListener('click', async () => {
        out.disabled = true;
        const ok = window.GvnSession && window.GvnSession.logout ? await window.GvnSession.logout() : false;
        if (ok) window.location.replace('/login.html'); else out.disabled = false;
      });
      menu.appendChild(out);
    } else {
      menu.appendChild(item('a', 'ph-regular-user-plus', t('gset.btn_create_account'), '/login.html'));
    }

    const toggle = (open) => {
      menu.hidden = !open;
      me.setAttribute('aria-expanded', String(open));
    };
    me.addEventListener('click', (e) => { e.stopPropagation(); toggle(menu.hidden); });
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) toggle(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { toggle(false); me.focus(); } });
    wrap.append(me, menu);
    right.appendChild(wrap);
    if (!member) return;

    fetch('/api/rankings/me', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => {
        if (!m) return;
        sub.textContent = bestRating(m.ratings) || t('shell.unrated');
        setMyAvatar(m.avatarUrl);
        if (m.username) {
          profile.href = '/u/' + encodeURIComponent(m.username);
          const tab = document.querySelector('.ptabbar a[data-tab="me"]');
          if (tab) tab.setAttribute('href', profile.getAttribute('href'));
        }
      })
      .catch(() => { /* chip stays inert */ });
    fetch('/api/admin/me', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((a) => { if (a && Array.isArray(a.permissions) && a.permissions.includes('admin.access')) admin.hidden = false; })
      .catch(() => { /* no staff entry */ });
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
    for (const it of ITEMS) links.appendChild(link(it, active, t(it.key)));

    const right = el('div', undefined, 'pnav__right');
    const mode = el('button', undefined, 'pnav__mode');
    mode.type = 'button';
    mode.setAttribute('aria-label', t('shell.toggle_mode'));
    mode.appendChild(sunIcon());
    mode.addEventListener('click', () => {
      if (window.setColorMode && window.getColorMode) window.setColorMode(window.getColorMode() === 'light' ? 'dark' : 'light');
    });
    const user = window.GvnSession && window.GvnSession.getUser && window.GvnSession.getUser();
    // Mockup order: [mode] [bell] [me ▾]. Settings lives in the chip menu (B211), not a gear.
    right.appendChild(mode);
    if (user && !user.isGuest) mountBell(right);
    if (user) {
      mountAccount(right, user);
    } else {
      const login = el('a', t('shell.login'), 'pnav__login');
      login.href = '/login.html';
      right.appendChild(login);
    }

    nav.append(brand, links, right);

    const tabbar = el('nav', undefined, 'ptabbar');
    tabbar.setAttribute('aria-label', t('shell.nav_mobile'));
    for (const it of TABS) {
      const a = link(it, active);
      if (it.id === 'me' && user && !user.isGuest) a.href = '#'; // set to /u/<name> once /me answers
      a.append(icon(it.icon), el('span', t(it.key)));
      tabbar.appendChild(a);
    }
    host.append(nav, tabbar);
    document.body.classList.add('pshell');
  }

  /** Move the active marker without rebuilding (lobby's Chơi ↔ Giải đấu tab switch). */
  function setActive(active) {
    document.querySelectorAll('.pnav__links a, .ptabbar a').forEach((a) => {
      const on = a.dataset.tab === active;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  /** Avatar circle: image if the member has one, else initials. cls e.g. 'pav--xl pav--sq'. */
  function avatar(url, name, cls) {
    const a = el('span', url ? '' : initials(name), 'pav' + (cls ? ' ' + cls : ''));
    if (url) a.style.backgroundImage = 'url("' + url + '")';
    a.setAttribute('aria-hidden', 'true');
    return a;
  }

  window.PlatformShell = { build, setActive, initials, avatar, icon, pushNotification, setMyAvatar, notifications };
})();
