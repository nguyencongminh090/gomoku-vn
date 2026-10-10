/**
 * admin.js — staff console shell (R8 #205), page /admin. Asks GET /api/admin/me which tabs the
 * caller may see (the server still gates every queue call) and starts each tab's module the first
 * time it is shown. Tab = location.hash (#puzzles | #forum).
 */

'use strict';

(function () {
  const t = (key, vars) => (typeof window.t === 'function' ? window.t(key, vars) : key);
  const $ = (id) => document.getElementById(id);
  const TABS = { puzzles: () => window.PuzzlesReview, forum: () => window.ForumReports, users: () => window.AdminUsers };

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
    window.PlatformShell.build('learn');
    let me;
    try {
      const res = await fetch('/api/admin/me', { credentials: 'same-origin' });
      if (res.status === 401 || res.status === 403) return message(t('admin.login'));
      me = await res.json();
    } catch (err) {
      return message(t('admin.error'));
    }
    $('adm-role').textContent = t('admin.role_' + me.role);
    const allowed = [...document.querySelectorAll('#adm-tabs [data-perm]')].filter((b) => me.permissions.includes(b.dataset.perm));
    if (!allowed.length) return message(t('admin.forbidden'));
    for (const b of allowed) {
      b.hidden = false;
      b.addEventListener('click', () => { location.hash = b.dataset.tab; });
    }
    $('adm-tabs').hidden = false;
    const fromHash = () => {
      const want = location.hash.slice(1);
      show(allowed.some((b) => b.dataset.tab === want) ? want : allowed[0].dataset.tab);
    };
    window.addEventListener('hashchange', fromHash);
    fromHash();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
