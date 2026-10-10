# 2026-10-10 21:44 — untracked (found in #214 review) lobby rated-match icon missing
## Prompt
User screenshot of play3cr.dpdns.org/index.html: "icon cho Rated game bị mất" (Đấu xếp hạng shows a gap, no ▶).
## Root cause
/assets/* is served `immutable, max-age=1y`. `PlatformShell.icon()` (platform-shell.js) and settings-page.js
build sprite URLs from `SPRITE = '/assets/icons/phosphor-sprite.svg'` — no `?v=`, so cache-bust never touches it.
Returning browsers keep the pre-#212 sprite, which lacks `ph-regular-play` (added in 9158394); `sword` predates it, so it shows.
## Fix
`SPRITE` → `'/assets/icons/phosphor-sprite.svg?v=255'` in platform-shell.js + settings-page.js (now bumped by
scripts/cache-bust.js; single ?v=255, 491 refs). platform-shell.test.js crown assertion made version-agnostic.
On `ui/icon-system` (uncommitted, alongside #214) — to be its own commit.
## Verification
- New client/tests/sprite-url-versioned.test.js: every sprite literal in client/js has ?v= (failed on old code: 2 files).
- `npm test` 2747/2747.
- Real browser (isolated server copy :3100, member login, Playwright route serving the aa19484 sprite for the
  unversioned URL = stale cache): old shell.js → gap (reproduced); fixed → ▶ renders. Not verified on the live site.
