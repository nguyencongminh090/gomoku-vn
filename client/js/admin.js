/**
 * admin.js — staff console shell (R8 #205), page /admin. Asks GET /api/admin/me which tabs the
 * caller may see (the server still gates every queue call) and starts each tab's module the first
 * time it is shown. Tab = location.hash (#puzzles | #reports | #forum | #cheat | #integrity | #users | #news).
 */

'use strict';

(function () {
  const t = (key, vars) => (typeof window.t === 'function' ? window.t(key, vars) : key);
  const $ = (id) => document.getElementById(id);
  const TABS = { puzzles: () => window.PuzzlesReview, reports: () => window.AdminReports, forum: () => window.ForumReports, users: () => window.AdminUsers, cheat: () => window.AdminCheat, integrity: () => window.AdminIntegrity, news: () => window.AdminNews };
  let activeTab;

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
    if (name === activeTab) return;
    activeTab = name;
    for (const key of Object.keys(TABS)) {
      const on = key === name;
      const tab = $('adm-tab-' + key);
      $('adm-' + key).hidden = !on;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
    }
    TABS[name]().init();
  }

  function message(text) {
    const m = $('adm-msg');
    m.hidden = !text;
    m.textContent = text;
  }

  async function init() {
    window.PlatformShell.build('admin'); // no nav item of its own (mockup highlights none)
    message(t('history.loading'));
    let me;
    try {
      const res = await fetch('/api/admin/me', { credentials: 'same-origin' });
      if (res.status === 401 || res.status === 403) return message(t('admin.login'));
      if (!res.ok) return message(t('admin.error'));
      me = await res.json();
      if (!me || typeof me.role !== 'string' || !Array.isArray(me.permissions)) return message(t('admin.error'));
    } catch (err) {
      return message(t('admin.error'));
    }
    $('adm-role').textContent = t('admin.role_' + me.role);
    const allowed = [...document.querySelectorAll('#adm-tabs [data-perm]')].filter((b) => b.dataset.perm.split(' ').some((p) => me.permissions.includes(p))); // space-separated = any of
    if (!allowed.length) return message(t('admin.forbidden'));
    const activate = (tab) => {
      location.hash = tab.dataset.tab;
      show(tab.dataset.tab);
    };
    for (const b of allowed) {
      b.hidden = false;
      b.addEventListener('click', () => activate(b));
    }
    const tablist = $('adm-tabs');
    tablist.addEventListener('keydown', (e) => {
      const index = allowed.indexOf(e.target);
      if (index === -1 || e.altKey || e.ctrlKey || e.metaKey) return;
      let next;
      switch (e.key) {
        case 'ArrowLeft': next = (index + allowed.length - 1) % allowed.length; break;
        case 'ArrowRight': next = (index + 1) % allowed.length; break;
        case 'Home': next = 0; break;
        case 'End': next = allowed.length - 1; break;
        default: return;
      }
      e.preventDefault();
      activate(allowed[next]);
      allowed[next].focus();
    });
    tablist.hidden = false;
    message('');
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
