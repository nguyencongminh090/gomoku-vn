# 2026-10-22 13:05 — untracked Slash menu lists /ui-audit, /ui-brief, /ui-fix two or three times
## Prompt
"What's wrong with my Terminal?" (screenshot: `/ui` menu shows `/ui-fix` 3x, `/ui-brief` 2x, several `❯` markers);
"I even changed terminal but still" (fullscreen renderer already on).
## Root cause
Not the terminal or renderer. Commit 509a5ac (web-visual kit) installed both `.claude/skills/ui-{audit,brief,fix}/`
and same-named wrappers `.claude/commands/ui-{audit,brief,fix}.md` ("Use the ui-X skill…"). Both register `/<name>`,
so the menu lists each twice. Only these three names collide; other skills show once. No second skill copy exists
(checked /tmp, parent dirs, synced skills, worktrees, plugin cache). The `&lt;style&gt;` seen in the
`git-workflow` row is menu rendering; the SKILL.md holds a literal `<style>`.
## Fix
- Deleted the 3 wrapper commands; kept `.claude/commands/ui-style.md` (no same-named skill).
- Moved what the wrappers added into the skills: `argument-hint` (quoted string) in each SKILL.md frontmatter;
  `ui-audit` step 3 now says "No target given: audit the current project directory". ui-fix/ui-brief
  already covered their empty-argument behaviour.
- Branch `fix/claude-ui-command-skill-dupes` off `dev` (509a5ac exists only on dev). No `client/` change, no `?v=`.
- Upstream: the kit in SKILLS_TREE should drop these 3 commands too, or a reinstall brings the duplicates back (not edited here).
## Verification
- New `server/tests/claude-command-skill-collision.test.js`: fails with `ui-fix.md` restored, passes without.
- `npm test`: 191 suites, 3407 tests pass.
- Not verified: the `/ui` menu showing each name once after reload (needs the user's terminal).
