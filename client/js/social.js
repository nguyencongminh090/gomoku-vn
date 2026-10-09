/**
 * social.js — Bạn bè & tin nhắn page (#198): friend requests, sent requests, friend list.
 * GET /api/friends → {friends, incoming, outgoing}; actions POST/DELETE /api/friends/:username.
 * All user text through textContent.
 */

'use strict';

(function () {
  const t = (key, vars) => (typeof window.t === 'function' ? window.t(key, vars) : key);
  const $ = (id) => document.getElementById(id);

  function el(tag, text, cls) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }

  async function act(method, path, btn) {
    btn.disabled = true;
    try {
      const res = await fetch(path, { method, credentials: 'same-origin' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      await load();
    } catch (_) {
      btn.disabled = false;
      $('sc-status').textContent = t('friends.error');
    }
  }

  function row(p, buttons) {
    const r = el('div', undefined, 'prow');
    const a = el('a', p.displayName, 'prow__t');
    a.href = '/u/' + encodeURIComponent(p.username);
    const body = el('div', undefined, 'prow__body');
    body.appendChild(a);
    r.append(window.PlatformShell.avatar(p.avatarUrl, p.displayName, 'pav--sm'), body);
    const base = '/api/friends/' + encodeURIComponent(p.username);
    for (const [key, method, suffix, cls] of buttons) {
      const b = el('button', t(key), 'pbtn pbtn--sm' + (cls ? ' ' + cls : ''));
      b.type = 'button';
      b.addEventListener('click', () => act(method, base + suffix, b));
      r.appendChild(b);
    }
    return r;
  }

  function fill(id, people, buttons, emptyKey) {
    const box = $(id);
    box.replaceChildren(...people.map((p) => row(p, buttons)));
    if (!people.length && emptyKey) box.appendChild(el('p', t(emptyKey), 'pnote'));
  }

  async function load() {
    const status = $('sc-status');
    try {
      const res = await fetch('/api/friends', { credentials: 'same-origin' });
      if (res.status === 401 || res.status === 403) { status.textContent = t('social.guest'); return; }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const d = await res.json();
      status.textContent = '';
      fill('sc-incoming', d.incoming, [['friends.accept', 'POST', '/accept', 'pbtn--primary'], ['friends.decline', 'DELETE', '', 'pbtn--ghost']], 'social.none_incoming');
      fill('sc-friends', d.friends, [['friends.remove', 'DELETE', '', 'pbtn--ghost']], 'social.none_friends');
      fill('sc-outgoing', d.outgoing, [['friends.cancel', 'DELETE', '', 'pbtn--ghost']], null);
    } catch (_) {
      status.textContent = t('social.error');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.PlatformShell.build('social');
    load();
  });
})();
