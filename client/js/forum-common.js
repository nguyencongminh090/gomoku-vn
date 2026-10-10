/**
 * forum-common.js — helpers shared by the forum pages (#203 7c). Global `Forum`. No DOM at load.
 * All server text is placed with textContent (forum posts are plain text by decision).
 */

'use strict';

(function () {
  const t = (key, vars) => (typeof window.t === 'function' ? window.t(key, vars) : key);

  function el(tag, text, cls) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }

  /** Translated message for an API error body ({code}) or the generic fallback. */
  function errMsg(data) {
    return data && data.code ? t('err.' + data.code.toLowerCase()) : t('forum.error');
  }

  /** Members only: guests and signed-out visitors get 401/403 from this probe. */
  async function isMember() {
    try {
      const res = await fetch('/api/rankings/me', { credentials: 'same-origin' });
      return res.ok;
    } catch (_) { return false; }
  }

  const when = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });

  function pager(host, pg, go) {
    host.replaceChildren();
    if (pg.totalPages <= 1) return;
    const prev = el('button', t('rankings.prev'), 'pbtn');
    const next = el('button', t('rankings.next'), 'pbtn');
    prev.type = next.type = 'button';
    prev.disabled = pg.page <= 1;
    next.disabled = pg.page >= pg.totalPages;
    prev.addEventListener('click', () => go(pg.page - 1));
    next.addEventListener('click', () => go(pg.page + 1));
    host.append(prev, el('span', pg.page + ' / ' + pg.totalPages), next);
  }

  function say(node, msg, good) {
    node.hidden = !msg;
    node.className = 'pz-result ' + (good ? 'is-right' : 'is-wrong');
    node.textContent = msg || '';
  }

  /** POST/DELETE JSON; resolves {ok, data}. Network failures resolve {ok:false, data:{}}. */
  async function send(method, url, body) {
    try {
      const res = await fetch(url, {
        method, credentials: 'same-origin',
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { ok: res.ok, data: await res.json().catch(() => ({})) };
    } catch (_) { return { ok: false, data: {} }; }
  }

  window.Forum = { t, el, errMsg, isMember, when, pager, say, send };
})();
