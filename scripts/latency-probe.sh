#!/usr/bin/env bash
# latency-probe.sh — sample public-domain vs localhost latency every INTERVAL s, to catch the
# intermittent slow API/index.html seen in HARs (tunnel vs origin vs network vs suspend).
#
#   scripts/latency-probe.sh                 # foreground, Ctrl-C to stop
#   nohup scripts/latency-probe.sh &         # background
#   INTERVAL=15 SLOW=0.5 scripts/latency-probe.sh
#
# Output (default ~/latency-probe/):
#   probe.csv   one row per sample: time, domain/local TTFB (s), HTTP code, CF colo, connect, tls,
#               ping loss %, ping avg ms, gap_s (seconds since the previous sample)
#   slow.log    when domain TTFB > SLOW or a sample was missed (gap_s > 2*INTERVAL, i.e. suspend):
#               the last cloudflared lines and the node uptime, to line up with a HAR timestamp.
# Read-only GETs of public pages — never touches the DB or logs in.
set -u
HOST="${HOST:-https://play3cr.dpdns.org}"
LOCAL="${LOCAL:-http://localhost:3000}"
INTERVAL="${INTERVAL:-30}"
SLOW="${SLOW:-0.6}"
PING_TARGET="${PING_TARGET:-1.1.1.1}"
OUT="${OUT:-$HOME/latency-probe}"
mkdir -p "$OUT"
CSV="$OUT/probe.csv"
LOG="$OUT/slow.log"
[ -s "$CSV" ] || echo "time,domain_ttfb,domain_code,colo,connect,tls,local_ttfb,ping_loss,ping_avg_ms,gap_s" > "$CSV"

prev=$(date +%s)
while true; do
  now=$(date +%s)
  gap=$((now - prev)); prev=$now
  # tab-separated: ttfb, code, connect, tls, cf-ray header
  IFS=$'\t' read -r d_ttfb d_code d_conn d_tls d_ray < <(
    curl -s -o /dev/null --max-time 15 \
      -w '%{time_starttransfer}\t%{http_code}\t%{time_connect}\t%{time_appconnect}\t%header{cf-ray}\n' \
      "$HOST/index.html" || printf '0\t000\t0\t0\t-\n')
  colo="${d_ray##*-}"; [ -n "$colo" ] || colo="-"
  l_ttfb=$(curl -s -o /dev/null --max-time 5 -w '%{time_starttransfer}' "$LOCAL/index.html" || echo 0)
  read -r loss avg < <(ping -c 3 -W 2 -q "$PING_TARGET" 2>/dev/null |
    awk -F'[ /,%]+' '/packet loss/ {l=$6} /^rtt/ {a=$8} END {print (l==""?100:l), (a==""?0:a)}')
  stamp=$(date '+%Y-%m-%dT%H:%M:%S%z')
  echo "$stamp,$d_ttfb,$d_code,$colo,$d_conn,$d_tls,$l_ttfb,$loss,$avg,$gap" >> "$CSV"

  slow=$(awk -v t="$d_ttfb" -v s="$SLOW" 'BEGIN { print (t > s) ? 1 : 0 }')
  if [ "$slow" = 1 ] || [ "$d_code" != 200 ] || [ "$gap" -gt $((INTERVAL * 2 + 10)) ]; then
    {
      echo "=== $stamp domain_ttfb=$d_ttfb code=$d_code colo=$colo local=$l_ttfb ping_loss=$loss gap_s=$gap"
      echo "node up since: $(ps -o lstart= -p "$(pgrep -f 'node.*server' | head -1)" 2>/dev/null || echo '?')"
      journalctl -u cloudflared --since "-2min" --no-pager 2>/dev/null | sed 's/^.*cloudflared\[[0-9]*\]: //' |
        grep -v "^--" | cut -c1-200 | tail -8
    } >> "$LOG"
  fi
  sleep "$INTERVAL"
done
