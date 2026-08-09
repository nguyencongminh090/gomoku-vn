'use strict';

/**
 * session.js — the client's single source of truth about "who am I"
 * (TODO.md #68).
 *
 * Before #68 the answer came from base64-decoding the JWT held in
 * localStorage, in two near-identical `getUserInfo()` copies (socket-client.js
 * and settings-panel.js). The credential is now an HttpOnly cookie the browser
 * never lets JavaScript see, so there is nothing left to decode — identity has
 * to come from the server, and this module is where it lands.
 *
 * What is stored here is NOT a credential. `gvn_user` holds only display
 * fields (userId, displayName, isGuest, expiresAt) — the things already
 * visible to every other player in a room. It exists so a page can paint the
 * nav bar before the socket finishes connecting; the server's `session:me`
 * event overwrites it on every connection, and the session cookie is what
 * actually authenticates. Tampering with `gvn_user` therefore changes what
 * this browser draws for itself and nothing else.
 *
 * Exposed as window.GvnSession because settings-panel.js is a UMD-style
 * global and the entry files load this as a plain side-effect import.
 */

(function(global) {
  const USER_KEY = 'gvn_user';
  // Pre-#68 key. Only read, and only to migrate it away — see migrateLegacyToken().
  const LEGACY_TOKEN_KEY = 'gvn_token';

  /**
   * The cached, non-secret profile, or null.
   * Treats an expired or unparseable cache as absent, so a stale entry can
   * never keep someone looking signed in after their session has lapsed.
   */
  function getUser() {
    let raw;
    try {
      raw = localStorage.getItem(USER_KEY);
    } catch {
      return null; // storage blocked (private mode / disabled cookies)
    }
    if (!raw) return null;

    try {
      const user = JSON.parse(raw);
      if (!user || typeof user !== 'object' || !user.userId) return null;
      if (user.expiresAt && Date.parse(user.expiresAt) <= Date.now()) {
        clearUser();
        return null;
      }
      return user;
    } catch {
      clearUser();
      return null;
    }
  }

  function setUser(user) {
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch { /* storage blocked — the socket still authenticates via cookie */ }
  }

  /**
   * Drop the local profile cache.
   *
   * This does NOT end the session — only the server can, by revoking the row
   * (POST /api/auth/logout). Anything that needs the session actually ended
   * must call logout(), not this.
   */
  function clearUser() {
    try {
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem('gvn_display_name'); // pre-#68 leftover
    } catch { /* ignore */ }
  }

  /** The pre-#68 token, if this browser still has one. */
  function legacyToken() {
    try {
      return localStorage.getItem(LEGACY_TOKEN_KEY);
    } catch {
      return null;
    }
  }

  /**
   * Does this browser believe it has a session?
   *
   * A legacy token counts. Migration is asynchronous while page setup is
   * synchronous, so on the first load after the #68 deploy a returning user
   * has a valid token but no `gvn_user` yet — treating that as signed out
   * would bounce them to login before the exchange could finish, defeating
   * the entire migration.
   */
  function hasBelievedSession() {
    return !!(getUser() || legacyToken());
  }

  /**
   * Page guard: bounce to login unless this browser believes it has a session.
   *
   * Deliberately optimistic. It cannot verify the cookie — that is the whole
   * point of HttpOnly — so it only rules out the "definitely signed out" case
   * and lets the socket handshake be the real check. A cookie revoked
   * server-side still reaches here as "believed signed in" and is rejected a
   * moment later by connect_error; socket-client.js handles that path.
   *
   * @returns {boolean} true if the page may continue rendering
   */
  function requireAuth() {
    if (hasBelievedSession()) return true;
    global.location.replace('login.html');
    return false;
  }

  /**
   * Trade a pre-#68 JWT still sitting in localStorage for a real session.
   *
   * Without this, everyone holding a valid token at deploy time would be
   * signed out at once — and a signed-out guest is gone for good, since there
   * is no account to sign back into. Runs at most once per browser: the token
   * is removed whether the exchange succeeds or fails, so a permanently
   * rejected token cannot make every page load retry forever.
   *
   * Runs in the background rather than blocking page setup: the socket
   * connects synchronously and, while a legacy token is still present, passes
   * it as the handshake fallback the server accepts during the window (see
   * socket-client.js). So this exchange only has to land before the NEXT page
   * load or reconnect — whichever comes first — and the current connection is
   * never interrupted by it.
   *
   * Time-boxed along with the server endpoint — delete both once the window
   * closes (features/jwt-httponly-cookie/planning.md step 12).
   *
   * @returns {Promise<boolean>} whether a session was obtained
   */
  async function migrateLegacyToken() {
    const token = legacyToken();
    if (!token) return false;

    try {
      const res = await fetch('/api/auth/upgrade-session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ token }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.user) setUser(data.user);
        return true;
      }
      return false;
    } catch {
      return false; // offline — fall through to the normal signed-out path
    } finally {
      // Remove it even on failure: leaving a rejected token behind would retry
      // this exchange on every single page load forever.
      try { localStorage.removeItem(LEGACY_TOKEN_KEY); } catch { /* ignore */ }
    }
  }

  /**
   * Save the profile the server just asserted (from `session:me`).
   * The server is authoritative; this only refreshes the paint cache.
   */
  function applyServerIdentity(me) {
    if (!me || !me.userId) return;
    const existing = getUser() || {};
    setUser({
      userId: me.userId,
      displayName: me.displayName,
      isGuest: !!me.isGuest,
      // session:me carries identity, not lifetime — keep whatever expiry the
      // login response gave us rather than dropping the field.
      expiresAt: existing.expiresAt,
    });
  }

  /**
   * End the session for real: revoke it server-side, then clear local state.
   *
   * Unlike the old localStorage.removeItem, this can fail — and on failure the
   * user is still signed in, because the cookie and the session row both still
   * exist. Redirecting anyway would tell someone they had logged out of a
   * shared machine when they had not, so the caller is expected to surface the
   * error instead of navigating.
   *
   * @returns {Promise<boolean>} true if the session is genuinely gone
   */
  async function logout() {
    try {
      const res = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (!res.ok) return false;
    } catch {
      return false; // network failure — session is still live, say so
    }
    clearUser();
    return true;
  }

  global.GvnSession = {
    getUser,
    setUser,
    clearUser,
    requireAuth,
    hasBelievedSession,
    legacyToken,
    migrateLegacyToken,
    applyServerIdentity,
    logout,
  };

  // Kick the migration off as a side effect of loading, on every page that
  // pulls this module in. It self-cancels when there is no legacy token, which
  // is the case for every browser after the first post-deploy load.
  migrateLegacyToken();
})(window);
