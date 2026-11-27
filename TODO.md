# TODO — open items only

Index. One line per item → detail `docs/todo/<CODE>-<slug>.md`. Finished items live one-per-line in
`docs/todo/DONE.md`; the long pre-compaction narratives are frozen in
`docs/archive/TODO-full-2026-10-08.md` (grep it, never read it whole).

Cheap lookups: `node scripts/track.js <N|CODE>` (index line + detail head) · `track.js open` ·
`track.js find <kw>`. Rules + templates: `.claude/rules/tracking-files.md`, `docs/templates/` (approach/traps live in the todo file; `instruction.md` is frozen legacy).

Add: detail file from `docs/templates/todo.md`, then ONE line below:
`- **#N.** title \`[Model: Haiku|Sonnet|Opus]\` — [detail](docs/todo/<CODE>-<slug>.md)`
Finish: in ONE edit, set `**Status:** ✅ DONE|FIXED|CLOSED|VERIFIED` in the detail file and MOVE the
line from here to the top of `docs/todo/DONE.md` prefixed `✅` (one-liner, no narrative — evidence goes
in the detail file / fix-log).

## Open
- **#504.** Redesign Puzzle pages buttons and controls to Modern style `[Model: Sonnet]` — [detail](docs/todo/B504-puzzle-controls-modern.md)
- **#505.** Evaluate promoting shared Modern control tokens from replay.css / puzzles.css into platform.css `[Model: Sonnet]` — [detail](docs/todo/B505-promote-modern-control-tokens.md)

