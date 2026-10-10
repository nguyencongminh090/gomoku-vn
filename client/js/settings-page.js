/**
 * settings-page.js — /settings.html tabs (B211): Hồ sơ (settings.js) | Giao diện | Trò chơi | Tài khoản.
 * The last three work for guests and signed-out visitors too; Hồ sơ is hidden for them. Controls drive the
 * same stores as the in-room gear panel (ui-mode.js / i18n.js / GvnSettings from settings-panel.js), so the
 * room page keeps working. Icon-first segmented controls: every button carries an aria-label + title.
 * Builds DOM with textContent only.
 */
(function () {
  const t = (key, vars) => (typeof window.t === 'function' ? window.t(key, vars) : key);
  const SPRITE = '/assets/icons/phosphor-sprite.svg';
  const TABS = ['profile', 'look', 'game', 'account'];
  const S = () => window.GvnSettings || {};

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
    use.setAttribute('href', SPRITE + '#ph-regular-' + name);
    svg.appendChild(use);
    return svg;
  }

  /** options: [value, label, iconName?] — icon-only button when an icon is given, text otherwise. */
  function segment(options, active, onPick) {
    const wrap = el('div', undefined, 'pseg');
    wrap.setAttribute('role', 'group');
    for (const [value, label, ic] of options) {
      const b = el('button', ic ? undefined : label, 'pseg__opt' + (value === active ? ' is-active' : ''));
      b.type = 'button';
      b.setAttribute('aria-pressed', String(value === active));
      b.setAttribute('aria-label', label);
      b.title = label;
      if (ic) b.appendChild(icon(ic));
      b.addEventListener('click', () => { onPick(value); render(); });
      wrap.appendChild(b);
    }
    return wrap;
  }

  function row(iconName, label, control, hint) {
    const r = el('div', undefined, 'psrow');
    const lab = el('div', undefined, 'psrow__t');
    lab.append(el('span', label));
    if (hint) lab.appendChild(el('small', hint));
    r.append(icon(iconName), lab, control);
    return r;
  }

  function toggle(label, checked, onChange) {
    const w = el('label', undefined, 'pswitch');
    const i = document.createElement('input');
    i.type = 'checkbox';
    i.checked = checked;
    i.setAttribute('aria-label', label);
    i.addEventListener('change', () => onChange(i.checked));
    w.append(i, el('span'));
    return w;
  }

  const call = (name, ...args) => (typeof window[name] === 'function' ? window[name](...args) : undefined);

  function renderLook(host) {
    host.replaceChildren(
      row('swatches', t('settings.row_skin'), segment(
        [['arena', t('gset.skin_arena')], ['zen', t('gset.skin_zen')], ['bento', t('gset.skin_bento')]],
        call('getSkin') || 'arena', (v) => call('setSkin', v))),
      // Row icon is the theme concept (circle-half), not a copy of the sun option inside it (#214).
      row('circle-half', t('settings.row_mode'), segment(
        [['light', t('gset.mode_light'), 'sun'], ['dark', t('gset.mode_dark'), 'moon']],
        call('getColorMode') || 'dark', (v) => call('setColorMode', v))),
      row('rows', t('gset.density'), segment(
        // Text, not rows / list-dashes icons: their meaning is not guessable (#214, iconography.md rule 4).
        [['default', t('mode.default')], ['lite', t('mode.lite')]],
        call('getUiMode') || 'lite', (v) => call('setUiMode', v))),
      row('translate', t('gset.language'), segment(   // globe = country (Hồ sơ tab); one icon per concept (#214)
        [['vi', 'VI'], ['en', 'EN']], call('getLanguage') || 'vi', (v) => call('setLanguage', v))),
    );
  }

  function renderGame(host) {
    const g = S();
    host.replaceChildren(
      row('cursor-click', t('gset.click_mode_default'), segment(
        [['single', t('settings.click_single')], ['double', t('settings.click_double')]],
        g.getClickMode ? g.getClickMode() : 'double', (v) => g.setClickMode && g.setClickMode(v)), t('settings.row_click_hint')),
      row('checkerboard', t('gset.display_mode'), segment(
        [['paper', t('settings.display_paper')], ['stone', t('settings.display_stone')]],
        g.getDisplayMode ? g.getDisplayMode() : 'paper', (v) => g.setDisplayMode && g.setDisplayMode(v))),
      row('speaker-high', t('settings.sound'), toggle(t('settings.sound'), g.isSoundOn ? g.isSoundOn() : true, (on) => g.setSoundOn && g.setSoundOn(on))),
    );
  }

  function renderAccount(host) {
    const user = window.GvnSession && window.GvnSession.getUser && window.GvnSession.getUser();
    const kids = [];
    if (!user) {
      const a = el('a', undefined, 'pbtn pbtn--primary');
      a.href = '/login.html';
      a.append(icon('user-plus'), el('span', t('shell.login')));
      kids.push(row('user-circle', t('settings.login_hint'), a));
    } else if (user.isGuest) {
      const a = el('a', undefined, 'pbtn pbtn--primary');
      a.href = '/login.html';
      a.append(icon('user-plus'), el('span', t('gset.btn_create_account')));
      kids.push(row('user-circle', (user.displayName || '') + ' · ' + t('nav.guest_badge'), a, t('gset.guest_hint')));
    }
    if (user && !user.isGuest) {
      const out = el('button', undefined, 'pbtn pbtn--danger');
      out.type = 'button';
      out.append(icon('sign-out'), el('span', t('gset.btn_logout')));
      out.addEventListener('click', async () => {
        out.disabled = true;
        const ok = await window.GvnSession.logout();
        if (ok) { window.location.replace('/login.html'); return; }
        out.disabled = false;
        out.lastChild.textContent = t('gset.btn_logout_failed');
      });
      kids.push(row('user-circle', t('settings.signed_in_as', { name: user.displayName || '' }), out));
    }
    host.replaceChildren(...kids);
  }

  function render() {
    renderLook(document.getElementById('p-look'));
    renderGame(document.getElementById('p-game'));
    renderAccount(document.getElementById('p-account'));
  }

  function isGuest() {
    const u = window.GvnSession && window.GvnSession.getUser && window.GvnSession.getUser();
    return !u || !!u.isGuest;
  }

  function select(name, { focus } = {}) {
    for (const id of TABS) {
      const on = id === name;
      const tab = document.getElementById('tab-' + id);
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      document.getElementById('p-' + id).hidden = !on;
      if (on && focus) tab.focus();
    }
    if (history.replaceState) history.replaceState(null, '', '#' + name);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const guest = isGuest();
    const visible = TABS.filter((id) => !(guest && id === 'profile'));
    if (guest) document.getElementById('tab-profile').hidden = true;
    const from = (location.hash || '').slice(1);
    select(visible.includes(from) ? from : visible[0]);
    const tabs = document.getElementById('st-tabs');
    tabs.addEventListener('click', (e) => {
      const b = e.target.closest('.ptab');
      if (b) select(b.dataset.p);
    });
    tabs.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const cur = visible.indexOf(document.querySelector('.ptab[aria-selected="true"]').dataset.p);
      const next = visible[(cur + (e.key === 'ArrowRight' ? 1 : visible.length - 1)) % visible.length];
      select(next, { focus: true });
    });
    render();
    window.addEventListener('langchange', render);
    window.addEventListener('colormodechange', render);
  });
})();
