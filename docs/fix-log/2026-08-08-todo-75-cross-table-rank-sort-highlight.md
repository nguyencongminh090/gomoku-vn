# Fix log entry — 2026-08-08 18:31

## Prompt

Do #75.

## Action

TODO.md #75 (user report with screenshot, following on #64): the Round Robin Cross Table listed
players in registration order (`tournament.entries`) instead of by current rank, and had no
highlight for Champion/Runner-up once a tournament finished.

- `client/js/tournament-detail.js#renderCrossTable()`: row/column order now comes from
  `ranked = computeStandings()` (unchanged rank/tie-break math — `computeStandings()` itself was not
  touched) instead of `tournament.entries` directly, applied to both axes so the grid stays symmetric.
  Because `renderCrossTable()` already re-runs on every `renderAll()` (pairings patch/tournament
  update), the ordering updates in real time automatically — no new listener needed.
- Highlight: when `tournament.status === 'completed'`, rows with `rank === 1` get class
  `is-champion` + a gold `ph-trophy` icon; rows with `rank === 2` (excluding any rank-1 ties) get
  `is-runner-up` + a muted `ph-trophy` icon. No highlight while `active` (rank is still provisional).
- `client/css/tournament.css`: new `.cross-table tr.is-champion/.is-runner-up` + `.cross-table__trophy*`
  rules, reusing existing theme tokens (`--c-accent-light`/`--c-accent` for champion,
  `--c-surface-2`/`--c-ink-3` for runner-up) — no new color tokens invented.
- `client/js/i18n.js`: added `tdetail.cross_table_champion`/`tdetail.cross_table_runner_up` (vi/en),
  used as the trophy icon's `title` tooltip.
- Cache-bust bump `?v=86` → `?v=87` across every `client/*.html` and `client/js/*.js` (verified with
  the repo's standard grep check — exactly one distinct `?v=` value, mockups excluded).

## Decision

Tie-at-rank-1 handling (flagged as unresolved in `docs/instruction/B75-*.md` point 5, "ask the user
if this actually occurs during testing"): applied the instruction's proposed fallback — every entry
with `rank === 1` is highlighted as Champion (not just the first row in sorted order), and Runner-up
is whichever entries have `rank === 2` after excluding rank-1 ties. No rank-1 tie occurred during
live verification, so this was not re-confirmed with the user; documented here as the implemented
behavior in case it needs revisiting later.

Branch base: `TODO.md`/`instruction.md` #75 exists only on `dev` (`git show main:TODO.md | grep
'#75'` → no match), so per CLAUDE.md's branch-base exception this was branched off `dev` and merged
back into `dev`, not `main`.

## Summary output

Verified end-to-end in a real browser via a subagent (Playwright, 4 accounts — 1 organizer + 3
players, real Round Robin tournament), following the repo's DB-safety protocol (real
`server/db/gomoku.db` moved aside, throwaway server on an unused port, real db restored byte-identical
afterward — 208896 bytes, confirmed before/after). Confirmed: (a) while `active`, rows/columns already
reorder by current rank with zero `is-champion`/`is-runner-up` rows; (b) once `completed`, the actual
rank-1 finisher got `is-champion` (gold row+icon) and the rank-2 finisher got `is-runner-up`
(silver/gray row+icon), rank-3 had neither, and colors were visibly distinct in screenshots. Backend:
`npm test` — 39 suites / 931 tests pass unchanged (client-only change, no new backend coverage
needed, per CLAUDE.md's "say so explicitly" rule for areas with no test infra).
