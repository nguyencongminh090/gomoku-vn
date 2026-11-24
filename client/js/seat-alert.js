'use strict';

/**
 * seat-alert.js — "Báo khi có bàn" (#438).
 *
 * The player saves the Phòng screen's current rule tab + filters (Gần trình tôi, time buckets; "Còn ghế" is
 * implied). The server (state.js `setSeatAlert`) matches every table that turns open against it and pushes
 * ONE `lobby:seat_alert { room }` per table; this module registers the filter, re-registers it after a
 * reconnect, and shows a toast with "Vào" and "Tắt 10 phút". Off by default; the choice and the mute live
 * in localStorage (the server keeps nothing). Only pages that hold the lobby socket can alert (index.html).
 *
 * Window API: SeatAlert.create({ client, t, storage, join, toast, now }) → { get, arm, disarm, isMuted, mute, mutedUntil }
 *   client: SocketClient (on / emit); join(roomId) enters the table; toast(room) optional override (tests);
 *   now() → ms. Fires `seatalert:change` on window whenever the saved state or the mute changes.
 */
(function (global) {
  const KEY = 'gvn_seat_alert';
  const MUTE_KEY = 'gvn_seat_alert_mute';
  const MUTE_MS = 10 * 60 * 1000;
  const TOAST_MS = 9000;
  const RULES = ['freestyle', 'caro', 'standard', 'renju'];
  const TIMES = ['fast', 'mid', 'slow', 'move'];

  /** A stored / given filter reduced to `{ rule, near, time[] }`, or null when it names no known rule. */
  function normalize(f) {
    if (!f || typeof f !== 'object' || !RULES.includes(f.rule)) return null;
    const time = Array.isArray(f.time) ? TIMES.filter((k) => f.time.includes(k)) : [];
    return { rule: f.rule, near: f.near === true, time };
  }

  function create(opts) {
    const { client, t } = opts;
    const now = opts.now || (() => Date.now());
    const storage = opts.storage || (() => { try { return global.localStorage; } catch (e) { return null; } })();
    const read = (k) => { try { return storage ? storage.getItem(k) : null; } catch (e) { return null; } };
    const write = (k, v) => { try { if (!storage) return; if (v == null) storage.removeItem(k); else storage.setItem(k, v); } catch (e) { /* private mode */ } };
    const changed = () => global.dispatchEvent(new CustomEvent('seatalert:change'));

    function get() {
      try { return normalize(JSON.parse(read(KEY))); } catch (e) { return null; }
    }
    function mutedUntil() {
      const n = Number(read(MUTE_KEY));
      return Number.isFinite(n) && n > now() ? n : 0;
    }
    const isMuted = () => mutedUntil() > 0;

    /** Tell the server what to watch (or to stop). Buffered by socket.io while disconnected. */
    function register() {
      const f = get();
      if (f) client.emit('lobby:alert_set', f); else client.emit('lobby:alert_clear');
    }
    function arm(filter) {
      const f = normalize(filter);
      if (!f) return false;
      write(KEY, JSON.stringify(f));
      write(MUTE_KEY, null); // turning it on again is a fresh start
      register();
      changed();
      return true;
    }
    function disarm() {
      write(KEY, null);
      write(MUTE_KEY, null);
      client.emit('lobby:alert_clear');
      changed();
    }
    function mute() {
      write(MUTE_KEY, String(now() + MUTE_MS));
      changed();
    }

    // ── Toast ─────────────────────────────────────────────────────────────
    function showToast(room) {
      if (typeof opts.toast === 'function') { opts.toast(room); return; }
      let stack = document.getElementById('toast-stack');
      if (!stack) {
        stack = document.createElement('div');
        stack.id = 'toast-stack';
        stack.className = 'toast-stack';
        stack.setAttribute('aria-live', 'polite');
        document.body.appendChild(stack);
      }
      const rule = room.winningRule;
      const time = global.RoomsH && global.RoomsH.timeText ? global.RoomsH.timeText(room, t) : '';
      const item = document.createElement('div');
      item.className = 'toast toast--info seat-toast';
      item.setAttribute('role', 'status');
      item.style.animationDelay = '0s, ' + (TOAST_MS - 400) + 'ms';
      const text = document.createElement('span');
      text.className = 'seat-toast__text';
      text.textContent = t('seatalert.toast', { host: room.hostName || '', rule: t('rule.' + rule), time });
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'seat-toast__btn seat-toast__btn--go';
      go.textContent = t('lobby.btn_join');
      go.addEventListener('click', () => { item.remove(); if (opts.join) opts.join(room.roomId); });
      const off = document.createElement('button');
      off.type = 'button';
      off.className = 'seat-toast__btn';
      off.textContent = t('seatalert.mute');
      off.addEventListener('click', () => { item.remove(); mute(); });
      item.append(text, go, off);
      stack.appendChild(item);
      setTimeout(() => { if (item.parentNode) item.remove(); }, TOAST_MS);
      while (stack.children.length > 5) stack.removeChild(stack.firstChild);
    }

    client.on('lobby:seat_alert', (msg) => {
      const room = msg && msg.room;
      if (!room || !room.roomId || !get() || isMuted()) return;
      showToast(room);
    });
    // A reconnect is a fresh server socket: it forgot the alert.
    client.on('connect', () => { if (get()) register(); });
    if (get() && client.socket && client.socket.connected) register();

    return { get, arm, disarm, isMuted, mute, mutedUntil };
  }

  global.SeatAlert = { create, normalize, KEY, MUTE_KEY, MUTE_MS };
})(window);
