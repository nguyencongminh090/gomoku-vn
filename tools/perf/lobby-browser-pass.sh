#!/bin/bash
# lobby-browser-pass.sh (#386): isolated server on :3117 (fresh DB in $SP, page sizes 5/4) + lobby-browser-pass.js
REPO=$(cd "$(dirname "$0")/../.." && pwd); D=${SP:?set SP to a scratch dir}/bp
rm -rf $D; mkdir -p $D; cd $REPO
JWT_SECRET=perf386-not-a-real-secret-0123456789abcdef0123456789 ONLINE_PAGE_SIZE=5 LOBBY_ROOM_PAGE_SIZE=4 MAX_ROOMS=100 MAX_ROOMS_PER_IP=100 AUTH_LIMITER_MAX=1000 PORT=3117 CORS_ORIGIN=http://localhost:3117 GOMOKU_DB_PATH=$D/bp.db \
  nohup node server/index.js > $D/server.log 2>&1 &
SPID=$!; sleep 4
CHROME=${CHROME:-} REPO=$REPO OUT=$D PLAYWRIGHT_BROWSERS_PATH=$HOME/.local/share/ms-playwright timeout 180 node $REPO/tools/perf/lobby-browser-pass.js; echo "exit $?"
kill $SPID
