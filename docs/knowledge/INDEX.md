# Knowledge index — read this, then ONLY the matched note

Tier 1 **inline** = copied here (used most; frontmatter keeps `source:` + `copied:`). Tier 2 **reference** =
path only, read in place in SKILLS_TREE (`K` = `/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge`).
Tier 3 = not listed → `K/../tools/find "<need>" -k knowledge`. Promote a reference to inline when used a 2nd time.
Notes are generic: `CLAUDE.md` and `.claude/rules/*` win on conflict. Check `apply_when` / "Do not use when".

## Inline (docs/knowledge/)
| Note | Use when (gomoku-vn) |
|---|---|
| [perf-http-caching-cdn](perf-http-caching-cdn.md) | `?v=N` cache-busting, stale assets after deploy, Cloudflare caching/ETag (#125) |
| [appsec-xss-csrf](appsec-xss-csrf.md) | chat/username rendering, escape-on-wire vs decode-at-render, CSP, SameSite |
| [authn-sessions-cookies](authn-sessions-cookies.md) | JWT httpOnly cookie, session kick ("logged in on another device"), logout |
| [be-realtime](be-realtime.md) | socket.io reconnect, dropped/piling connections, polling vs WS, resync |
| [pattern-state](pattern-state.md) | room/game lifecycle (waiting→ready→playing→ended), tournament match states |

## Inline — project-authored (distilled from our own fix-log; read BEFORE touching the area)
| Note | Use when |
|---|---|
| [engineering-method-lessons](engineering-method-lessons.md) | ANY non-trivial fix: measure-don't-guess, instruction premise may be a no-op, fix the producing layer, merge drift, honest log corrections |
| [proxy-client-ip-rate-limit](proxy-client-ip-rate-limit.md) | anything keyed per IP: `getClientIp()`, limiters (`keyGenerator`), `MAX_ROOMS_PER_IP`, trust proxy |
| [static-assets-caching-csp-build](static-assets-caching-csp-build.md) | `express.static`/Cache-Control, compression, CSP/Helmet, Cloudflare beacon/ETag, stale `dist/`, `?v=` trap |
| [auth-session-oauth](auth-session-oauth.md) | sessions/cookies, `Cache-Control` on auth, OAuth state/callback, false "logged in elsewhere" kick |
| [server-client-clock-sync](server-client-clock-sync.md) | room/tournament clocks, `clockOffsetMs`, `serverNow()`, ready deadline (+ `diagnostic-page-sync` rule) |
| [realtime-reliability-resync](realtime-reliability-resync.md) | reconnect/grace, connect timeout, `game:move` ack/retry, watchdog resync, ghost viewers |
| [broadcast-fanout-perf](broadcast-fanout-perf.md) | lobby/room/tournament broadcast cost, delta vs snapshot, debounce, capacity/backlog |
| [mobile-layout-zen-ui](mobile-layout-zen-ui.md) | zen/mobile layout: z-index vs sheet, overlays vs drawer, grid tracks, dvh, touch handling |
| [i18n-and-server-message-codes](i18n-and-server-message-codes.md) | any server message shown to users, new error codes, aria-labels, language switcher |
| [ui-ux/INDEX](ui-ux/INDEX.md) | ANY UI/UX or front-end design work (36 notes: UX/IA/forms, a11y, CSS/state/media, perf, i18n, visual foundations, 10 style directions) — open the sub-index, then one note |
| [be-data-modeling-migrations](be-data-modeling-migrations.md) | database design for the platform: constraints, indexes from query patterns, versioned migrations (`server/db/`) |
| [data-schema-evolution](data-schema-evolution.md) | expand/migrate/contract when changing persisted data with old and new code live |
| [data-storage-selection](data-storage-selection.md) | when SQLite stops being enough (concurrency, scale-out, search, analytics) — see platform direction |

## Reference (SKILLS_TREE, not copied)
| Path under `K/` | Use when |
|---|---|
| `security/items/appsec-input-validation-injection.md` | allowlist validation at socket/HTTP edge, SQL/command injection |
| `security/items/authn-tokens-jwt.md` | JWT signing/expiry/revocation choices |
| `web-development/items/websec-headers-csp.md` | Helmet/CSP/HSTS header decisions (full-CSP feature) |
| `web-development/items/websec-map.md` | router to the other web-security notes |
| `web-development/items/be-auth-integration.md` | Google OAuth / login flow integration |
| `software-architecture/items/apptype-game-engine.md` | game loop / fixed time step (closest to the room clock; no clock-sync note exists) |
| `software-design/items/pattern-observer.md` | event fan-out (room broadcasts, lobby deltas) |
| `web-development/items/webtest-strategy.md` | where a test belongs (unit/integration/e2e), "bug with no failing test" |
| `web-development/items/webtest-e2e-browser.md` | reliable Playwright tests |
| `security/items/threat-risk-rating.md` | ranking audit findings (weak fit; only for triage) |

## Platform direction (planned: playing site → full platform) — reference only, copy when the work starts
| Path under `K/` | Use when |
|---|---|
| `web-development/items/lifecycle-stack-selection.md` | deciding stack/hosting for the platform (keep vanilla + Express vs framework) |
| `web-development/items/fe-framework-choice.md` | does the platform UI justify a JS framework |
| `software-architecture/items/apptype-web-frontend.md` | rendering strategy (static/server/client), micro-frontends cost |
| `web-development/items/be-api-style-for-web.md` | REST vs GraphQL, pagination/versioning for new list endpoints |
| `web-development/items/be-background-jobs.md` | rankings, emails, tournament scheduling off the request path |
| `web-development/items/be-file-uploads.md` | avatars/attachments |
| `web-development/items/webx-privacy-consent-analytics.md` | accounts, profiles, analytics, GDPR-style consent |
| `web-development/items/webops-monitoring.md` · `webops-release-rollback.md` · `webops-environments-hosting.md` | operating a multi-feature platform |
| `web-development/items/lifecycle-requirements-nfr.md` | measurable NFRs before scaling features |
Skills worth considering later (not copied): `skills/architecture-backend/items/prisma-database-setup` (only if moving off raw better-sqlite3), `skills/agent-orchestration/items/as-db` (Vietnamese, multi-agent data-layer role).

## Gaps
- None of the known recurring lessons are uncovered. Add a new project note when a fix needed 3+ rounds
  (see `engineering-method-lessons.md`), and register it here in the same edit.
- Notes marked `confidence: medium` (auth-session-oauth, realtime-reliability-resync, broadcast-fanout-perf)
  contain claims taken from fix-log text only; re-verify against code before relying on a number.
