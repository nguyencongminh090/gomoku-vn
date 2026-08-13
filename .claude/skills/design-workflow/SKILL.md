---
name: design-workflow
description: "Uniform, staged process for any new or redesigned UI screen in gomoku-vn — brainstorm/context, design brief, mockup candidates, ui/<style> branch implementation, live review, user decision, merge. Ensures the agent asks the right structured questions at each stage instead of jumping straight to code, and never re-derives the board/stones or backend locks. Trigger with 'design workflow', 'brainstorm design', 'brainstorm a redesign', 'new UI design', 'redesign this screen', 'explore UI styles for X', or when the user describes a screen that 'doesn't fit' or 'needs a new look'."
compatibility: claude-code-only
---

# Design workflow

A fixed sequence of stages for taking a UI idea from "this doesn't feel right" to a merged design,
used any time a screen in this project gets redesigned or newly built. The point of this skill is
to remove ambiguity: at each stage the agent knows exactly what to produce and what to ask the user,
instead of guessing or skipping straight to mockups/code.

This skill governs the *design* process. The underlying git mechanics it produces work on top of
(`ui/<style>` branches, backend lock, board/stones lock) are defined in the `git-workflow` skill —
load that if it's not already in context. This skill does not change those rules; it sequences the
work that leads up to using them.

## Locked boundaries (apply at every stage, no exceptions)

- **Backend is out of scope.** No `server/` changes at any stage of this workflow. If a candidate
  design seems to need one, stop and flag it — see "New requirements/tasks" in `CLAUDE.md`.
- **Board/stones are out of scope.** `client/js/board.js` and the board-specific rules in
  `client/css/game.css` (grid, cell sizing, stone rendering/animation, touch/click handlers) are
  never touched by this workflow. Every stage below compares layout/chrome *around* the board, not
  the board itself.

If a stage's output would violate either lock, stop and surface it to the user explicitly rather
than proceeding — don't silently route around the lock.

## Stage 0 — Trigger check

Confirm this is actually a design-exploration request, not a small tweak. Small, single-direction
CSS/copy fixes ("make this button bigger", "fix this spacing") don't need the full workflow — just
do them per normal bug-fix/feature rules. Use this workflow when the user is exploring *how a screen
should look/feel*, especially when comparing options or when something "doesn't fit."

## Stage 1 — Brainstorm & context (the form)

Before any visual work, ask the user the following, using `AskUserQuestion` where the answers are
genuinely open decisions (don't ask questions you can already answer from the codebase or prior
conversation):

1. **Which screen/flow** is this for? (exact file(s) — e.g. `client/lobby.html`, `client/room.html`)
2. **What's wrong with the current one?** Get the concrete complaint (e.g. "doesn't fit a Gomoku
   site") turned into specifics: too generic/SaaS-like? wrong mood? wrong information density?
   colors/typography clash with a board-game feel?
3. **What should it feel like instead?** Reference points are useful here — other Gomoku/Go/chess
   sites, board-game aesthetics, minimal vs. ornate, dark vs. light, cultural/visual motifs (e.g.
   wood-grain board textures, ink/brush stroke accents) — whatever the user has in mind, even
   loosely.
4. **How many style directions** to explore in parallel (default 2, per the `ui/style_a`/`ui/style_b`
   convention already in `CLAUDE.md` — confirm if the user wants more).
5. **Any hard constraints beyond the standing locks** (e.g. must keep a specific layout region,
   must support a specific screen size first)?

Do not proceed to Stage 2 until this is answered — vague answers here produce vague mockups later.

## Stage 2 — Design brief

Turn Stage 1's answers into a short, written brief — one short paragraph per style direction stating
its distinct positioning (e.g. "Style A: minimalist dark wood-board theme, high information density"
vs. "Style B: warm paper/ink theme, generous whitespace"). Keep this to a few sentences per
direction, not a full spec. Confirm the brief with the user before building anything — a quick
"here's what I'll build for each direction, sound right?" — since this is the cheapest point to
redirect, before any code exists.

