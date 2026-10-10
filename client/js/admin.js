/**
 * admin.js — staff console shell (R8 #205), page /admin. Asks GET /api/admin/me which tabs the
 * caller may see (the server still gates every queue call) and starts each tab's module the first
 * time it is shown. Tab = location.hash (#puzzles | #reports | #forum | #cheat | #users).
 */

'use strict';

(function () {
  const t = (key, vars) => (typeof window.t === 'function' ? window.t(key, vars) : key);
  const $ = (id) => document.getElementById(id);
  const TABS = { puzzles: () => window.PuzzlesReview, reports: () => window.AdminReports, forum: () => window.ForumReports, users: () => window.AdminUsers, cheat: () => window.AdminCheat };

  // Open-queue counts on the tab labels (mockup: "Báo cáo (7) · Nghi gian lận (2)"). Users has no queue.
  const COUNT_URL = { puzzles: '/api/puzzles/review', forum: '/api/forum/reports?page=1', cheat: '/api/admin/cheat-reports?page=1' };

  function setCount(tab, n) {
    let badge = tab.querySelector('.ptab__n');
    if (!badge) { badge = document.createElement('span'); badge.className = 'ptab__n'; tab.appendChild(badge); }
    badge.textContent = ' (' + n + ')';
  }

  function loadCounts(tabs) {
    for (const b of tabs) {
      const url = COUNT_URL[b.dataset.tab];
      if (!url) continue;
      fetch(url, { credentials: 'same-origin' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d && d.pagination) setCount(b, d.pagination.total); })
        .catch(() => { /* label stays plain */ });
    }
  }

  function show(name) {
    for (const key of Object.keys(TABS)) {
      const on = key === name;
      $('adm-' + key).hidden = !on;
      $('adm-tab-' + key).setAttribute('aria-selected', on ? 'true' : 'false');
    }
    TABS[name]().init();
  }

  function message(text) {
    const m = $('adm-msg');
    m.hidden = false;
    m.textContent = text;
  }

  async function init() {
    window.PlatformShell.build('admin'); // no nav item of its own (mockup highlights none)
    let me;
    try {
      const res = await fetch('/api/admin/me', { credentials: 'same-origin' });
      if (res.status === 401 || res.status === 403) return message(t('admin.login'));
      me = await res.json();
    } catch (err) {
      return message(t('admin.error'));
    }
    $('adm-role').textContent = t('admin.role_' + me.role);
    const allowed = [...document.querySelectorAll('#adm-tabs [data-perm]')].filter((b) => b.dataset.perm.split(' ').some((p) => me.permissions.includes(p))); // space-separated = any of
    if (!allowed.length) return message(t('admin.forbidden'));
    for (const b of allowed) {
      b.hidden = false;
      b.addEventListener('click', () => { location.hash = b.dataset.tab; });
    }
    $('adm-tabs').hidden = false;
    loadCounts(allowed);
    const fromHash = () => {
      const want = location.hash.slice(1);
      show(allowed.some((b) => b.dataset.tab === want) ? want : allowed[0].dataset.tab);
    };
    window.addEventListener('hashchange', fromHash);
    fromHash();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
