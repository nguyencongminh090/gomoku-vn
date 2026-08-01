'use strict';

/**
 * socket-client.js — Socket.io client wrapper with JWT auth.
 *
 * Provides:
 *   - Automatic JWT injection from localStorage
 *   - Reconnection with token
 *   - Auth failure → redirect to login
 *   - Connection status tracking
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
    const token = localStorage.getItem('gvn_token');
    if (!token) {
      window.location.replace('login.html');
      return;
    }

    // Connect with JWT in auth handshake
    this.socket = io({
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    // ── Connection lifecycle ──────────────────────────────────────────
    this.socket.on('connect', () => {
      this._setStatus('connected');
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

    // Auth failure → back to login
    this.socket.on('connect_error', (err) => {
      if (err.message === 'AUTH_REQUIRED' || err.message === 'AUTH_INVALID') {
        localStorage.removeItem('gvn_token');
        localStorage.removeItem('gvn_display_name');
        window.location.replace('login.html');
      }
    });

    // Server forced this session out (same account connected elsewhere) →
    // stash a notice for login.html to display, then sign out. This tab
    // already knows it was kicked via this live socket event, so it redirects
    // on its own — it must NOT wipe localStorage's shared gvn_token, since
    // that store is shared across every tab of the origin (not per-tab) and
    // this app navigates via full page loads. Clearing it here would make a
    // sibling tab that was never kicked see a missing token on its next
    // navigation and incorrectly redirect to login too. sessionStorage is
    // already per-tab, so gvn_kicked_notice alone is enough for this tab.
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

  /** Get current user info from stored JWT (client-side decode). */
  getUserInfo() {
    const token = localStorage.getItem('gvn_token');
    if (!token) return null;
    try {
      let payload = token.split('.')[1];
      payload = payload.replace(/-/g, '+').replace(/_/g, '/');
      const decodedPayload = decodeURIComponent(
        atob(payload).split('').map(function(c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join('')
      );
      return JSON.parse(decodedPayload);
    } catch {
      return null;
    }
  }

  /** Log out: clear storage, redirect to login. */
  logout() {
    localStorage.removeItem('gvn_token');
    localStorage.removeItem('gvn_display_name');
    this.destroy();
    window.location.replace('login.html');
  }

  // ---------------------------------------------------------------------------
  // Status banner
  // ---------------------------------------------------------------------------

  /** Bind a status banner DOM element. */
  bindStatusBanner(el) {
    this._statusEl = el;
  }

  _setStatus(status, detail) {
    if (!this._statusEl) return;

    switch (status) {
      case 'connected':
        this._statusEl.classList.remove('visible');
        break;
      case 'disconnected':
        this._statusEl.textContent = 'Mất kết nối. Đang thử kết nối lại...';
        this._statusEl.classList.add('visible');
        break;
      case 'reconnecting':
        this._statusEl.textContent = `Kết nối lại... (lần ${detail})`;
        this._statusEl.classList.add('visible');
        break;
    }
  }
}

// Expose to global scope for ESM module usage
window.SocketClient = SocketClient;
