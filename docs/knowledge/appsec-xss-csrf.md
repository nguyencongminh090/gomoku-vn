---
name: appsec-xss-csrf
description: Cross-site scripting and cross-site request forgery - output encoding, safe sinks and CSP against XSS; tokens, SameSite and fetch metadata against CSRF
domain: security
tags: xss,csrf,web,csp,samesite
apply_when: "building or reviewing a browser-facing web app that renders user content or performs state-changing requests with cookie-based sessions"
sources: "OWASP XSS Prevention Cheat Sheet (E3); OWASP CSRF Prevention Cheat Sheet (E4)"
last_reviewed: 2026-09-25
confidence: medium
source: /run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/security/items/appsec-xss-csrf.md
copied: 2026-10-09
---

# XSS and CSRF

## XSS (script runs in your page)

Untrusted data reaching the browser as markup or script lets an attacker act as the user.
Defenses, in order:

1. **Use the framework's automatic escaping** and treat its escape hatches (raw HTML
   rendering functions, "trust this string" APIs) as dangerous; review each use.
2. **Encode output for its context:** HTML body, HTML attribute (quote attributes), JavaScript
   data, CSS value and URL each need different encoding. Some places cannot be made safe by
   encoding: never put untrusted data in script blocks, comments, CSS blocks or as tag or
   attribute names.
3. **Sanitize when users may supply formatted HTML:** a maintained sanitizer library (for
   example DOMPurify), kept patched, because encoding would destroy the formatting.
4. **Prefer safe DOM sinks** that treat data as text (`textContent`, `setAttribute`,
   `createTextNode`, `.value`) over ones that parse markup.
5. **Content Security Policy** as defense in depth, tuned per application; it is not the
   primary control.

## CSRF (the browser sends your cookie for an attacker's request)

Applies when authentication rides on cookies that the browser attaches automatically.

- **Synchronizer token:** per-session unpredictable token checked on state-changing
  requests; fits server-rendered apps.
- **Double-submit cookie** (signed variant preferred): no server state; fits stateless
  services.
- **Custom request header** for API calls from your own JavaScript: relies on the browser
  preflight rules, so cross-site pages cannot add it.
- **Fetch metadata** (`Sec-Fetch-Site`): reject cross-site state-changing requests; needs
  HTTPS and modern browsers, with origin checking as fallback.
- **SameSite cookies** (`Lax` or `Strict`): useful defense in depth, but OWASP says it does
  not replace a proper CSRF defense in most deployments.
- Never change state on GET requests.

## Use when

Any browser application with sessions (`authn-sessions-cookies`), user-generated content, or
templates that print request data.

## Do not use when

- CSRF tokens are unnecessary for APIs that authenticate with a header value the browser does
  not add automatically (for example a bearer token you set in code), but then XSS matters
  more because script can read that token if stored where scripts reach.
- CSP alone is planned as the XSS fix; it is a second layer.
- HTML sanitising is used where plain-text output would do; encode instead.

## Trade-offs

Framework encoding is cheap and reliable until bypassed by raw-HTML features. Tokens add a
field to every state-changing form or call; SameSite `Strict` can break legitimate
cross-site navigation flows (link from email lands logged out).

## Common mistakes

- Encoding for the wrong context (HTML encoding inside a script block).
- Building HTML with string concatenation in client code.
- Turning off framework escaping "to allow formatting".
- CSRF token accepted when missing, or shared across users.
- Treating POST-only endpoints as protection by themselves.

## Related

- Notes: `appsec-input-validation-injection`, `authn-sessions-cookies`, `appsec-api-security`
