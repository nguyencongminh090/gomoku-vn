'use strict';

/**
 * capacity-test/orchestrator.js — permanent, repeatable capacity test.
 * See scripts/capacity-test/README.md for what this is and how to run it.
 *
 * TODO.md #26 / instruction.md §B26: earlier stress-test measurements
 * (docs/stress-test-report.md) used a single-process load generator and a
 * compressed 400ms/move pace, both flagged there as understating real
 * concurrency and not human-realistic. This harness fixes both: rooms are
 * spread across multiple forked OS processes (real inter-process
 * concurrency, not one event loop faking it), moves are paced at a
 * randomized human-like delay, and the result is a pass/fail exit code
 * instead of numbers someone has to eyeball.
 *
 * Deliberately NOT under e2e/*.spec.ts: this is resource-destructive
 * (creates real rooms/sockets against a running server) and shouldn't run
 * mixed into the normal functional test suite.
 */

const { fork } = require('child_process');
const path = require('path');

function parseArgs(argv) {
  const out = {
    rooms: 3,
    workers: 3,
    serverUrl: 'http://localhost:3000',
    moveDelayMinMs: 1200,
    moveDelayMaxMs: 3500,
    maxMovesPerGame: 30,
    transport: 'default', // 'default' (polling->websocket upgrade) | 'websocket'
    maxP95LatencyMs: 800,
    minRoomSuccessRate: 1.0,
  };
  for (const arg of argv) {
    const m = /^--([a-zA-Z]+)=(.+)$/.exec(arg);
    if (!m) continue;
    const [, key, val] = m;
    if (key in out) out[key] = /^[0-9.]+$/.test(val) ? Number(val) : val;
  }
  return out;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

function splitEvenly(total, buckets) {
  const base = Math.floor(total / buckets);
  const remainder = total % buckets;
  return Array.from({ length: buckets }, (_, i) => base + (i < remainder ? 1 : 0)).filter((n) => n > 0);
}

function runWorker(workerId, roomsToCreate, opts) {
  return new Promise((resolve, reject) => {
    const child = fork(path.join(__dirname, 'worker.js'), [], {
      env: {
        ...process.env,
        CAPACITY_WORKER_CONFIG: JSON.stringify({
          workerId,
          roomsToCreate,
          serverUrl: opts.serverUrl,
          moveDelayMinMs: opts.moveDelayMinMs,
          moveDelayMaxMs: opts.moveDelayMaxMs,
          maxMovesPerGame: opts.maxMovesPerGame,
          transport: opts.transport,
        }),
      },
    });
    let settled = false;
    child.on('message', (msg) => { settled = true; resolve(msg); });
    child.on('exit', (code) => {
      if (!settled) reject(new Error(`worker ${workerId} exited (code ${code}) without reporting results`));
    });
    child.on('error', reject);
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const perWorkerRooms = splitEvenly(opts.rooms, opts.workers);

  console.log(`[capacity-test] ${opts.rooms} rooms across ${perWorkerRooms.length} worker processes, ` +
    `server=${opts.serverUrl}, move delay=${opts.moveDelayMinMs}-${opts.moveDelayMaxMs}ms`);

  const t0 = Date.now();
  const workerResults = await Promise.all(
    perWorkerRooms.map((n, i) => runWorker(i, n, opts))
  );
  const elapsedMs = Date.now() - t0;

  const allRooms = workerResults.flatMap((w) => w.results);
  const created = allRooms.filter((r) => r.created).length;
  const gamesStarted = allRooms.filter((r) => r.gameStarted).length;
  const totalMoves = allRooms.reduce((sum, r) => sum + r.moves, 0);
  const latencies = allRooms.flatMap((r) => r.latenciesMs).sort((a, b) => a - b);
  const errors = allRooms.flatMap((r) => r.errors.map((e) => `room#${r.roomIndex}: ${e}`));

  const p50 = percentile(latencies, 0.50);
  const p95 = percentile(latencies, 0.95);
  const p99 = percentile(latencies, 0.99);
  const roomSuccessRate = allRooms.length ? created / allRooms.length : 0;

  console.log('');
  console.log('=== capacity-test report ===');
  console.log(`Elapsed:            ${(elapsedMs / 1000).toFixed(1)}s`);
  console.log(`Rooms attempted:    ${allRooms.length}`);
  console.log(`Rooms created:      ${created} (${(roomSuccessRate * 100).toFixed(1)}%)`);
  console.log(`Games started:      ${gamesStarted}`);
  console.log(`Moves completed:    ${totalMoves}`);
  console.log(`Move latency p50/p95/p99: ${p50}ms / ${p95}ms / ${p99}ms`);
  console.log(`Errors:             ${errors.length}`);
  if (errors.length) {
    // Histogram by error kind, not just the first 20 raw lines — with
    // thousands of rooms the raw list is dominated by whichever room indices
    // happened to sort first and hides what actually went wrong.
    const byKind = new Map();
    for (const e of errors) {
      const kind = e.replace(/^room#\d+: /, '').replace(/\d+/g, 'N');
      byKind.set(kind, (byKind.get(kind) || 0) + 1);
    }
    for (const [kind, count] of [...byKind.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(count).padStart(6)}  ${kind}`);
    }
  }

  const failures = [];
  if (roomSuccessRate < opts.minRoomSuccessRate) {
    failures.push(`room success rate ${(roomSuccessRate * 100).toFixed(1)}% < required ${(opts.minRoomSuccessRate * 100).toFixed(1)}%`);
  }
  if (p95 > opts.maxP95LatencyMs) {
    failures.push(`p95 move latency ${p95}ms > threshold ${opts.maxP95LatencyMs}ms`);
  }
  if (errors.length > 0) {
    failures.push(`${errors.length} error(s) during play`);
  }

  console.log('');
  if (failures.length) {
    console.log('FAIL:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  } else {
    console.log('PASS');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('[capacity-test] fatal error:', err);
  process.exit(1);
});
