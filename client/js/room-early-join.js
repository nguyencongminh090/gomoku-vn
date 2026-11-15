'use strict';

/**
 * room-early-join.js — send the room entry intent the moment the early socket
 * connects (TODO.md #393).
 *
 * After #391 room.html opens its socket from <head>, but room:join/room:create
 * was still emitted by room-socket.js, the last of the deferred modules — so the
 * join waited ~300 ms (cold, CPU ×4) for client module time after the socket was
 * already up. This classic script, right after socket-early.js and above the
 * stylesheets, emits on `connect` instead.
 *
 * The reply then lands before room-socket.js listens, so the client holds every
 * incoming event (SocketClient.holdEvents) until room-socket.js releases them at
 * the end of its evaluation.
 *
 * `window.RoomIntent.send(client)` is the one place the intent is read; it is
 * once-guarded, so reconnects never re-emit it. room-socket.js's
 * processRoomIntent() calls it too — it sends when `connect` came after this
 * script's listener could not (no-op if already sent) and does the bare-link
 * redirect when there is nothing to send. room-socket.js REQUIRES this script.
 */

(function () {
  // null = not read yet; true = an intent was consumed (sent, or unparseable);
  // false = no intent and no ?id= (bare room.html — room-socket.js redirects).
  let result = null;

  function send(client) {
    if (result !== null) return result;
    const raw = sessionStorage.getItem('gvn_room_intent');
    sessionStorage.removeItem('gvn_room_intent');
    if (raw) {
      result = true;
      try {
        const intent = JSON.parse(raw);
        if (intent.action === 'create') {
          client.emit('room:create', { settings: intent.settings || {} });
        } else if (intent.action === 'join') {
          client.emit('room:join', { roomId: intent.roomId });
        }
      } catch { /* ignore parse error */ }
      return result;
    }
    const roomId = new URLSearchParams(window.location.search).get('id');
    result = !!roomId;
    if (roomId) client.emit('room:join', { roomId });
    return result;
  }

  window.RoomIntent = { send };

  const client = window.SocketClient.shared();
  if (!client.socket) return; // no session → _connect() is already redirecting to login
  client.holdEvents();
  const onConnect = () => {
    client.socket.off('connect', onConnect);
    send(client);
  };
  client.socket.on('connect', onConnect);
})();
