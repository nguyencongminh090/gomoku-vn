#!/usr/bin/env bash
# Stop hook: remind to run /ui-audit when UI files are newer than the newest of
# {newest ui-audit-*.md in the project root, a per-session stamp file}.
# The stamp is created on the first Stop of a session (silent run), so old untouched
# files never nag. Warn-only; always exits 0.
. "$(dirname "$0")/lib.sh" 2>/dev/null || exit 0
input=$(cat 2>/dev/null) || input=""
# Avoid loops: when the stop hook already fired once, stay silent.
if [[ "$input" =~ \"stop_hook_active\"[[:space:]]*:[[:space:]]*true ]]; then exit 0; fi
dir=$(project_dir)
[ -d "$dir" ] || exit 0
key=$(json_get_from "$input" session_id)
key=${key//[^A-Za-z0-9_-]/_}
[ -n "$key" ] || key=$(printf '%s' "$dir" | cksum | tr ' ' '_')
stamp="${TMPDIR:-/tmp}/ui-audit-stamp-$key"
first=0
if [ ! -e "$stamp" ]; then
  # Stamp not writable: no output, compare against the report only (old behavior).
  touch "$stamp" 2>/dev/null && first=1
fi
[ "$first" -eq 1 ] && exit 0
report=$(ls -t "$dir"/ui-audit-*.md 2>/dev/null | head -n 1)
ref=$report
if [ -e "$stamp" ]; then
  ref=$(ls -t ${report:+"$report"} "$stamp" 2>/dev/null | head -n 1)
fi
args=()
[ -n "$ref" ] && args=(-newer "$ref")
hit=$(find -H "$dir" \( -name node_modules -o -name .git -o -name dist -o -name build \) -prune -o \
  -type f \( -name '*.css' -o -name '*.scss' -o -name '*.tsx' -o -name '*.jsx' -o -name '*.vue' \
  -o -name '*.svelte' -o -name '*.html' \) "${args[@]}" -print -quit 2>/dev/null)
[ -n "$hit" ] && emit_message "UI files changed since the last audit. Run /ui-audit."
exit 0
