#!/bin/bash
# mixed.sh <label> <tree> (#386): server from <tree> (a checkout, e.g. a worktree of an older commit) on a fresh COPY of
# exports/vncaro-sim.db; SHARDS load processes play ROOMS rooms (guests), WATCHERS lobby subscribers in their own process,
# a 1000-socket reconnect storm at DUR/2 and the heavy read routes polled during play. Results in $SP/run-<label>; summarize with mixed-summary.sh.
L=$1; T=$2; REPO=${REPO:-$(cd "$(dirname "$0")/../.." && pwd)}; SP=${SP:?set SP to a scratch dir}; D=$SP/run-$L
ROOMS=${ROOMS:-2500}; SHARDS=${SHARDS:-5}; WATCHERS=${WATCHERS:-500}; DUR=${DUR:-60}
if curl -s -o /dev/null localhost:3117; then echo "port 3117 still busy (previous run?)" >&2; exit 1; fi
rm -rf $D; mkdir -p $D; cp $REPO/exports/vncaro-sim.db $D/perf.db
cd $T
JWT_SECRET=${JWT_SECRET:-perf386-not-a-real-secret-0123456789abcdef0123456789} MAX_ROOMS=10000 MAX_ROOMS_PER_IP=100000 AUTH_LIMITER_MAX=1000000 PORT=3117 CORS_ORIGIN=http://localhost:3117 GOMOKU_DB_PATH=$D/perf.db LOG_LEVEL=warn \
  nohup node --max-old-space-size=3072 ${SRV_ARGS} -r $REPO/tools/perf/eld.js server/index.js > $D/server.log 2>&1 &
SPID=$!; echo $SPID > $D/server.pid; date +%s > $D/srv-start
until curl -s -o /dev/null localhost:3117; do sleep 1; done # was a fixed sleep 6: a slow boot left the watchers ECONNREFUSED (#389)
cd $D; export REPO GUESTS=1
WAIT_SIGNAL=1 node $REPO/tools/perf/load.js http://localhost:3117 0 1000 $WATCHERS 1 > watchers.log 2>&1 &
WP=$!
until grep -q "waiting for SIGUSR1" watchers.log; do sleep 1; done
PER=$((ROOMS / SHARDS)); STN=$((1000 / SHARDS)); pids=()
for i in $(seq 0 $((SHARDS-1))); do
  ex="X=1"; [ $i = 0 ] && ex="ROUTES_EVERY_MS=200"
  env $ex STORM_AT=$((DUR/2)) STORM_N=$STN RTT_OUT=$D/rtt-$i.txt HOLD=3 node --max-old-space-size=2048 $REPO/tools/perf/load.js http://localhost:3117 $PER 1000 0 $DUR $SPID > shard-$i.log 2>&1 &
  pids+=($!)
done
until [ $(grep -l "warming up" shard-*.log 2>/dev/null | wc -l) = $SHARDS ]; do sleep 1; done
sleep 5; date +%s > win-start; kill -USR1 $WP
wait ${pids[@]}
date +%s > win-end; kill -USR2 $WP; wait $WP
grep ELD server.log | tail -40 > eld.txt
kill $SPID
while kill -0 $SPID 2>/dev/null; do sleep 0.5; done # #388: the next run's curl hit this dying server, its load then got ECONNREFUSED
