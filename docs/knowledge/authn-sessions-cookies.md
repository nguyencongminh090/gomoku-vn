---
name: authn-sessions-cookies
description: Web sessions and cookies - session ID properties, cookie flags, renewal on login, timeouts and logout
domain: security
tags: sessions,cookies,web,csrf,authentication
apply_when: "designing or reviewing session handling for a browser-based app that keeps users logged in with cookies"
sources: "OWASP Session Management Cheat Sheet (B4; re-verified 2026-09-26: entropy, idle and absolute timeout, cookie attributes, logout, renewal); NIST SP 800-63B session section (B1)"
last_reviewed: 2026-09-26
confidence: medium
source: /run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/security/items/authn-sessions-cookies.md
copied: 2026-10-09
---

# Sessions and cookies

## Session ID

- **Random and unguessable:** at least 64 bits of entropy from a cryptographically secure
  generator.
- **Meaningless:** no user data inside; it is only a lookup key into server-side state.
- **Generic name** (not a framework default) to avoid leaking the stack.
- Treat it as untrusted input: validate format, reject unknown IDs.

## Cookie attributes

`Secure` (HTTPS only), `HttpOnly` (not readable by scripts, limits theft after XSS),
`SameSite` (preferably `Strict`, or `Lax` where flows need it; limits cross-site request
forgery) and the `__Host-` prefix (binds to the exact host and forbids a Domain attribute).

## Lifecycle

- **Issue a new session ID at login** and on any privilege change (prevents session
  fixation).
- Enforce **idle timeout** (OWASP suggests about 2 to 30 minutes by sensitivity) and
  **absolute timeout** (about 4 to 8 hours) on the **server**; client-side timers can be
  bypassed. NIST 800-63B sets its own maximums per assurance level.
- **Logout** must destroy the server-side session; send `Cache-Control: no-store` and
  consider `Clear-Site-Data`.
- Optionally rotate the ID periodically during a long session.

## Use when

Browser applications with server-side or signed sessions where the cookie is the credential
after login.

## Do not use when

- Your clients are not browsers (mobile apps, service-to-service): use bearer or
  sender-constrained tokens (`authn-tokens-jwt`, `authn-oauth-oidc`).
- You are tempted to keep sessions in `localStorage`: it is readable by any script on the
  page, so one XSS exposes it. Prefer `HttpOnly` cookies for browser sessions.
- Numbers above are asked to be exact: they are guidance ranges; choose by the sensitivity
  of the app and check the source.

## Trade-offs

Server-side sessions allow instant revocation but need shared storage when scaled; stateless
signed sessions scale easily but are hard to revoke before expiry. Shorter timeouts reduce
theft windows and annoy users; step-up authentication for sensitive actions balances both.

## Common mistakes

- Reusing the pre-login session ID after login.
- Session ID in a URL.
- Cookies without `Secure` or `HttpOnly`, or without a `SameSite` policy and no other CSRF
  defense.
- Logout that only deletes the client cookie.
- Timeouts enforced only in JavaScript.

## Related

- Notes: `authn-passwords`, `authn-mfa-passkeys`, `authn-tokens-jwt`
