---
paths:
  - "TODO.md"
  - "docs/todo/**"
  - "instruction.md"
  - "docs/instruction/**"
  - "docs/fix-log.md"
  - "docs/fix-log/**"
---

# Tracking-file layout: index + detail files (query and append)

`TODO.md`, `instruction.md`, and `docs/fix-log.md` are lightweight **indexes** — structural headings
plus one line per item linking to a detail file. Read the index first (it's small); actual content
lives one level down, one file per item:

- `docs/todo/<CODE>-<slug>.md` — `CODE` is the item's number as used in `TODO.md` (e.g. `A07`, `B36`).
- `docs/instruction/<CODE>-<slug>.md` — `CODE` matches the `instruction.md` heading (`A1`, `B37`, or
  `S39`/`S44` for items using the global `§NN` scheme — `§` is written `S` in filenames only).
- `docs/fix-log/<YYYY-MM-DD>-<slug>.md` — one file per fix-log row, named by date + opening-words slug.

**Query:** grep/scan the index for the item number/keyword, then `Read` only the matched detail
file(s) (typically 1-5KB) instead of the whole original file.
**Append:** write one new detail file, then add one new line/row to the matching index. Never re-open
or edit an existing detail file's content when adding unrelated history.

## Index/detail sync: status markers move together, in one edit

`TODO.md` marks a finished item with a leading `✅` on its index line; the matching
`docs/todo/<CODE>-<slug>.md` marks the same fact in its own completion marker. These describe the
same fact and must never be updated one without the other:

- **Finishing a task = one edit that touches both files**, same turn. Neither file is "the real
  one" — an index line without a matching detail-file marker, or vice versa, is a drift bug.
- **Canonical marker format for new/updated entries**: `**Trạng thái:** ✅ <verb>`, where `<verb>` is
  one of `ĐÃ XONG` (implemented), `Đã sửa` (fixed), `Đã đóng` (closed, won't-fix/not-a-bug), or
  `Đã đo` (measured/verified) — pick whichever matches what actually happened, then add a short
  summary + test/verification notes on the same or following lines. Older entries also use bare
  inline `**✅ ĐÃ XONG**` (no `Trạng thái:` label) or lowercase `đã xong` without the checkmark —
  those are grandfathered, not wrong, but new entries should use the labeled `**Trạng thái:**` form
  since it's what both this rule and the automated check below expect to find.
- **Before telling the user a task is/isn't done, read both.** If they disagree, bring the index in
  line with the detail file (it carries the evidence — test output, verification notes).

### Automated enforcement

A `Stop` hook (`.claude/settings.json` → `scripts/check-tracking-sync.js --hook`) runs this check
automatically after every turn that changes which `TODO.md` items are marked `✅` (compared to the
last commit) — it blocks the turn from ending if a newly-✅-marked item's detail file has no
completion marker, and tells you which item(s) need fixing. This only covers *newly introduced*
drift in the current session, not the pre-existing backlog (checking all ~120 items on every Stop
would be slow and would permanently block on old debt unrelated to the current task).

To audit the **entire** backlog (not just this session's changes) — e.g. periodically, or after a
batch cleanup — run manually:
```
node scripts/check-tracking-sync.js --full
```
This prints every `✅`-marked item whose detail file lacks a completion marker and exits non-zero if
any are found. As of 2026-08-13, running this against the existing backlog found 29 such items
(mostly early items from before the `**Trạng thái:**` convention existed) — that's pre-existing debt,
not something the Stop hook will flag going forward; fix it opportunistically or as its own tracked
cleanup task, not by relaxing the check.

`instruction.md` ↔ `docs/instruction/*.md` has no done/not-done marker (execution guidance, not a
status tracker) — nothing to sync there beyond "read the matching entry before implementing."

## `docs/fix-log.md`: append-only, every row timestamped

- A new fix = one new `docs/fix-log/<date>-<slug>.md` file (`## Prompt` / `## Action` / `## Decision`
  / `## Summary output`) + one new row in the `docs/fix-log.md` index. Never edit, reword, reorder,
  or delete an existing row/file. A wrong past entry gets a new correcting entry, not a rewrite.
- Every index row's `Timestamp` column matches its detail file's `# Fix log entry — <timestamp>`
  heading, set to the real wall-clock time the entry is *written* (`date "+%Y-%m-%d %H:%M"`), not
  when the underlying fix was made if those differ — it's the only real ordering signal.
- Rows written before 2026-08-01 are retroactively stamped `2026-08-01 22:30` (permanent, don't
  re-stamp).
