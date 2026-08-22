'use strict';

/**
 * socket-early.js — start the socket.io handshake while the page is still
 * parsing (TODO.md #145).
 *
 * ## What this fixes
 *
 * Measured in a HAR from the live site (2026-08-22 19:20:52, `index.html`):
 * the `wss://` entry was the longest on the page at 543 ms, but the larger
 * cost was not inside that entry at all — **462 ms elapsed before the socket
 * was even opened**, of which 220 ms was pure client-side time after the HTML
 * had already arrived. The socket used to be created at the very end of the
 * ES-module graph (`index-entry.js` → … → `lobby.js`'s `new SocketClient()`),
 * and `type="module"` is always deferred, so the handshake could not start
 * until the whole document had been parsed and every module evaluated.
 *
 * Nothing about opening the connection needs any of that. `_connect()` needs
 * two things: the global `io`, and one `localStorage` read via
 * `GvnSession.hasBelievedSession()`. Both are available in `<head>`. Creating
 * the client here overlaps the ~321 ms TCP+TLS handshake with HTML parsing
 * and CSS work instead of queueing it behind them.
 *
 * ## Why a `<head>` script and not a resource hint
 *
 * Because there is no resource hint for this. `<link rel="preconnect">` warms
 * an HTTP/2-or-3 connection, and a WebSocket cannot use one — it needs its own
 * HTTP/1.1 Upgrade, to a possibly different edge IP (in that same HAR the
 * document went to 172.67.150.225 over HTTP/3 while the socket went to
 * 104.21.11.251 over HTTP/1.1). The proposal to make `preconnect`/`preload`
 * accept `wss://` URLs — filed for exactly this reason, "the WebSocket
 * connection is on the critical path" — was closed as not planned
 * (whatwg/html#8037). Calling `io()` earlier is what the platform leaves us.
 *
 * ## Ordering requirement in index.html — do not move this below the CSS
 *
 * This file and its three dependencies (`socket.io.min.js`, `session.js`,
 * `socket-client.js`) must sit **above every `<link rel="stylesheet">`** in
 * `<head>`. A classic script placed after a stylesheet link waits for that
 * stylesheet to finish loading before it runs, because it might query the
 * CSSOM. Moving these below the CSS would hand the entire saving straight
 * back — the socket would then open no earlier than the last stylesheet
 * arrives.
 *
 * ## Scope
 *
 * `index.html` only, for now. `room.html`, `tournament-detail.html` and
 * `tournament-match.html` still construct their client from their entry
 * module. Rolling this out there is deliberate follow-up work, gated on the
 * measurement from this page — see docs/instruction/B145-*.md.
 */

(function () {
  // `shared()` is the idempotency guard, and it lives in socket-client.js so
  // that this file and lobby.js cannot disagree about how many connections a
  // page gets. See the comment on SocketClient.shared() for what a second
  // connection actually does to the player.
  window.SocketClient.shared();
})();
