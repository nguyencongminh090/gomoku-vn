#!/bin/bash
# mixed-summary.sh <label>: merged ack percentiles, storm, lobby bytes, server ELD inside the window, route maxima
D=${SP:?}/run-$1; cd $D
cat rtt-*.txt | sort -n | awk '{a[NR]=$1} END{printf "acks n=%d p50=%.1f p90=%.1f p99=%.1f p999=%.1f max=%.1f\n",NR,a[int(NR*.5)],a[int(NR*.9)],a[int(NR*.99)],a[int(NR*.999)],a[NR]}'
grep -h "moves=\|errors=" shard-*.log | awk '{m+=substr($1,7); split($0,x,"errors="); e+=x[2]} END{print "moves",m,"errors",e}'
grep -h "server CPU\|server RSS" shard-0.log
grep -h "storm:" shard-*.log
grep -h "slow acks" shard-*.log | head -5
grep "per lobby" watchers.log
S=$(cat srv-start); A=$(( $(cat win-start)-S )); B=$(( $(cat win-end)-S ))
grep ELD server.log | awk -v a=$A -v b=$B '{split($2,t,"="); if (t[2]>=a && t[2]<=b) print}' | awk '{split($3,p,"=");split($4,q,"=");split($5,m,"="); print; if(q[2]>mq)mq=q[2]; if(m[2]>mm)mm=m[2]; s+=p[2]; n++} END{printf "ELD window: mean p50=%.1f max p99=%.1f max=%.1f\n", s/n, mq, mm}' | tail -1
grep -h "^route" shard-0.log | sort -t= -k6 -rn | head -6
grep -c "slow query" server.log
