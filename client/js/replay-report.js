/**
 * replay-report.js — "Báo gian lận" on /replay/<id> (R8 #208). A logged-in member picks a seat and
 * gives a reason; POST /api/games/:id/report. Casual games only (a tournament replay has no report).
 * The server resolves the accused from the seat and rejects guests / yourself / unfinished games.
 */

'use strict';

(function () {
  const t = (key, vars) => (typeof window.t === 'function' ? window.t(key, vars) : key);
  const $ = (id) => document.getElementById(id);

  function init() {
    const user = window.GvnSession && window.GvnSession.getUser();
    const params = new URLSearchParams(window.location.search);
    const gameId = decodeURIComponent((window.location.pathname.match(/^\/replay\/([^/]+)/) || [])[1] || '');
    const host = $('replay-report');
    if (!host || !user || user.isGuest || !gameId || params.get('source') === 'tournament') return;

    host.hidden = false;
    $('rr-open').addEventListener('click', () => {
      const form = $('rr-form');
      form.hidden = !form.hidden;
      if (!form.hidden) {
        // Names are on the page once the replay loaded; fall back to the seat label.
        $('rr-black').textContent = t('replay.report_black', { name: ($('replay-black').textContent || '').replace(/^✕\s*/, '') });
        $('rr-white').textContent = t('replay.report_white', { name: ($('replay-white').textContent || '').replace(/^○\s*/, '') });
      }
    });
    $('rr-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = $('rr-msg');
      const btn = $('rr-submit');
      btn.disabled = true;
      try {
        const res = await fetch('/api/games/' + encodeURIComponent(gameId) + '/report', {
          method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ side: $('rr-side').value, reason: $('rr-reason').value }),
        });
        const data = await res.json().catch(() => ({}));
        msg.hidden = false;
        if (res.ok) {
          msg.textContent = t('replay.report_sent');
          $('rr-reason').value = '';
        } else {
          msg.textContent = data.code ? t('err.' + data.code.toLowerCase()) : t('replay.report_error');
        }
      } catch (err) {
        msg.hidden = false;
        msg.textContent = t('replay.report_error');
      } finally {
        btn.disabled = false;
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
