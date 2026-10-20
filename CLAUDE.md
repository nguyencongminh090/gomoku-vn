# gomoku-vn — agent rules

Node/Express + socket.io + SQLite server (`server/`), vanilla ES-module client (`client/`, Vite build →
`dist/`). Loaded every session, so this file holds **hard rules and pointers only**. Detail lives in
path-scoped `.claude/rules/*.md` (auto-load when you touch matching files) and skills (on demand).

## Commands
`npm test` (server+client jsdom, ~11 s) · `npx jest <file>` while iterating · `npm run test:e2e`
(read `playwright-e2e-safety` first) · `node scripts/cache-bust.js [--write]` · `node scripts/track.js …`
UI audit: skill `ux-audit`, site settings (URL, auth, pages, allowlist) in `.audit/README.md`.

## Hard rules
1. **Do only what was asked now.** A new requirement raised mid-conversation is *recorded*, not built
   (size-L idea → `features/<slug>/`; otherwise a `docs/todo/<CODE>` file + 1 `TODO.md` line). Build on
   "do this now / implement / fix it". Doesn't re-litigate work assigned this turn.
2. **Read the item's `docs/todo/<CODE>` file before implementing it** (`node scripts/track.js <N>`: Scope,
   Don't, Traps); if the fix deviates, say why in the fix-log. `track.js` also prints any legacy `docs/instruction/` file.
3. **Every bug fix = root cause first, a kept regression test, and one fix-log entry** — scope strictly
   what was reported. → `.claude/rules/testing.md`
4. **Any edit under `client/` → `node scripts/cache-bust.js --write`** (per-file content
   hash `?v=`; never hand-edit), verified by `node scripts/cache-bust.js` (must print OK). → `.claude/rules/cache-busting.md`
5. **Tracking files are small indexes + one detail file per item; fix-log is append-only.** Never Read an
   index whole; use `track.js`. → `.claude/rules/tracking-files.md`
6. **Git:** `fix/*` off `main` (or `dev` if the code/entry exists only there), `feature/*` and `ui/*` off
   `dev`; one commit per fix; merge commits only; `main` is PR-only except commits touching only `docs/**` or `*.md`; a fix merged to `main` also lands
   on `dev` the same session. → `git-workflow` skill
7. **Feature "done"** needs backend tests + jsdom + a real-browser pass; **UI redesign** goes through
   `design-workflow`; **e2e/Playwright** through `playwright-e2e-safety`. Clock work (`TimerManager`,
   `room-socket`, `game-ui`, `timer-sync-core`, `client/js/diag/**`) → `.claude/rules/diagnostic-page-sync.md`.
8. **Ambiguous prompt** (no item id / file / behaviour to act on): ask ONE `AskUserQuestion` with concrete
   options before acting. Don't run `prompt-architect` for this — it is for explicit "improve this prompt".
   Already-clear short prompts ("run tests", "yes", "continue", "Do #B170") just execute.
9. **Consistency:** one entity = one source. Avatars/images display identically on every page, and DB ↔
   file store change together (`?v=` bumped). → `.claude/rules/consistency.md`

## Reasoning with knowledge
Before a design / architecture / security / protocol / UX / storage decision, ground it in a documented note, not habit:
`docs/knowledge/INDEX.md` first, then SKILLS_TREE `tools/find`. Procedure → `.claude/rules/knowledge.md`.
Size L / hard-to-reverse decision → skill `deep-reasoning`.
Precedence: this file, `.claude/rules/*` and user instructions > knowledge notes.

## Token / quota economy
- **Locate before read.** `codegraph_explore` (or `codegraph explore "<names>"`) first — one call returns
  source + callers. Then `Read` with `offset/limit`, never whole big files. `grep -n` > Read for lookups.
- **Never Read** `TODO.md`/`instruction.md`/`DONE.md`/`docs/fix-log.md`/`docs/archive/*` whole — use
  `scripts/track.js`. Never Read `package-lock.json`, `dist/`, `node_modules/`, `test-results/`, `docs/*.json`.
- **Don't re-derive:** facts already in this conversation, or settled in a detail file, are not re-checked.
- **Run narrow, summarize loud failures only:** `npx jest <file>` while iterating, full `npm test` once
  before commit; pipe long output through `| tail -30`. Don't start servers/browsers unless the task
  needs a real-browser pass.
- **Subagents cost a cold start** (re-reading context). Use `Explore` only for sweeps that would take
  > 3 greps; never for a file you know. Implement inline. Spawn `general-purpose`/`Plan` only when
  asked, or for work that truly parallelizes. Only exception: SKILLS_TREE multi-query/copy work → Agent.
- **Skills load on demand** — invoke only the one that matches the task; don't preload.
- **Write terse:** tracking text in English, index lines are titles, ≤ 40-line todo files, ≤ 30-line
  fix-log entries. Final replies: result + what's unverified; no re-narrating the diff.

## Where detail lives
| Topic | Location |
|---|---|
| Knowledge lookup procedure | `.claude/rules/knowledge.md` |
| Design-decision knowledge (inline + SKILLS_TREE references) | `docs/knowledge/INDEX.md` |
| UI/UX + front-end + visual-style knowledge | `docs/knowledge/ui-ux/INDEX.md` |
| Fix/test/feature-done discipline, root-cause precedents | `.claude/rules/testing.md` |
| `?v=<hash>` cache-busting | `.claude/rules/cache-busting.md` + `scripts/cache-bust.js` |
| Index/detail layout, status markers, task size, `[Model: …]` tier per task, templates (todo+fix-log+note) | `.claude/rules/tracking-files.md`, `docs/templates/` |
| `features/<slug>/` design folders | `.claude/rules/design-intake.md` |
| Room clock ↔ `/diag` coupling | `.claude/rules/diagnostic-page-sync.md` |
| Branching, merges, `dev`↔`main`, stash recovery | `git-workflow` skill |
| Playwright / real-DB protection | `playwright-e2e-safety` skill |
| New/redesigned UI screen | `design-workflow` skill |
