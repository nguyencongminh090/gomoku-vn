'use strict';

/**
 * settings-panel.js — Global Settings entry point, shared by every
 * authenticated page (index.html, room.html, history.html).
 *
 * Replaces what used to be four separate topnav icon buttons (UI density,
 * theme, language, logout) with a single gear icon that opens one panel.
 * Consolidates logic that was previously split across inline page scripts,
 * ui-mode.js's switcher UI, and i18n.js's createLangSwitcher, and adds a
 * Sound toggle + default placement-mode control that had no UI anywhere
 * despite already being fully implemented (audio-manager.js, room.js).
 *
 * Mounted once per page load; injects its own trigger button into
 * `.topnav__right` so no page needs to hand-author the markup.
 */

(function(global) {
  const CLICK_MODE_KEY = 'gomoku_click_mode';

  function T(key, vars) {
    return typeof global.t === 'function' ? global.t(key, vars) : key;
  }

  // ── User info ────────────────────────────────────────────────────────────
  // This used to be a second, near-identical copy of socket-client.js's JWT
  // decode. Both are gone (TODO.md #68): the credential is an HttpOnly cookie
  // now, so there is nothing to decode, and both call sites read the one
  // shared cache in session.js instead. Keeping two copies of identity logic
  // was the single most likely way for this change to go wrong — fix one,
  // forget the other.
  function getUserInfo() {
    return global.GvnSession.getUser();
  }

  // Logout is a network call now (the session lives server-side), so it can
  // fail. On failure the user is still signed in and must be told so, rather
  // than being sent to the login page as though it had worked.
  async function logout(ev) {
    const btn = ev && ev.currentTarget;
    if (btn) btn.disabled = true;
    const ok = await global.GvnSession.logout();
    if (ok) {
      global.location.replace('login.html');
      return;
    }
    if (btn) {
      btn.disabled = false;
      btn.textContent = T('gset.btn_logout_failed');
    }
  }

  // ── Theme ───────────────────────────────────────────────────────────────
  function getTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('theme', theme); } catch (e) { /* private mode */ }
  }

  // ── Sound ───────────────────────────────────────────────────────────────
  function isSoundOn() {
    return !(global.audioManager && global.audioManager.isMuted);
  }

  function setSoundOn(on) {
    if (global.audioManager) global.audioManager.setMute(!on);
  }

  // ── Default placement mode (personal default; the active room's own
  //    Settings tab remains authoritative for a game already in progress) ──
  function getClickMode() {
    const v = localStorage.getItem(CLICK_MODE_KEY);
    return v === 'single' ? 'single' : 'double';
  }

  function setClickMode(mode) {
    try { localStorage.setItem(CLICK_MODE_KEY, mode); } catch (e) { /* private mode */ }
    // Live-sync an already-open room (see room-ui.js's 'clickmodechange'
    // listener), matching how ui-mode.js/i18n.js already broadcast changes.
    global.dispatchEvent(new CustomEvent('clickmodechange', { detail: { mode } }));
  }

  // Exported so pages without their own RoomState-style store (e.g.
  // tournament-match.js — TODO.md #55) can read the same setting instead of
  // duplicating the 'gomoku_click_mode' localStorage key a 3rd time.
  global.getClickMode = getClickMode;

  // ── Panel DOM ───────────────────────────────────────────────────────────
  let overlayEl = null;

  function segment(options, activeValue, onPick) {
    const wrap = document.createElement('div');
    wrap.className = 'gset-segment';
    options.forEach(([value, label]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gset-segment__opt' + (value === activeValue ? ' is-active' : '');
      btn.textContent = label;
      btn.setAttribute('aria-pressed', String(value === activeValue));
      btn.addEventListener('click', () => onPick(value));
      wrap.appendChild(btn);
    });
    return wrap;
  }

  function toggleRow(labelText, checked, onChange) {
    const row = document.createElement('div');
    row.className = 'gset-row';

    const label = document.createElement('span');
    label.className = 'gset-row__label';
    label.textContent = labelText;

    const toggle = document.createElement('label');
    toggle.className = 'gset-toggle';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', () => onChange(input.checked));
    const slider = document.createElement('span');
    slider.className = 'gset-toggle__slider';
    toggle.appendChild(input);
    toggle.appendChild(slider);

    row.appendChild(label);
    row.appendChild(toggle);
    return row;
  }

  function group(titleText, children) {
    const section = document.createElement('section');
    section.className = 'gset-group';
    const title = document.createElement('div');
    title.className = 'gset-group__title';
    title.textContent = titleText;
    section.appendChild(title);
    children.forEach(child => section.appendChild(child));
    return section;
  }

  function renderPanel() {
    const body = document.createElement('div');
    body.className = 'gset-panel__body';

    // Appearance: theme + UI density
    const themeRow = document.createElement('div');
    themeRow.className = 'gset-row';
    const themeLabel = document.createElement('span');
    themeLabel.className = 'gset-row__label';
    themeLabel.textContent = T('gset.theme');
    themeRow.appendChild(themeLabel);
    themeRow.appendChild(segment(
      [['light', T('gset.theme_light')], ['dark', T('gset.theme_dark')]],
      getTheme(),
      (value) => { setTheme(value); renderInto(overlayEl.querySelector('.gset-panel__body')); }
    ));

    const densityRow = document.createElement('div');
    densityRow.className = 'gset-row';
    const densityLabel = document.createElement('span');
    densityLabel.className = 'gset-row__label';
    densityLabel.textContent = T('gset.density');
    densityRow.appendChild(densityLabel);
    densityRow.appendChild(segment(
      [['lite', T('mode.lite')], ['default', T('mode.default')], ['pro', T('mode.pro')]],
      global.getUiMode ? global.getUiMode() : 'lite',
      (value) => { if (global.setUiMode) global.setUiMode(value); renderInto(overlayEl.querySelector('.gset-panel__body')); }
    ));

    body.appendChild(group(T('gset.appearance'), [themeRow, densityRow]));

    // Language
    const langRow = document.createElement('div');
    langRow.className = 'gset-row';
    const langLabel = document.createElement('span');
    langLabel.className = 'gset-row__label';
    langLabel.textContent = T('gset.language');
    langRow.appendChild(langLabel);
    langRow.appendChild(segment(
      [['vi', T('gset.lang_vi')], ['en', T('gset.lang_en')]],
      typeof global.getLanguage === 'function' ? global.getLanguage() : 'vi',
      (value) => {
        if (typeof global.setLanguage === 'function') global.setLanguage(value);
        renderInto(overlayEl.querySelector('.gset-panel__body'));
        overlayEl.querySelector('.gset-panel__title').textContent = T('gset.title');
      }
    ));
    body.appendChild(group(T('gset.language'), [langRow]));

    // Game: sound + default placement mode
    body.appendChild(group(T('gset.game'), [
      toggleRow(T('settings.sound'), isSoundOn(), (on) => setSoundOn(on)),
      (() => {
        const row = document.createElement('div');
        row.className = 'gset-row';
        const label = document.createElement('span');
        label.className = 'gset-row__label';
        label.textContent = T('gset.click_mode_default');
        row.appendChild(label);
        row.appendChild(segment(
          [['single', T('settings.click_single')], ['double', T('settings.click_double')]],
          getClickMode(),
          (value) => { setClickMode(value); renderInto(overlayEl.querySelector('.gset-panel__body')); }
        ));
        return row;
      })(),
    ]));

    // Account
    const userInfo = getUserInfo();
    const accountChildren = [];
    if (userInfo) {
      const userRow = document.createElement('div');
      userRow.className = 'gset-account__user';
      const name = document.createElement('span');
      name.className = 'gset-account__name';
      name.textContent = userInfo.displayName || '';
      userRow.appendChild(name);
      if (userInfo.isGuest) {
        const badge = document.createElement('span');
        badge.className = 'topnav__badge';
        badge.textContent = T('nav.guest_badge');
        userRow.appendChild(badge);
      }
      accountChildren.push(userRow);

      if (userInfo.isGuest) {
        const hint = document.createElement('div');
        hint.className = 'gset-account__hint';
        hint.textContent = T('gset.guest_hint');
        accountChildren.push(hint);
      }

      const actions = document.createElement('div');
      actions.className = 'gset-account__actions';
      if (userInfo.isGuest) {
        const createAcct = document.createElement('a');
        createAcct.href = 'login.html';
        createAcct.className = 'gset-btn gset-btn--primary';
        createAcct.textContent = T('gset.btn_create_account');
        actions.appendChild(createAcct);
      }
      const logoutBtn = document.createElement('button');
      logoutBtn.type = 'button';
      logoutBtn.className = 'gset-btn gset-btn--secondary';
      logoutBtn.textContent = T('gset.btn_logout');
      logoutBtn.addEventListener('click', logout);
      actions.appendChild(logoutBtn);
      accountChildren.push(actions);
    }
    if (accountChildren.length) {
      body.appendChild(group(T('gset.account'), accountChildren));
    }

    return body;
  }

  function renderInto(oldBody) {
    const newBody = renderPanel();
    oldBody.replaceWith(newBody);
  }

  function buildOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'gset-overlay';
    overlay.id = 'gset-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const panel = document.createElement('div');
    panel.className = 'gset-panel';

    const header = document.createElement('div');
    header.className = 'gset-panel__header';
    const title = document.createElement('div');
    title.className = 'gset-panel__title';
    title.textContent = T('gset.title');
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'gset-panel__close';
    closeBtn.setAttribute('aria-label', T('modal.close'));
    closeBtn.innerHTML = '&#10005;';
    closeBtn.addEventListener('click', closePanel);
    header.appendChild(title);
    header.appendChild(closeBtn);

    panel.appendChild(header);
    panel.appendChild(renderPanel());
    overlay.appendChild(panel);

    overlay.addEventListener('click', (e) => { if (e.target === overlay) closePanel(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('visible')) closePanel();
    });

    document.body.appendChild(overlay);
    return overlay;
  }

  function openPanel() {
    if (!overlayEl) overlayEl = buildOverlay();
    // Refresh content each time so it reflects state changed elsewhere
    // (e.g. theme toggled via OS preference, mode changed on another tab).
    overlayEl.querySelector('.gset-panel__title').textContent = T('gset.title');
    renderInto(overlayEl.querySelector('.gset-panel__body'));
    overlayEl.classList.add('visible');
  }

  function closePanel() {
    if (overlayEl) overlayEl.classList.remove('visible');
  }

  function mountTrigger() {
    const right = document.querySelector('.topnav__right');
    if (!right) return;
    const btn = document.createElement('button');
    btn.id = 'btn-settings';
    btn.type = 'button';
    btn.className = 'topnav__btn topnav__btn--icon';
    btn.setAttribute('aria-label', T('gset.title'));
    btn.title = T('gset.title');
    btn.innerHTML = '<i class="ph ph-gear-six" style="font-size: 20px;"></i>';
    btn.addEventListener('click', openPanel);
    right.appendChild(btn);
  }

  document.addEventListener('DOMContentLoaded', mountTrigger);

  global.openSettingsPanel = openPanel;

})(window);
