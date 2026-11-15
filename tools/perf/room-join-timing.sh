#!/bin/bash
# room-join-timing.sh <label> [reload] (#391): reload = seated player reloads mid-game (room-reload-check.js); isolated server on :3118 (fresh DB in $SP) + room-join-timing.js; prints JSON to $SP/rj/<label>.json
REPO=$(cd "$(dirname "$0")/../.." && pwd); D=${SP:?set SP to a scratch dir}/rj; L=${1:-run}
mkdir -p $D; rm -f $D/$L.db*; cd $REPO
JWT_SECRET=perf391-not-a-real-secret-0123456789abcdef0123456789 AUTH_LIMITER_MAX=1000 PORT=3118 CORS_ORIGIN=http://localhost:3118 GOMOKU_DB_PATH=$D/$L.db \
  nohup node server/index.js > $D/$L-server.log 2>&1 &
SPID=$!; sleep 4
LABEL=$L BASE=http://localhost:3118 CHROME=${CHROME:-} REPO=$REPO PLAYWRIGHT_BROWSERS_PATH=$HOME/.local/share/ms-playwright OUT=$D timeout 300 node $REPO/tools/perf/$([ "$2" = reload ] && echo room-reload-check.js || echo room-join-timing.js) > $D/$L.json; echo "exit $?"
kill $SPID; rm -f $D/$L.db*
