/**
 * settings.js — /settings.html (#199): own profile + privacy. REST only (no socket: a second
 * live socket would evict the one in the lobby). Reads /api/rankings/me → /api/profile/:username
 * (isSelf gives bio, avatar and `privacy`), writes PUT /api/profile and the avatar endpoints.
 * Profile tab only; Giao diện / Trò chơi / Tài khoản tabs live in settings-page.js (B211) and work for guests.
 * All text goes through textContent / option.textContent.
 */
(function () {
  const t = (key, vars) => (typeof window.t === 'function' ? window.t(key, vars) : key);
  const $ = (id) => document.getElementById(id);
  const SHELL = () => window.PlatformShell;
  const lang = () => document.documentElement.lang || 'vi';

  const AUDIENCE = { whoCanDm: ['everyone', 'friends', 'nobody'], whoCanChallenge: ['everyone', 'friends', 'nobody'], whoCanFriend: ['everyone', 'nobody'] };
  let me = null;

  function fillSelect(sel, values, labelOf, current) {
    sel.replaceChildren();
    for (const [v, text] of values.map((x) => [x, labelOf(x)])) {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = text;
      sel.appendChild(o);
    }
    sel.value = current;
  }

  function fillCountry(current) {
    const sel = $('st-country');
    const rows = [['', t('settings.country_none')]].concat(window.Countries.options(lang()).map((c) => [c.code, c.name]));
    fillSelect(sel, rows.map((r) => r[0]), (v) => rows.find((r) => r[0] === v)[1], current || '');
  }

  function setAvatar(url, name) {
    $('st-avatar').replaceWith(Object.assign(SHELL().avatar(url, name, 'pav--xl'), { id: 'st-avatar' }));
  }

  // Uploading/removing is saved server-side at once, so the nav chip follows at once (no reload).
  function avatarChanged(url) {
    setAvatar(url, me.displayName);
    if (SHELL().setMyAvatar) SHELL().setMyAvatar(url);
  }

  function fill(p) {
    me = p;
    const pr = p.privacy || {};
    setAvatar(p.avatarUrl, p.displayName);
    $('st-bio').value = p.bio || '';
    fillCountry(pr.country);
    $('st-city').value = pr.city || '';
    $('st-hide-history').checked = !!pr.hideHistory;
    $('st-hide-bio').checked = !!pr.hideBio;
    $('st-hide-online').checked = !!pr.hideOnline;
    for (const sel of document.querySelectorAll('select[data-aud]')) {
      const key = sel.dataset.aud;
      fillSelect(sel, AUDIENCE[key], (v) => t('settings.aud_' + v), pr[key] || 'everyone');
    }
    $('st-profile-link').href = '/u/' + encodeURIComponent(p.username);
  }

  async function load() {
    const status = $('st-status');
    const user = window.GvnSession && window.GvnSession.getUser && window.GvnSession.getUser();
    if (user && user.isGuest) return; // guests have no profile; settings-page.js hides that tab
    try {
      const who = await fetch('/api/rankings/me', { credentials: 'same-origin' });
      if (who.status === 401 || who.status === 403) { location.href = '/login.html'; return; }
      const m = who.ok ? await who.json() : null;
      if (!m || !m.username) { status.textContent = t('settings.members_only'); return; }
      const res = await fetch('/api/profile/' + encodeURIComponent(m.username), { credentials: 'same-origin' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      status.textContent = '';
      fill(await res.json());
      $('st-content').hidden = false;
    } catch (_) {
      status.textContent = t('profile.error');
    }
  }

  async function save(ev) {
    ev.preventDefault();
    const body = {
      bio: $('st-bio').value,
      country: $('st-country').value,
      city: $('st-city').value,
      hideHistory: $('st-hide-history').checked,
      hideBio: $('st-hide-bio').checked,
      hideOnline: $('st-hide-online').checked,
    };
    for (const sel of document.querySelectorAll('select[data-aud]')) body[sel.dataset.aud] = sel.value;
    const out = $('st-saved');
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      out.textContent = res.ok ? t('profile.saved') : t('profile.error');
      if (res.ok) load();
    } catch (_) {
      out.textContent = t('profile.error');
    }
  }

  // Crop/move editor first (avatar-crop.js); the server still re-encodes to 256×256 and enforces 2 MB.
  async function upload(ev) {
    const file = ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    const out = $('st-saved');
    out.textContent = '';
    let body = file;
    if (window.AvatarCrop) {
      body = await window.AvatarCrop.open(file, { onError: (m) => { out.textContent = m; } });
      if (!body) return;
    }
    const res = await fetch('/api/profile/avatar', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': body.type || 'application/octet-stream' }, body,
    });
    if (res.ok) avatarChanged((await res.json()).avatarUrl);
    else out.textContent = t('profile.avatar_error');
  }

  async function removeAvatar() {
    const res = await fetch('/api/profile/avatar', { method: 'DELETE', credentials: 'same-origin' });
    if (res.ok) avatarChanged(null);
  }

  document.addEventListener('DOMContentLoaded', () => {
    SHELL().build(null);
    $('st-form').addEventListener('submit', save);
    $('st-cancel').addEventListener('click', () => { if (me) fill(me); $('st-saved').textContent = ''; });
    $('st-file').addEventListener('change', upload);
    $('st-avatar-remove').addEventListener('click', removeAvatar);
    window.addEventListener('langchange', () => { if (me) fill(me); });
    load();
  });
})();
