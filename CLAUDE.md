# Project Rules

Rules below apply to every session. Activity-specific workflows live in skills, loaded on demand —
don't duplicate them here:
- **Git branching/merging** (fix/*, feature/*, ui/*, dev↔main checkpoints, stash recovery) →
  `git-workflow` skill. Generic git skills (auto branch-naming, interactive rebase/squash) conflict
  with these fixed conventions — their `.claude/skills/` symlinks were removed; don't re-add them.
- **Playwright/e2e safety** (real-db protection, browser binaries, authenticated pages) →
  `playwright-e2e-safety` skill.
- **UI redesign process** (brainstorm → mockup → ui/* branch → live review → merge) →
  `design-workflow` skill.
- **Tracking-file layout, index/detail sync, fix-log append-only** (`TODO.md`, `instruction.md`,
  `docs/fix-log.md` and their `docs/*/` detail files) → `.claude/rules/tracking-files.md`
  (path-scoped: loads automatically when you read/edit any of those files). A `Stop` hook
  (`scripts/check-tracking-sync.js`) enforces the sync part automatically — see that rule file.

## Cache-busting version bump

All CSS/JS assets share one `?v=N` query string. **Both** of these must be covered by every bump:

- Every `client/*.html` file's `<link>`/`<script>` tags.
- **Every ES-module `import '...?v=N'` statement inside every file in `client/js/*.js`** — not just
  the `*-entry.js` files. Non-entry modules import each other with their own `?v=N`-suffixed
  specifier, and the browser resolves each distinct query string as a **separate module instance** —
  a stale `?v=` on one cross-import silently re-executes that module's top-level code a second time
  (this shipped a duplicate-socket bug twice for exactly this reason).
- Exception: `client/tournament-detail-mockup.html` and `client/tables-tournaments-mockup.html`
  intentionally stay pinned to an old, frozen version — never bump these.

**Whenever you modify any file under `client/css/` or `client/js/`, bump `?v=N` to `?v=N+1`
everywhere it appears.** A partial bump reintroduces stale-cache bugs, or worse, a silent
duplicate-module-execution bug with no visible symptom until it manifests as something unrelated
(e.g. a false "logged in on another device" kick).

Verify the bump is complete with:
```
grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup
```
Must show exactly **one** distinct `?v=N` value. Two or more means a file was missed — this grep is
the actual completion check, not eyeballing individual files.

## Bug-fix workflow: scope discipline and unit tests

- **Base the fix strictly on what was provided.** Don't silently extend a fix to cover speculative
  scenarios beyond the reported bug/finding — call those out separately (e.g. in `TODO.md`) instead.
- **Write a unit test for the fix whenever the affected code has, or can reasonably get, real
  coverage** (server-side Jest, `server/tests/**/*.test.js`). If the area has no test infrastructure
  (e.g. client-side `client/js/` currently has none), say so explicitly rather than skipping silently.
- **Never discard a test case after writing it.** It's the permanent regression guard, not a
  one-time proof — don't write it, run it once, then delete it.
- **Before implementing any `TODO.md` task, read the matching `instruction.md` entry.** `TODO.md`
  tracks *what*; `instruction.md` holds the reviewer's execution guidance (approach, pitfalls,
  "don't touch this" boundaries) for that same item. Missing entry is fine — not every task has one.
  If a fix deviates from `instruction.md`, note why in the fix's summary.

## `features/<slug>/`: pre-implementation feature discussion folders

Before a new feature idea becomes tracked work, work it through `features/<slug>/` — a
design-discussion stage prior to (not a replacement for) the "stack, don't perform directly" rule
below.

- Fixed structure, don't omit/rename: `user_story.md` (actors, user stories, rules, hard
  constraints); `diagram/uml_diagram/` (sequence diagrams); `diagram/` (state/class diagrams
  alongside); `planning.md` (open questions + resolution/implementation sequencing).
- Diagrams are Mermaid fenced code blocks inside Markdown, not separate `.puml`/`.drawio`/image files.
- Cross-link liberally between the four files (relative Markdown links).
- **A `features/<slug>/` folder does not by itself authorize implementation.** Once `planning.md`'s
  open questions are resolved with the user, formalize into `docs/todo/<CODE>-<slug>.md` + `TODO.md`
  and `docs/instruction/<CODE>-<slug>.md` + `instruction.md` *before* writing implementation code.
- Doc-only — can be written/updated straight on `main`, no branch needed.

## New requirements/tasks: stack, don't perform directly

When the user raises a new requirement/feature/task mid-conversation (not an explicit "do this now"):

- **Default to recording it, not implementing it**: a new `docs/todo/<CODE>-<slug>.md` + `TODO.md`
  line (what to do), and matching `docs/instruction/<CODE>-<slug>.md` + `instruction.md` line
  (approach, pitfalls, boundaries discussed).
- **Only perform directly if explicitly required now** ("do this now", "implement this", "fix it").
- This is triage of *new* work, not re-litigating tasks already assigned this turn.

## Security findings: verify against current code before filing

When triaging an external security report (audit, pentest note, CVE) into `TODO.md`/`instruction.md`:

- **Verify each claimed finding against current code/config before filing** — reports can be stale
  or wrong (precedent: a report claimed Helmet has no HSTS by default; it does — the filed item was
  rewritten to say so, not to blindly implement the suggested fix).
- **Check whether a prior review already covered or ruled out the same finding** (a `docs/todo/
  <CODE>-*.md` "Ngoài phạm vi" section) before filing it again — link back instead of duplicating.
- **A finding that's a deliberate, already-documented tradeoff gets closed as such**, not filed as
  new work.

## Root-cause diagnosis: check the layer below the symptom before calling a bug fixed

`docs/fix-log.md` has a recurring shape: an early fix patches the layer where the symptom is
*visible* (UI overlay, timing knob, config flag), ships, then the bug resurfaces from the layer it
actually *lives* in (proxy/infra, wire payload shape, build artifact, module resolution) — sometimes
2-6 iterations later. Confirmed precedents in the fix-log: chat XSS (3 rounds to "escape on the wire,
decode only at render"), room/IP quota (6 rounds to finding `socket.handshake.address` was always
`127.0.0.1` behind the Cloudflare Tunnel — see `getClientIp()`/`CF-Connecting-IP`), CSP/production
build (headers were correct but `dist/` was stale), `?v=N` cache-busting (the ES-cross-import bullet
above exists because the rule missed it once already).

When a fix's symptom keeps recurring, or a fix only touches the layer where the bug is *observed*
without touching the layer that *produces* the value — treat that as a signal the root cause isn't
found yet, not a reason to patch the same layer again. Trace the value back to its origin before
writing the fix, and verify against production-shaped conditions (real proxy, real build output)
when that layer could plausibly differ between dev and prod.

## Writing comprehensive test cases

Don't stop at one happy-path test — build coverage deliberately:

- **Enumerate the case space first.** Decision table (conditions × expected actions) for business
  logic with interacting conditions; valid *and* invalid transitions for state-driven code.
- **Equivalence partitioning + boundary value analysis** on inputs: one representative per class,
  plus boundary tests (the edge value, and one step on either side) — defects cluster at boundaries.
- **Write both deliberate groups**: basic/correctness cases (typical input) and rare/edge cases
  (nulls, empty collections, max-length, off-by-one, near-simultaneous/racing actions, disconnects
  mid-flow, invalid transitions) — edge cases are where real bugs hide.
- **Don't duplicate near-identical cases** — prefer parameterized tests over copy-pasted near-twins.
- **Assert actual expected output/state**, not just "it didn't throw." (Additive to, not a
  replacement for, "never discard a test case" above.)

## Feature completion checklist: test both layers, verify UX before calling it "done"

A feature isn't "done" off green backend tests alone — a fully-tested backend for a feature whose
client UI was never built, or whose setting never got wired in, still ships broken (precedent: B50
shipped with 806 passing backend tests and generated four client-side follow-up bugs). For any
feature touching both `server/` and `client/`:

- **Verify both layers.** Backend gets Jest tests per "Writing comprehensive test cases" above.
  Frontend has no automated runner — that doesn't mean skip it: drive the feature in a real browser
  (the `run` skill, or `playwright-e2e-safety`-compliant Playwright) end-to-end from the entry point
  a real user would use. Server-side test output alone is not frontend verification.
- **Check every user-facing control the design calls for actually exists in the DOM/UI**, not just
  that the backend accepts the data it would send.
- **Assess the real user flow's complexity** — step count, whether it assumes internals the user
  doesn't have, and whether a setting configured elsewhere (e.g. global Settings) actually carries
  through into this feature's screens the way a user would expect. Prefer the `ux-audit` skill (or
  an equivalent desktop+mobile walkthrough) before calling a feature done, not only after a report.
- Gates marking a feature's `docs/todo/<CODE>-*.md` entry "Trạng thái: đã xong" when it has a
  `client/` surface.

## Short/underspecified prompts: enhance, confirm, then execute

If a prompt is short or lacks detail needed to act safely (ambiguous scope, missing target/fix id,
several plausible interpretations):

- Use the `prompt-architect` skill to expand it into a clearer, more actionable version.
- Verify the enhanced interpretation with the user (`AskUserQuestion` or a short confirmation) before
  executing — don't silently act on a guessed interpretation.
- Only proceed once the user has confirmed the intended scope/context.
- Doesn't apply to prompts that are short but already unambiguous ("run tests", "yes", "continue").
