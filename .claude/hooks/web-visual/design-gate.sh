#!/usr/bin/env bash
# UserPromptSubmit hook: nudge to run ui-brief when a design request has no DESIGN.md.
# Warn-only; always exits 0.
. "$(dirname "$0")/lib.sh" 2>/dev/null || exit 0
input=$(cat 2>/dev/null) || input=""
prompt=$(json_get_from "$input" prompt)
[ -n "$prompt" ] || exit 0
shopt -s nocasematch
case "$prompt" in
  *design*|*redesign*|*restyle*|*"landing page"*|*website*|*"giao diện"*|*"thiết kế"*) ;;
  *) exit 0 ;;
esac
[ -f "$(project_dir)/DESIGN.md" ] && exit 0
emit_context UserPromptSubmit "No DESIGN.md found. For design work run the ui-brief skill first."
exit 0
