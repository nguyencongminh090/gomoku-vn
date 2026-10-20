#!/usr/bin/env bash
# PostToolUse hook: lint an edited style file against a few ui-audit rules.
# Warn-only; always exits 0; prints nothing unless a violation is found (max 5 lines).
. "$(dirname "$0")/lib.sh" 2>/dev/null || exit 0
input=$(cat 2>/dev/null) || input=""
file=$(json_get_from "$input" file_path)
[ -n "$file" ] && [ -f "$file" ] || exit 0
case "${file##*.}" in css|scss|tsx|jsx|vue|svelte|html) ;; *) exit 0 ;; esac
tokens=0
[ -f "$(project_dir)/DESIGN.md" ] && grep -q '^## Tokens' "$(project_dir)/DESIGN.md" 2>/dev/null && tokens=1

res=$(awk -v tokens="$tokens" '
function hv(c,   i) { i = index("0123456789abcdef", c); return i - 1 }
function chan(h,   v) { v = h / 255; return (v <= 0.03928) ? v / 12.92 : ((v + 0.055) / 1.055) ^ 2.4 }
function lum(x,   r, g, b) {   # x = hex digits, 3 or 6
  if (length(x) == 3) x = substr(x,1,1) substr(x,1,1) substr(x,2,1) substr(x,2,1) substr(x,3,1) substr(x,3,1)
  r = hv(substr(x,1,1)) * 16 + hv(substr(x,2,1))
  g = hv(substr(x,3,1)) * 16 + hv(substr(x,4,1))
  b = hv(substr(x,5,1)) * 16 + hv(substr(x,6,1))
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b)
}
function firsthex(v,   t) {   # first 3/6-digit hex in v, else ""
  if (match(v, /#[0-9a-f]+/)) {
    t = substr(v, RSTART + 1, RLENGTH - 1)
    if (length(t) == 3 || length(t) == 6) return t
  }
  return ""
}
function note(rule, ln, msg) { if (!(rule in L)) { L[rule] = ln; M[rule] = msg } }
function decl(d, ln,   p, v, c, n, a, b, la, lb, hi, lo, ratio) {
  sub(/^[ \t\r\n]+/, "", d); sub(/[ \t\r\n]+$/, "", d)
  c = index(d, ":"); if (c < 2) return
  p = substr(d, 1, c - 1); v = substr(d, c + 1)
  gsub(/[ \t\r\n]+/, "", p); sub(/^[ \t]+/, "", v); sub(/[ \t]+$/, "", v)
  if (p !~ /^-?-?[a-z-]+$/) return
  if (p == "font-size" && sel[depth] ~ /(^|[ ,>+~])(html|body)([ ,>+~:.#\[]|$)/) {
    if (v ~ /^[0-9.]+px/ && v + 0 < 16) note("TYP-BODY-SIZE", ln, "body font-size " v " is below 16px")
    else if (v ~ /^[0-9.]+(rem|em)/ && v + 0 < 1) note("TYP-BODY-SIZE", ln, "body font-size " v " is below 1rem")
  }
  if (p == "outline" && v ~ /^(none|0)([ ;!]|$)/) { if (!("o" in L)) L["o"] = ln }
  if ((p == "animation" || p ~ /^animation-/ || p == "transition" || p ~ /^transition-/) && v !~ /^(none|0s?)$/ && !rm[depth]) {
    if (!("m" in L)) L["m"] = ln
  }
  if (tokens && p !~ /^--/ && !root[depth] && (v ~ /#[0-9a-f]+/ || v ~ /rgba?\(/)) {
    if (v ~ /rgba?\(/ || match(v, /#[0-9a-f]+/)) note("COL-TOKENS-ONLY", ln, "literal color " v " outside :root, use a token")
  }
  if (p == "color") { a = firsthex(v); if (a != "") { fg[depth] = a; fgl[depth] = ln } }
  if (p == "background-color" || p == "background") { b = firsthex(v); if (b != "") bg[depth] = b }
}
# Append characters seg..upto of the current line to buf (whole slices, not char by char); note markers seen.
function flush(upto,   t) {
  if (upto >= seg) { t = substr(tolower_line, seg, upto - seg + 1); buf = buf t
    if (index(t, ":focus-visible")) hasfv = 1
    if (index(t, "prefers-reduced-motion")) hasrm = 1 }
  seg = upto + 1
}
BEGIN { depth = 0; buf = ""; incm = 0 }
{
  line = $0 ; tolower_line = tolower(line)
  n = length(tolower_line)
  seg = 1   # start of the pending run of ordinary characters
  for (i = 1; i <= n; i++) {
    ch = substr(tolower_line, i, 1); nx = substr(tolower_line, i + 1, 1)
    if (incm) { if (ch == "*" && nx == "/") { incm = 0; i++; seg = i + 1 } ; continue }
    if (ch == "/" && nx == "*") { flush(i - 1); incm = 1; i++; continue }
    if (ch != "{" && ch != ";" && ch != "}") continue
    flush(i - 1)
    if (ch == "{") {
      s = buf; gsub(/[ \t\r\n]+/, " ", s); sub(/^ /, "", s); sub(/ $/, "", s)
      depth++; sel[depth] = s; fg[depth] = ""; bg[depth] = ""
      root[depth] = root[depth-1] || (s ~ /:root/)
      rm[depth] = rm[depth-1] || (s ~ /prefers-reduced-motion/)
      buf = ""
      seg = i + 1
    } else if (ch == ";") { decl(buf, NR); buf = ""; seg = i + 1 }
    else if (ch == "}") {
      if (depth > 0) {
        decl(buf, NR)
        if (fg[depth] != "" && bg[depth] != "") {
          la = lum(fg[depth]); lb = lum(bg[depth])
          hi = (la > lb) ? la : lb; lo = (la > lb) ? lb : la
          ratio = (hi + 0.05) / (lo + 0.05)
          if (ratio < 4.5) note("COL-CONTRAST-TEXT", fgl[depth], sprintf("text #%s on #%s has contrast %.2f:1, needs 4.5:1", fg[depth], bg[depth], ratio))
        }
        depth--
      }
      buf = ""
      seg = i + 1
    }
  }
  if (!incm) flush(n)
  buf = buf " "
}
END {
  if (("o" in L) && !hasfv) note("PRI-FOCUS-VISIBLE", L["o"], "outline removed without a :focus-visible style")
  if (("m" in L) && !hasrm) note("DEP-REDUCED-MOTION", L["m"], "animation/transition without prefers-reduced-motion")
  split("TYP-BODY-SIZE PRI-FOCUS-VISIBLE DEP-REDUCED-MOTION COL-TOKENS-ONLY COL-CONTRAST-TEXT", ord, " ")
  for (k = 1; k <= 5; k++) { r = ord[k]; if (r in M) print r "\t" L[r] "\t" M[r] }
}' "$file" 2>/dev/null) || exit 0
[ -n "$res" ] || exit 0
msg=""; count=0
while IFS=$'\t' read -r rule ln text; do
  [ -n "$rule" ] || continue
  count=$((count + 1)); [ "$count" -le 5 ] || break
  msg+="${msg:+$'\n'}ui-lint: $file:$ln $text (rule $rule)"
done <<< "$res"
[ -n "$msg" ] && emit_context PostToolUse "$msg"
exit 0
