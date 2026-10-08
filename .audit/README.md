# gomoku-vn settings for the `ux-audit` skill (read this instead of stack discovery)

- **URL:** local `http://localhost:3000` (`PORT` env, default 3000; `npm run dev:stable`). Live domain is the deploy behind Cloudflare Tunnel — audit it only if the user names it.
- **Before starting the server yourself:** follow `playwright-e2e-safety` (move the real DB aside, restore after). Never restart a server the user already runs.
- **Auth:** drive the real UI — `login.html` → `#btn-guest` (see `playwright-e2e-safety`); a raw API cookie leaves `localStorage.gvn_user` unset and `requireAuth()` bounces to login.
- **Pages:** `client/{login,oauth-complete,index(lobby),room,history,tournament,tournament-match,diagnostic}.html`. `requireAuth()` gates lobby, room, tournament detail, tournament-match. Skip every `*-mockup.html` (frozen design drafts).
- **Needs 2 sessions:** room play, draw/undo/swap2, tournament match, spectator — use two browser contexts.
- **Viewports:** skill default (375/768/1024/1280/1440). Mobile + zen drawer/bottom-sheet are the historical regression area (`docs/knowledge/mobile-layout-zen-ui.md`).
- **Allowlist:** `.audit/config.yml` (empty — add noise only after proving it is not a bug).
- **Evidence/report:** `docs/audits/<date>/`, report `docs/audits/ux-audit-YYYY-MM-DD.md`. Findings become `docs/todo/` items, not direct fixes (CLAUDE.md rule 1).
- **Ground in:** `docs/knowledge/ui-ux/INDEX.md` (heuristics, a11y, responsive) — cite the note per finding.
