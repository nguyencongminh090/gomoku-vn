'use strict';

/**
 * socket-client.js — Socket.io client wrapper with cookie-based session auth.
 *
 * Provides:
 *   - Authentication via the HttpOnly session cookie (TODO.md #68)
 *   - Reconnection (the cookie is re-sent by the browser automatically)
 *   - Auth failure → redirect to login
 *   - Connection status tracking
 *
 * Since #68 this file no longer touches the credential at all: the browser
 * attaches the session cookie to the handshake, and identity arrives back from
 * the server as `session:me`. It used to read a JWT out of localStorage and
 * base64-decode it locally; that decode is gone, and `getUserInfo()` now just
 * forwards to the shared GvnSession cache (see session.js).
 *
 * Usage:
 *   const client = new SocketClient();
 *   client.on('lobby:update', (data) => { ... });
 *   client.emit('room:create', { settings: { ... } });
 */

// eslint-disable-next-line no-unused-vars
class SocketClient {
  constructor() {
    this.socket = null;
    this._listeners = [];
    this._statusEl = null;

    this._connect();
  }

  // ---------------------------------------------------------------------------
  // Connection
  // ---------------------------------------------------------------------------

  _connect() {
    if (!window.GvnSession.hasBelievedSession()) {
      window.location.replace('login.html');
      return;
    }

    // The session cookie authenticates this handshake and the browser attaches
    // it on its own — there is nothing to read or pass here, which is the
    // point of #68. `withCredentials` keeps that true if the client is ever
    // served from a different origin than the server.
    //
    // `auth.token` is populated ONLY while a pre-#68 token is still sitting in
    // localStorage, as the migration fallback the server accepts during the
    // transition window. It is not read once migration has run, and both sides
    // of the fallback get deleted together (planning.md step 12).
    const legacy = window.GvnSession.legacyToken();
    const auth = legacy ? { token: legacy } : {};

    //
    // `transports: ['websocket', 'polling']` tries a direct WebSocket upgrade
    // first instead of socket.io's default HTTP long-polling handshake
    // (['polling', 'websocket']). Measured in docs/stress-test-report.md §10
    // and re-verified in TODO.md #28/#29: at a synchronized burst of many
    // thousand new connections, the polling-first handshake is measurably
    // more likely to fail (`connect timeout`) than websocket-first — up to
    // ~15 percentage points at 6000 concurrent connecting players in this
    // session's re-measurement. `tryAllTransports: true` is required for
    // socket.io-client >=4.8 so a failed *first* transport (e.g. a proxy that
    // blocks WebSocket entirely) falls through to the next one in the list
    // instead of failing the connection outright — this keeps the same
    // eventual-connectivity guarantee polling-first had, just with websocket
    // tried before polling instead of after.
    this.socket = io({
      auth,
      withCredentials: true,
      transports: ['websocket', 'polling'],
      tryAllTransports: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      // How long one connection *attempt* may hang before it is abandoned and
      // the reconnect loop above takes over. socket.io's default is 20 000 ms,
      // which is the entire user-visible cost when the first attempt dies:
      // measured in a HAR from a real player (TODO.md #131, 2026-08-19), the
      // first WebSocket sat unanswered — `blocked=44 616 ms, connect=7 196 ms`,
      // the SYN-retransmit signature of packet loss on the browser↔Cloudflare
      // edge leg — the client waited out the full 20 s, and the retry then
      // connected in 2.9 s. Total: ~24 s staring at "Đang kết nối…", 20 of them
      // spent waiting on an attempt that was already dead.
      //
      // 12 s comes from measuring the real distribution rather than that one
      // HAR sample. `mtr` from the origin host found ~17% packet loss starting
      // at the ISP's 8th hop (hops 1-5, home router and modem included, are
      // clean), and 12 WebSocket handshakes through Cloudflare under it landed
      // at 1.9 / 3.4 / 3.4 / 3.7 / 4.5 / 5.1 / 5.7 / 6.4 / 7.8 / 7.9 / 7.9 s.
      //
      // Those cluster on the SYN-retransmit ladder — 1 s, 3 s, 7 s, then 15 s —
      // because a handshake needs both the SYN and the SYN-ACK to survive. So
      // the useful thresholds are the gaps in that ladder, not round numbers:
      // 12 s clears every attempt that gets through by the 7 s rung (measured
      // max 7 948 ms) with room for jitter, and still gives up well before the
      // 15 s rung, where waiting is strictly worse than retrying. An earlier
      // revision of this line used 8 s, calibrated on the single 2.9 s sample
      // in the HAR; that sits directly on top of the observed success
      // distribution and would cut short attempts that were about to land.
      //
      // This does NOT fix the packet loss itself — that is upstream of the
      // premises, on a leg neither the server nor the client controls.
      timeout: 12000,
    });

    // ── Connection lifecycle ──────────────────────────────────────────
    this.socket.on('connect', () => {
      this._setStatus('connected');
    });

    // The server states who this connection belongs to (TODO.md #68). With an
    // HttpOnly credential the client has no way to work this out for itself,
    // and the server was always the authority anyway — the old local JWT
    // decode just happened to agree with it.
    this.socket.on('session:me', (me) => {
      window.GvnSession.applyServerIdentity(me);
    });

    this.socket.on('disconnect', (reason) => {
      this._setStatus('disconnected', reason);
    });

    // Socket.io v4 emits 'reconnect_attempt'/'reconnect'/'reconnect_error' on
    // the Manager (`socket.io`), not on the Socket itself — `socket.on(...)`
    // for these never fires. Both listeners below (status banner + the
    // reconnect auth flag) target the Manager for that reason.
    this.socket.io.on('reconnect_attempt', (attempt) => {
      this._setStatus('reconnecting', attempt);
      // Flag every attempt after the first connect as a reconnect, in the
      // auth payload the server reads on connection. The server needs this
      // to tell "this page just opened and is about to send
      // room:create/room:join" from "this client already believed it was in
      // a room and the socket dropped" — only the second case means a
      // missing room is actually a lost room.
      this.socket.auth = Object.assign({}, this.socket.auth, { reconnect: true });
    });

    this.socket.io.on('reconnect', () => {
      this._setStatus('connected');
    });

    // Auth failure → back to login.
    //
    // This is the moment the client learns its session is actually dead:
    // revoked, expired, or never valid. Only the local profile cache is
    // cleared — the cookie itself is HttpOnly and cannot be removed from here,
    // and does not need to be, since the server has already stopped honouring
    // it. AUTH_ORIGIN means the handshake was refused as cross-site (CSWSH
    // defence); it is not a session problem, so it is not treated as one.
    this.socket.on('connect_error', (err) => {
      if (err.message === 'AUTH_REQUIRED' || err.message === 'AUTH_INVALID') {
        window.GvnSession.clearUser();
        window.location.replace('login.html');
      }
    });

    // Server forced this session out (same account connected elsewhere) →
    // stash a notice for login.html to display, then sign out. This tab
    // already knows it was kicked via this live socket event, so it redirects
    // on its own — it must NOT clear the shared `gvn_user` cache, since
    // localStorage is shared across every tab of the origin (not per-tab) and
    // this app navigates via full page loads. Clearing it here would make a
    // sibling tab that was never kicked see a missing profile on its next
    // navigation and incorrectly redirect to login too. sessionStorage is
    // already per-tab, so gvn_kicked_notice alone is enough for this tab.
    //
    // Since #68 the server also revokes the session row before sending this,
    // so the eviction survives a reconnect instead of being undone by one.
    this.socket.on('session:kicked', () => {
      sessionStorage.setItem('gvn_kicked_notice', '1');
      this.destroy();
      window.location.replace('login.html');
    });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Register an event listener. Returns this for chaining. */
  on(event, callback) {
    if (!this.socket) return this;
    this.socket.on(event, callback);
    this._listeners.push({ event, callback });
    return this;
  }

  /** Emit an event to the server. */
  emit(event, data) {
    if (!this.socket) return;
    this.socket.emit(event, data);
  }

  /** Remove all registered listeners and disconnect. */
  destroy() {
    if (!this.socket) return;
    for (const { event, callback } of this._listeners) {
      this.socket.off(event, callback);
    }
    this._listeners = [];
    this.socket.disconnect();
    this.socket = null;
  }

  /**
   * Current user info, from the shared session cache (session.js).
   *
   * Used to decode the JWT locally; there is no longer a token to decode. The
   * returned object may briefly be null on the first paint after a fresh
   * login until `session:me` lands.
   */
  getUserInfo() {
    return window.GvnSession.getUser();
  }

  /**
   * Log out.
   *
   * Now a network call — the session lives on the server, so only the server
   * can end it (session.js logout()). If it fails the user is still signed in,
   * and navigating to the login page anyway would tell them they had logged
   * out of a shared machine when they had not. So on failure this stays put
   * and reports it.
   *
   * @returns {Promise<boolean>} true if the session was really ended
   */
  async logout() {
    const ok = await window.GvnSession.logout();
    if (!ok) return false;
    this.destroy();
    window.location.replace('login.html');
    return true;
  }

  // ---------------------------------------------------------------------------
  // Status banner
  // ---------------------------------------------------------------------------

  /** Bind a status banner DOM element. */
  bindStatusBanner(el) {
    this._statusEl = el;
    // Re-render the currently visible status text on language switch — it's
    // set via textContent (not data-i18n), so applyI18n() alone can't
    // translate it (TODO #45).
    window.addEventListener('langchange', () => {
      if (this._lastStatus) this._setStatus(this._lastStatus, this._lastDetail);
    });
  }

  _setStatus(status, detail) {
    if (!this._statusEl) return;
    this._lastStatus = status;
    this._lastDetail = detail;

    switch (status) {
      case 'connected':
        this._statusEl.classList.remove('visible');
        break;
      case 'disconnected':
        this._statusEl.textContent = t('conn.disconnected_retrying');
        this._statusEl.classList.add('visible');
        break;
      case 'reconnecting':
        this._statusEl.textContent = t('conn.reconnecting_attempt', { n: detail });
        this._statusEl.classList.add('visible');
        break;
    }
  }
}

// Expose to global scope for ESM module usage
window.SocketClient = SocketClient;
