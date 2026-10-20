---
description: Fix findings from a ui-audit report in small token-first edits (runs the ui-fix skill).
argument-hint: [finding ids, e.g. F1 F3]
---

Use the ui-fix skill on the latest ui-audit report.

Findings to fix: $ARGUMENTS

If no ids are given, fix every `block` and `major` finding, most severe first. Refuse to run if no ui-audit report exists.
