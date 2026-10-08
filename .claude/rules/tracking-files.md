---
paths:
  - "TODO.md"
  - "instruction.md"
  - "docs/todo/**"
  - "docs/instruction/**"
  - "docs/fix-log.md"
  - "docs/fix-log/**"
  - "docs/notes/**"
  - "docs/templates/**"
  - "docs/archive/**"
---

# Tracking files: small indexes, one detail file per item

The readers are agents; every byte read costs quota. So: **indexes stay one line per item, detail
lives one level down, and nothing is read whole.**

| Index (read-cheap) | Detail (read only the matched one) | Template |
|---|---|---|
| `TODO.md` — **open items only** | `docs/todo/<CODE>-<slug>.md` (`A07`, `B36`, `B170`) | `docs/templates/todo.md` |
| `docs/todo/DONE.md` — finished, 1 line each | same detail file | — |
| ~~`instruction.md`~~ — **frozen legacy** (pre-2026-10-09 guidance; new guidance goes in the todo's `Traps`/`Don't`) | `docs/instruction/*` read-only | — |
| `docs/fix-log.md` — append-only table | `docs/fix-log/<YYYY-MM-DD>-<slug>.md` | `docs/templates/fix-log.md` |
| — | `docs/notes/<date>-<slug>.md` (size-S, expiring) | `docs/templates/note.md` |

Frozen, never edit: `docs/archive/*-full-2026-10-08.md` (pre-compaction narratives of TODO.md /
instruction.md). Grep them if you need history; never open whole.

## Read cheaply (do this instead of Read/cat on an index)
```
node scripts/track.js 170        # index line + head of the todo detail (+ legacy instruction detail if any) for #170/B170
node scripts/track.js open       # open items, one line each
node scripts/track.js find hsts  # keyword over all indexes (+ fix-log rows)
node scripts/track.js log 5      # last 5 fix-log rows
```
`docs/fix-log.md` (~115 KB of rows) and `DONE.md` are lookup tables — use `track.js find`/`log` or
`grep -n`, never a full Read.

## Write
- **Language: English for new entries** (≈ half the tokens of Vietnamese); quote the user verbatim in
  their own language. Keep the status marker verbs below.
- **Add a task:** copy the template → `docs/todo/<CODE>-<slug>.md` (≤ 40 lines), then ONE line in
  `TODO.md`: `- **#N.** title \`[Model: Haiku|Sonnet|Opus]\` — [detail](docs/todo/<CODE>-<slug>.md)`.
  Index lines are titles, not narratives: no results, test counts or design notes there.
- **Finish a task = ONE edit touching both:** detail file gets `**Status:** ✅ DONE|FIXED|CLOSED|
  VERIFIED <date> …`; the `TODO.md` line is *moved* to the top of `docs/todo/DONE.md` prefixed `✅`.
  Evidence (tests, `?v=` bump, measurements) goes in the detail file / fix-log.
  A `Stop` hook (`scripts/check-tracking-sync.js`) blocks the turn if a newly-✅ item's detail file has
  no marker; `node scripts/check-tracking-sync.js --full` audits the whole backlog (31 legacy
  mismatches as of 2026-10-08 — pre-existing debt, don't relax the check).
- **Fix-log:** each fix = one new `docs/fix-log/<date>-<slug>.md` (template) + one row
  `| timestamp | ≤160-char summary | [detail](path) |`. **Append-only** — never edit/reword/reorder/
  delete an existing row or file; a wrong entry gets a new correcting entry. Timestamp = real write
  time (`date "+%Y-%m-%d %H:%M"`), matching the detail file's heading. Rows before 2026-08-01 are
  permanently stamped `2026-08-01 22:30`.
- No new `instruction.md` / `docs/instruction/` entries: approach, traps and boundaries live in the
  todo file (`Scope`, `Traps`, `Don't`). Legacy files stay as history; never edit them.

## Template sections: what each is for (templates are skeletons — no comments, fill every line or delete it)
- **todo**: `Area` (files → bounds exploration), `From` (provenance; `features/<slug>` for L), `Depends`;
  `Problem` (1–3 lines + evidence), `Scope` (ordered steps), `Don't` (boundary), `Traps` (looks right but
  is a no-op / recurs from a lower layer — delete the heading if none), `Why this way` (chosen
  approach, one-line rejected alternatives, `docs/knowledge/…` notes cited by path or "none"),
  `Done when` (observable checks incl. which tests). ≤ 40 lines. Priority/size/model live on the
  `TODO.md` index line (`[Model: …]`), not repeated here.
- **fix-log**: `Prompt` (user's words, verbatim/tight), `Root cause` (layer that produces the value),
  `Fix` (file:function, what was left alone, branch, `?v=` bump), `Verification` (tests added, `npm test`,
  real-browser?, what was NOT verified). ≤ 30 lines; heading starts with the real write timestamp.
- **note**: `Related` + ≤ 10 lines (what/why/trap). Expires at the next dev→main checkpoint.

## Task size — pick the artifact before writing any
| Size | Test (all hold) | Artifact |
|---|---|---|
| **S** | ≤ ~2 files, one layer, no design choice, trivially reversible | commit message only; `docs/notes/` note if a trap is worth keeping |
| **M** | several files or a real choice, reversible, one layer | `docs/todo/` detail + 1 index line |
| **L** | cross-layer · protocol/format/toolchain/process · hard to reverse | `features/<slug>/` → todo |
- Unsure → pick the larger. A **bug fix always gets a fix-log entry** (S fix: ≤ 12 lines); size only
  decides whether it also needs a todo.
- Notes expire: at each dev→main checkpoint promote (→ todo / fix-log) or delete.