If the redesign is broad enough to represent new feature scope (not just a visual reskin — e.g. it
implies new interactions, not just new styling), stop and route it through a `features/<slug>/`
discussion folder per `CLAUDE.md` instead of continuing this workflow directly.

## Stage 3 — Mockup candidates

For each confirmed style direction, build a static visual candidate before touching real app code —
either as a standalone mockup HTML file (following this repo's existing `*-mockup.html` convention)
or directly as the first commit on that direction's future branch, whichever the user prefers. This
is the fastest/cheapest point to compare directions, before wiring them into the real screen.

## Stage 4 — Branch implementation

Once mockups are approved (or skipped by user preference), implement each direction for real:

- One `ui/<short-kebab-slug>` branch per direction, branched off `dev`, per the `git-workflow` skill.
- Respect the backend and board/stones locks (see above) on every branch.
- Commit incrementally within each branch (`commit → commit → ... → final`) rather than one giant
  commit — this keeps each direction's history reviewable on its own.
- Bump `?v=N` cache-busting per `CLAUDE.md`'s rule whenever `client/css/`/`client/js/` changes,
  independently on each branch.

**Restructure the layout to match the mockup — don't just re-skin the existing structure.** A
token-override stylesheet (redefining CSS variables, flattening shadows/icons on top of the *current*
DOM) can pass tests and render without errors while still not matching the mockup, if the mockup uses
a different DOM shape (column count, container nesting, control affordance — button vs. text link,
badge vs. plain text). Before treating an implementation as matching its mockup:
- Compare DOM shape, not just palette — open both side by side and check column count, nesting, and
  control affordance actually match. A "restyle" that never touches the `.html` file is a signal to
  double-check, not a shortcut worth taking.
- Re-derive the underlying data flow for anything the mockup collapses or relocates (a sidebar
  becoming a line of prose, a count-pill becoming a sentence) — check what real data drives that
  element in `client/js/` today, then map it onto the mockup's shape, rather than copying the
  mockup's placeholder text verbatim (ask the user before adopting a mockup's exact wording if it
  reads as informal for the live product's tone).
(Precedent 2026-08-12, `ui/zen-minimal`: a token-override-only pass on the lobby kept the old
two-column sidebar-card grid while the mockup was a single borderless column — grayscale-and-flatten
made it monochrome, not the new design. Fixed by rebuilding the DOM to match, same branch.)

## Stage 5 — Live review

For each `ui/<style>` branch, verify it live before presenting it to the user — per the "Feature
completion checklist" rule in `CLAUDE.md`, a mockup or code review is not sufficient:

- Run the branch via the `run` skill (or manually start the dev server) and actually view the
  screen in a browser.
- Check both desktop and mobile viewport widths.
- Where useful, use the `ux-audit` skill for a fuller walkthrough, especially if the direction
  changes interaction flow, not just visuals.
- Capture screenshots for each candidate — these are what the user compares in Stage 6, so make
  sure they're representative (real content, not lorem ipsum, where practical).

## Stage 6 — Present & user decision

Present all reviewed candidates side by side (screenshots, and/or an Artifact comparison page if
that communicates the differences more clearly than text) and ask the user to choose one. Do not
merge speculatively or suggest a "best" choice framed as a decision already made — this is the
user's call per the standing `ui/*` rule that "no `ui/*` branch merges into `dev` on its own."

## Stage 7 — Merge & cleanup

Once the user picks a winner, follow `CLAUDE.md`'s `ui/<style>` merge steps exactly:

1. Merge only the winning branch into `dev` with a regular merge commit.
2. Resolve/confirm `?v=N` is consistent across the whole repo post-merge (the verification grep in
   `CLAUDE.md`'s "Cache-busting version bump" section).
3. Delete every `ui/<style>` branch from that round, winner included, unless the user asks to keep
   one for reference.
4. If the change touches a tracked `TODO.md`/`instruction.md` item, update it per the index/detail
   sync rule.

## What this skill does not do

It does not replace `features/<slug>/` discussion folders for genuinely new feature scope, does not
grant any exception to the backend or board/stones locks, and does not authorize skipping the live
review stage even when a candidate "looks done" in code.
