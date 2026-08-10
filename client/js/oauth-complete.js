'use strict';

/**
 * oauth-complete.js — landing page for the Google OAuth redirect (TODO.md #91).
 *
 * GET /api/auth/google/callback already set the session cookie server-side
 * and sent the browser here with the new user's profile in the URL FRAGMENT
 * (never sent over the network, unlike a query string — this is why the
 * server used a fragment and not `?user=...`). GvnSession.completeLogin()
 * (TODO.md #102) is the same "cache the profile, hand off to index.html"
 * step login.js's onAuthSuccess() uses for the username/password and guest
 * flows. Without this step, index.html's requireAuth() would bounce straight
 * back to login.html — it only trusts localStorage, never the (HttpOnly,
 * therefore invisible to JS) cookie itself.
 */
(function () {
  const hash = window.location.hash.slice(1);
  let user = null;

  if (hash) {
    try {
      const parsed = JSON.parse(decodeURIComponent(hash));
      if (parsed && typeof parsed === 'object' && parsed.userId) user = parsed;
    } catch {
      // Malformed fragment — fall through, treated the same as a missing one.
    }
  }

  if (user) {
    window.GvnSession.completeLogin(user);
  } else {
    window.location.replace('login.html?error=oauth_failed');
  }
})();
