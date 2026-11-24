'use strict';

/**
 * room-invite.js — the host's "Mời người chơi" picker (F443). Opened from the ≡ menu (room-ui.js).
 *
 * RoomInvite.open(): a dialog with a search box and the online members the host may invite
 *   (GET /api/room-invites/online). "Mời" → POST /api/room-invites {to: username, roomId}; the invitee answers from
 *   their bell and, on accepting, joins as a spectator (the server never seats anyone).
 * Reads: window.RoomState.roomData.roomId. DOM built with textContent only — names are user input.
 */
(function (global) {
  const t = (key, vars) => (typeof global.t === 'function' ? global.t(key, vars) : key);

  function el(tag, text, cls) {
    const n = document.createElement(tag);
    if (text) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }

  let overlay = null;

  function close() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    document.removeEventListener('keydown', onKey);
    const menuBtn = document.getElementById('btn-room-menu');
    if (menuBtn) menuBtn.focus();
  }
  function onKey(e) {
    if (e.key === 'Escape') return close();
    if (e.key !== 'Tab' || !overlay) return;
    // aria-modal: keep Tab / Shift+Tab inside the dialog
    const f = [...overlay.querySelectorAll('input, button:not([disabled])')];
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    // A button that just turned disabled (invite sent) drops focus to <body>: pull it back in.
    if (!overlay.contains(document.activeElement)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function open() {
    const st = global.RoomState;
    const roomId = st && st.roomData && st.roomData.roomId;
    if (overlay || !roomId) return;

    overlay = el('div', null, 'modal-overlay visible');
    const box = el('div', null, 'modal rinv');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', t('room.invite_title'));

    const head = el('div', null, 'rinv__head');
    const x = el('button', '×', 'rinv__x');
    x.type = 'button';
    x.setAttribute('aria-label', t('common.close_x'));
    x.addEventListener('click', close);
    head.append(el('h2', t('room.invite_title'), 'rinv__title'), x);

    const search = el('input', null, 'rinv__search');
    search.type = 'search';
    search.placeholder = t('room.invite_search');
    search.setAttribute('aria-label', t('room.invite_search'));
    const status = el('p', t('room.invite_loading'), 'rinv__status');
    status.setAttribute('role', 'status');
    const err = el('p', null, 'rinv__err'); // a refused invite: kept until the next attempt (typing in search must not wipe it)
    err.setAttribute('role', 'alert');
    const list = el('ul', null, 'rinv__list');
    const hint = el('p', t('room.invite_hint'), 'rinv__hint');

    let players = null; // null until the list arrives
    const sent = new Set(); // usernames invited from this dialog

    function row(p) {
      const li = el('li', null, 'rinv__row');
      const who = el('div', null, 'rinv__who');
      who.append(el('span', p.displayName, 'rinv__dn'), el('span', '@' + p.username, 'rinv__un'));
      const b = el('button', t(sent.has(p.username) ? 'room.invite_sent' : 'room.invite_btn'), 'btn-primary rinv__btn');
      b.type = 'button';
      b.disabled = sent.has(p.username);
      b.addEventListener('click', async () => {
        b.disabled = true;
        err.textContent = '';
        let res = null;
        try {
          res = await fetch('/api/room-invites', {
            method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: p.username, roomId }),
          });
        } catch (_) { /* offline */ }
        if (res && res.ok) { sent.add(p.username); b.textContent = t('room.invite_sent'); return; }
        const body = res ? await res.json().catch(() => ({})) : {};
        err.textContent = body.error || t('room.invite_error');
        b.disabled = false;
      });
      li.append(who, b);
      return li;
    }

    function render() {
      if (!players) return;
      const q = search.value.trim().toLowerCase();
      const shown = players.filter((p) => (p.displayName + ' ' + p.username).toLowerCase().includes(q));
      list.replaceChildren(...shown.map(row));
      status.textContent = !players.length ? t('room.invite_none') : !shown.length ? t('room.invite_no_match') : '';
    }
    search.addEventListener('input', render);

    box.append(head, search, status, err, list, hint);
    overlay.appendChild(box);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    search.focus();

    fetch('/api/room-invites/online', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { players = Array.isArray(d.players) ? d.players : []; render(); })
      .catch(() => { status.textContent = t('room.invite_error'); });
  }

  global.RoomInvite = { open, close };
})(typeof window !== 'undefined' ? window : globalThis);
