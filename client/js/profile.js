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

  const SHELL = () => window.PlatformShell;

  function setAvatar(url, name) {
    $('pf-avatar').replaceWith(Object.assign(SHELL().avatar(url, name, 'pav--xl'), { id: 'pf-avatar' }));
  }

  function render(p) {
    document.title = 'Play3CR — ' + p.displayName;
    $('pf-name').textContent = p.displayName;
    $('pf-joined').textContent = t('profile.joined', {
      date: new Date(p.createdAt).toLocaleDateString(undefined, { month: '2-digit', year: 'numeric' }),
    });
    setAvatar(p.avatarUrl, p.displayName);

    const bio = $('pf-bio');
    if (p.bio) bio.textContent = p.bio;
    else bio.textContent = p.isSelf && p.privacy && p.privacy.hideBio ? t('profile.bio_hidden') : (p.bio === null ? '' : t('profile.no_bio'));
    $('pf-actions').hidden = !p.isSelf;

    const stats = $('pf-stats');
    stats.replaceChildren();
    if (p.stats) {
      const pct = p.stats.games ? Math.round((p.stats.wins / p.stats.games) * 100) + '%' : '—';
      for (const [label, v] of [['stats_games', String(p.stats.games)], ['win_rate', pct], ['stats_draws', String(p.stats.draws)]]) {
        const d = document.createElement('div');
        d.append(el('dt', t('profile.' + label)), el('dd', v));
        stats.appendChild(d);
      }
    }

    const cards = $('pf-ratings');
    cards.replaceChildren();
    if (!p.ratings.length) cards.appendChild(el('p', t('profile.no_ratings'), 'pnote'));
    for (const c of CATEGORIES) {
      const r = p.ratings.find((x) => x.category === c);
      if (!r) continue;
      const card = el('div', undefined, 'pcard');
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
      const a = el('a', undefined, 'prow');
      a.href = 'history.html?id=' + encodeURIComponent(g.id);
      const body = el('div', undefined, 'prow__body');
      body.append(el('div', t('profile.' + g.result) + ' vs ' + g.opponent, 'prow__t'));
      a.append(el('span', undefined, 'pdot' + (g.result === 'win' ? ' pdot--on' : g.result === 'loss' ? ' pdot--loss' : '')), body);
      list.appendChild(a);
    }

    const clubs = p.clubs || [];
    $('pf-clubs-panel').hidden = clubs.length === 0;
    $('pf-clubs').replaceChildren(...clubs.map((c) => {
      const a = el('a', undefined, 'prow');
      a.href = '/c/' + encodeURIComponent(c.slug);
      const body = el('div', undefined, 'prow__body');
      body.append(el('div', c.name, 'prow__t'), el('div', t('clubs.role_' + c.role) + ' · ' + t('clubs.members', { n: c.members }), 'prow__m'));
      a.append(SHELL().avatar(null, c.name, 'pav--sm pav--sq'), body);
      return a;
    }));

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
    SHELL().build(null);
    $('pf-edit-btn').addEventListener('click', () => $('pf-edit').scrollIntoView({ behavior: 'smooth' }));
    $('pf-form').addEventListener('submit', save);
    $('pf-file').addEventListener('change', upload);
    $('pf-avatar-remove').addEventListener('click', removeAvatar);
    load();
  });
})();
