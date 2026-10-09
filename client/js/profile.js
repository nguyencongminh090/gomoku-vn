/**
 * profile.js — /u/<username> page (#177).
 *
 * GET /api/profile/:username renders the page; the owner also gets the edit
 * panel (bio, privacy flags, avatar upload/remove). All user-supplied text goes
 * through textContent; the avatar is a same-origin image URL.
 */

'use strict';

(function () {
  const t = (key, vars) => (typeof window.t === 'function' ? window.t(key, vars) : key);
  const $ = (id) => document.getElementById(id);

  const username = decodeURIComponent(location.pathname.replace(/^\/u\//, '').replace(/\/$/, ''));
  const CATEGORIES = ['freestyle', 'standard', 'caro'];

  function el(tag, text, cls) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }

  function setAvatar(url, name) {
    const a = $('pf-avatar');
    a.textContent = url ? '' : (name || '?').slice(0, 2).toUpperCase();
    a.style.backgroundImage = url ? 'url("' + url + '")' : '';
  }

  function render(p) {
    document.title = 'Play3CR — ' + p.displayName;
    $('pf-name').textContent = p.displayName;
    $('pf-joined').textContent = t('profile.joined', { date: new Date(p.createdAt).toLocaleDateString() });
    setAvatar(p.avatarUrl, p.displayName);

    const bio = $('pf-bio');
    if (p.bio) bio.textContent = p.bio;
    else bio.textContent = p.isSelf && p.privacy && p.privacy.hideBio ? t('profile.bio_hidden') : (p.bio === null ? '' : t('profile.no_bio'));

    const stats = $('pf-stats');
    stats.replaceChildren();
    if (p.stats) {
      for (const [k, v] of [['games', p.stats.games], ['wins', p.stats.wins], ['draws', p.stats.draws]]) {
        const d = document.createElement('div');
        d.append(el('dt', t('profile.stats_' + k)), el('dd', String(v)));
        stats.appendChild(d);
      }
    }

    const cards = $('pf-ratings');
    cards.replaceChildren();
    if (!p.ratings.length) cards.appendChild(el('p', t('profile.no_ratings'), 'profile__note'));
    for (const c of CATEGORIES) {
      const r = p.ratings.find((x) => x.category === c);
      if (!r) continue;
      const card = el('div', undefined, 'profile__card');
      card.append(
        el('span', t('rankings.cat_' + c)),
        el('b', String(r.rating) + (r.provisional ? '?' : '')),
        el('small', r.rank ? t('profile.rank', { rank: r.rank }) : t('profile.unranked', { games: r.games }))
      );
      cards.appendChild(card);
    }

    const list = $('pf-recent');
    const note = $('pf-recent-note');
    list.replaceChildren();
    note.hidden = true;
    if (!p.stats) {
      note.hidden = false;
      note.textContent = t('profile.history_hidden');
    } else if (!p.recent.length) {
      note.hidden = false;
      note.textContent = t('profile.no_recent');
    }
    for (const g of p.recent) {
      const li = document.createElement('li');
      const a = el('a', 'vs ' + g.opponent);
      a.href = 'history.html?id=' + encodeURIComponent(g.id);
      li.append(el('span', t('profile.' + g.result), 'profile__res profile__res--' + g.result), a);
      list.appendChild(li);
    }

    $('pf-edit').hidden = !p.isSelf;
    if (p.isSelf) {
      $('pf-bio-input').value = p.bio || '';
      $('pf-hide-history').checked = !!(p.privacy && p.privacy.hideHistory);
      $('pf-hide-bio').checked = !!(p.privacy && p.privacy.hideBio);
    }
    $('pf-content').hidden = false;
  }

  async function load() {
    const status = $('pf-status');
    try {
      const res = await fetch('/api/profile/' + encodeURIComponent(username), { credentials: 'same-origin' });
      if (res.status === 404) { status.textContent = t('profile.not_found'); return; }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      status.textContent = '';
      render(await res.json());
    } catch (_) {
      status.textContent = t('profile.error');
    }
  }

  async function save(ev) {
    ev.preventDefault();
    const res = await fetch('/api/profile', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bio: $('pf-bio-input').value,
        hideHistory: $('pf-hide-history').checked,
        hideBio: $('pf-hide-bio').checked,
      }),
    });
    $('pf-saved').textContent = res.ok ? t('profile.saved') : t('profile.error');
    if (res.ok) load();
  }

  async function upload(ev) {
    const file = ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    const res = await fetch('/api/profile/avatar', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });
    if (res.ok) setAvatar((await res.json()).avatarUrl, $('pf-name').textContent);
    else $('pf-saved').textContent = t('profile.avatar_error');
  }

  async function removeAvatar() {
    const res = await fetch('/api/profile/avatar', { method: 'DELETE', credentials: 'same-origin' });
    if (res.ok) setAvatar(null, $('pf-name').textContent);
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('pf-form').addEventListener('submit', save);
    $('pf-file').addEventListener('change', upload);
    $('pf-avatar-remove').addEventListener('click', removeAvatar);
    load();
  });
})();
