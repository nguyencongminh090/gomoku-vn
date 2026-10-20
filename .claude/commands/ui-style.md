---
description: Print the Fits, Do not use when and Keep it usable parts of one vstyle note (lookup only).
argument-hint: <style name, e.g. glassmorphism>
---

Look up one visual style note. Lookup only: change no files.

Notes directory: `${SKILLS_TREE:-/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE}/knowledge/visual-design/items/`

Steps:

1. List files matching `vstyle-*$ARGUMENTS*.md` in that directory (case-insensitive glob on the name part).
2. If zero files match, or `$ARGUMENTS` is empty, or more than one matches: print the names of all matching files (all `vstyle-*.md` when none match or the argument is empty), without the `.md` suffix, and stop.
3. If exactly one file matches: print the note name, then only these sections, copied verbatim from the file. A section starts at a `## ` heading and ends before the next `## ` heading. Match headings by prefix, because some carry a suffix in parentheses (for example `## Keep it usable (Sherwin 2019, Paul 2023)`):
   - heading starting with `Fits`
   - heading starting with `Do not use when`
   - heading starting with `Keep it usable`
4. If one of the three sections is absent, say so for that section. Print nothing else from the note.
