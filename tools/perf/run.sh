#!/bin/bash
# run.sh <label> : fresh server (+ELD) on :3117, watchers in own process, 500 playing rooms
SP=${SP:-$(cd "$(dirname "$0")" && pwd)}  # db/logs land here; set SP to a scratch dir to keep the repo clean
REPO=${REPO:-$(cd "$(dirname "$0")/../.." && pwd)}
ROOMS=${ROOMS:-500}
[ -f "${SP:?}/server.pid" ] && kill $(cat "${SP:?}/server.pid") 2>/dev/null; sleep 1
rm -f "${SP:?}"/perf.db "${SP:?}"/perf.db-wal "${SP:?}"/perf.db-shm
cd $REPO
MAX_ROOMS=5000 MAX_ROOMS_PER_IP=100000 AUTH_LIMITER_MAX=100000 PORT=3117 CORS_ORIGIN=http://localhost:3117 GOMOKU_DB_PATH=$SP/perf.db \
  nohup node -r $REPO/tools/perf/eld.js server/index.js > $SP/server-$1.log 2>&1 &
echo $! > $SP/server.pid; sleep 3
cd $SP
export REPO
CHURN_MS=${CHURN_MS:-} node $REPO/tools/perf/load.js http://localhost:3117 0 1000 ${WATCHERS:-50} 400 > watchers-$1.log 2>&1 &
WP=$!
sleep 20
HOLD=3 node $REPO/tools/perf/load.js http://localhost:3117 $ROOMS 1000 0 30 $(cat server.pid) 2>&1 | tail -6
kill -0 $WP 2>/dev/null && echo "watchers alive through the window" || echo "WATCHERS DIED — churn not measured"
kill $WP 2>/dev/null
grep ELD $SP/server-$1.log | tail -22 | awk '{print $3, $4, $5}' | tr '\n' ';'; echo
