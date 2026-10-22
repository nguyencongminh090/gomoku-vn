#!/usr/bin/env bash
# Shared helpers for web-visual hooks. Source it: . "$(dirname "$0")/lib.sh"
# Bash + coreutils only, no network, no jq. Hooks are warn-only: scripts exit 0 always.
#
# Interface:
#   json_get <key>              read JSON from stdin, print first string value of <key>
#                               (empty on empty/malformed input). Consumes stdin.
#   json_get_from <json> <key>  same, but takes the JSON as an argument. Preferred:
#                               scripts do `input=$(cat)` once, then call this repeatedly.
#   emit_context <event> <text> print {"hookSpecificOutput":{"hookEventName":..,"additionalContext":..}}
#   emit_message <text>         print {"systemMessage":..}
#   project_dir                 print $CLAUDE_PROJECT_DIR, or $PWD when unset/empty
# Only string values are supported by json_get (numbers, objects: empty output).

json_escape() { # $1 -> JSON-escaped string body (no surrounding quotes)
  local s="$1" i c
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\n'/\\n}
  s=${s//$'\t'/\\t}
  s=${s//$'\r'/\\r}
  for i in 1 2 3 4 5 6 7 8 11 12 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 127; do
    printf -v c '\\x%02x' "$i"
    printf -v c "$c"
    case "$s" in *"$c"*) printf -v u '\\u%04x' "$i"; s=${s//"$c"/$u} ;; esac
  done
  printf '%s' "$s"
}

emit_context() { # <event> <text>
  printf '{"hookSpecificOutput":{"hookEventName":"%s","additionalContext":"%s"}}\n' \
    "$(json_escape "$1")" "$(json_escape "$2")"
}

emit_message() { # <text>
  printf '{"systemMessage":"%s"}\n' "$(json_escape "$1")"
}

project_dir() { printf '%s' "${CLAUDE_PROJECT_DIR:-$PWD}"; }

json_get_from() { # <json> <key>; key matched at any depth, first match wins
  # Single awk pass, linear in input size: locates "key", takes only that raw string
  # value, decodes escapes once. Sibling values (e.g. a huge "content") are never decoded.
  [ -n "$1" ] || return 0
  printf '%s' "$1" | LC_ALL=C awk -v key="$2" '
  BEGIN { RS = "\001"; ORS = "" }
  function hexv(h,   i, c, v) { v = 0; h = tolower(h)
    for (i = 1; i <= 4; i++) { c = index("0123456789abcdef", substr(h, i, 1)); v = v * 16 + c - 1 }
    return v }
  function utf8(v) {
    if (v < 128) return sprintf("%c", v)
    if (v < 2048) return sprintf("%c%c", 192 + int(v / 64), 128 + v % 64)
    if (v >= 55296 && v < 57344) return "?"
    return sprintf("%c%c%c", 224 + int(v / 4096), 128 + int(v / 64) % 64, 128 + v % 64) }
  function decode(raw,   out, m, h) {
    gsub(/\\\\/, "\034", raw)
    gsub(/\\"/, "\"", raw); gsub(/\\\//, "/", raw)
    gsub(/\\n/, "\n", raw); gsub(/\\t/, "\t", raw); gsub(/\\r/, "\r", raw)
    gsub(/\\b/, "\b", raw); gsub(/\\f/, "\f", raw)
    out = ""
    while ((m = index(raw, "\\u")) > 0) {
      h = substr(raw, m + 2, 4)
      if (h !~ /^[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]$/) { bad = 1; return "" }
      out = out substr(raw, 1, m - 1) utf8(hexv(h)); raw = substr(raw, m + 6)
    }
    raw = out raw
    if (index(raw, "\\") > 0) { bad = 1; return "" }
    gsub(/\034/, "\\", raw)
    return raw }
  function skipws(   c) { while ((c = substr(s, i, 1)) == " " || c == "\t" || c == "\r" || c == "\n") i++ }
  # Scan from just after an opening quote; returns index of the closing quote, or 0.
  function endq(   c) {
    while (i <= n) {
      c = substr(s, i, 1)
      if (c == "\\") i += 2
      else if (c == "\"") return i
      else i++
    }
    return 0 }
  { s = $0 }
  END {
    n = length(s); i = 1; kl = length(key)
    while (i <= n) {
      if (substr(s, i, 1) != "\"") { i++; continue }
      i++; st = i; e = endq(); if (e == 0) exit
      i = e + 1
      if (e - st != kl || substr(s, st, kl) != key) continue
      skipws(); if (substr(s, i, 1) != ":") continue
      i++; skipws(); if (substr(s, i, 1) != "\"") exit
      i++; st = i; e = endq(); if (e == 0) exit
      bad = 0; v = decode(substr(s, st, e - st))
      if (!bad) print v
      exit
    }
  }'
}

json_get() { # <key>; reads stdin
  local input; input=$(cat 2>/dev/null) || input=""
  json_get_from "$input" "$1"
}
