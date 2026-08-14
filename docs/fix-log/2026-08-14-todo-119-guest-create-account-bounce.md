# Fix log entry — 2026-08-14 21:34

## Prompt

User report (chat, filed to TODO.md #119 first, then "Do #119" in a later
turn): a guest ("FreeCrow") reported that clicking "Create account" in the
global Settings modal did nothing — they had to log out first, then create
an account "outside" (from a fresh, signed-out visit to the login page).

## Action

Traced the click: Settings' "Create account" button
(`client/js/settings-panel.js:274-278`) is a plain
`<a href="login.html">` — correct, does a full-page navigation. The actual
bug is in `client/js/login.js:22-48`'s `checkExistingSession()` IIFE, which
runs at module load and bounces the browser straight back to `index.html`
whenever `GvnSession.hasBelievedSession()` is true. That check
(`session.js:112-114`) is `!!(getUser() || legacyToken())` — it does not
distinguish a guest session from a real one, and a guest's `getUser()` is
always non-null. So a guest landing on `login.html` was bounced back before
the register form ever rendered.

Fix: read `GvnSession.getUser()` in `checkExistingSession()` and skip the
bounce when the cached user's `isGuest` is true:

```js
const cachedUser = window.GvnSession.getUser();
const isGuestSession = !!(cachedUser && cachedUser.isGuest);
if (window.GvnSession.hasBelievedSession() && !isGuestSession && !sessionStorage.getItem('gvn_kicked_notice') && !hasOAuthError) {
  window.location.replace('index.html');
}
```

Non-guest sessions keep the original bounce. Checked the other two call
sites of `hasBelievedSession()` (`socket-client.js:39`, `session.js:127-131`
`requireAuth()`) — both are page guards for authenticated pages, bouncing
users OFF the page when there's no session at all; guests are supposed to
pass those, so no change was needed there (per the filed instruction's
"check other call sites for the same gap, don't do a half-measure fix").

Extended the existing `client/tests/login-oauth-error-banner.test.js`
(written for TODO.md #99, same `checkExistingSession()` function) rather
than creating a new file: added a `getUser()` mock to its `setupPage()`
helper and a new describe block with 3 cases — guest session doesn't
redirect, non-guest session still does (regression), and the guest case
combined with an OAuth error param still shows the banner without
redirecting (doesn't reopen #99).

## Decision

Branched `fix/guest-create-account-bounce` off `main` (the buggy code exists
on `main`). Brought TODO.md/instruction.md's #119 entry onto `main` marked
done, same as the #121 fix's approach — the entry had only existed
(un-done) on `dev` from an earlier filing turn.

## Summary output

`client/js/login.js` — added 2 lines + a comment explaining the guest
exception. `client/tests/login-oauth-error-banner.test.js` — extended mock,
3 new test cases (8/8 in that suite). `npm test`: 1139/1139 pass.
`client/js/login.js` was modified, so `?v=N` was bumped 121→122 across every
`client/*.html` and `client/js/*.js` (mockups excluded), verified with the
cache-bust grep in `CLAUDE.md` (exactly one distinct value after the bump).
`fix/guest-create-account-bounce` merged into `main`, then into `dev`.
