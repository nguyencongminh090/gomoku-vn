'use strict';
const { dedupeLine, parseValue, toBlackView, barValue, winrateFromCp } = require('../normalizer');

const clampInt = (v, lo, hi, d) => (Number.isInteger(v) ? Math.max(lo, Math.min(hi, v)) : d);

/** Base strategy. Subclass: config(ctx) → INFO map, search(ctx) → {nbest, deadlineMs}, parse(events, ctx) → result. */
class Purpose {
  get name() { throw new Error('abstract'); }
  authorize() {}
  config() { return {}; }
  search() { return { nbest: 1, deadlineMs: 10000 }; }
  parse() { throw new Error('abstract'); }
}

/** Last bare move line → {x,y}|null; swap → {swap:true}. */
function playedMove(events) {
  const mv = [...events].reverse().find((e) => e.kind === 'move');
  if (!mv) return null;
  if (mv.swap) return { swap: true };
  const c = mv.cells[0];
  return c ? { x: c.x, y: c.y } : null;
}

/** AnalysisResult (backend-design §11). The last completed block per PV index is final; earlier ones → history. */
function buildAnalysis(events, ctx) {
  const stm = ctx.stm;
  // Blocks arrive per iteration (PV 0..numpv-1). The final result is the last COMPLETE iteration: the last
  // iteration may hold only PV 0 (budget hit), and mixing depths would rank PVs inconsistently.
  const iters = [];
  let cur = new Map();
  for (const e of events) {
    if (e.kind !== 'pv') continue;
    if (e.index === 0 && cur.size) { iters.push(cur); cur = new Map(); }
    cur.set(e.index, e);
  }
  if (cur.size) iters.push(cur);
  const complete = iters.filter((m) => m.size === ([...m.values()][0].numpv || m.size));
  const finalIter = complete.length ? complete[complete.length - 1] : iters[iters.length - 1] || new Map();
  const byIdx = finalIter;
  const history = new Map();
  for (const m of complete) {
    if (m === finalIter) break;
    for (const [i, e] of m) (history.get(i) || history.set(i, []).get(i)).push(e);
  }
  const pvs = [...byIdx.values()].sort((a, b) => a.index - b.index).map((e, rank) => {
    const value = parseValue(e.eval === undefined ? '' : e.eval);
    const winrate = e.winrate !== undefined ? e.winrate
      : (value.cp !== null ? winrateFromCp(value.cp) : (value.mateIn > 0 ? 1 : 0));
    const evalBlack = toBlackView(value, winrate, stm);
    return {
      rank, depth: e.depth, seldepth: e.seldepth, nodes: e.nodes,
      eval: { ...value, side: 'stm' },
      evalBlack, bar: barValue(evalBlack), winrate,
      drawrate: e.drawrate,
      line: dedupeLine(e.line),
      history: (history.get(e.index) || []).map((h) => ({ depth: h.depth, eval: h.eval })),
    };
  });
  const last = [...byIdx.values()].pop();
  return {
    stm,
    played: playedMove(events),
    pvs,
    best: pvs[0] || null,
    stats: last ? { totalNodes: last.totalNodes, timeMs: last.timeMs, nps: last.nps } : null,
  };
}

module.exports = { Purpose, playedMove, buildAnalysis, clampInt };
