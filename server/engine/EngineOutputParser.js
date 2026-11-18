'use strict';
/**
 * Stateful line reducer: feed(line) → events[]. Mode-independent (backend-design §10).
 * Results must come from `move` + `pv` events; MESSAGE-derived events are optional extras.
 * Extend with register({id, test(line,ctx), parse(line,ctx)}, {priority}); lower priority runs first.
 */
const PV_KEYS = {
  NUMPV: 'numpv', DEPTH: 'depth', SELDEPTH: 'seldepth', NODES: 'nodes', TOTALNODES: 'totalNodes',
  TOTALTIME: 'timeMs', SPEED: 'nps', EVAL: 'eval', WINRATE: 'winrate', DRAWRATE: 'drawrate',
  PRIOR: 'prior', STDEV: 'stdev', LCBVALUE: 'lcb', BESTLINE: 'bestline',
};
const NUMERIC = new Set(['numpv', 'depth', 'seldepth', 'nodes', 'totalNodes', 'timeMs', 'nps',
  'winrate', 'drawrate', 'prior', 'stdev', 'lcb']);

const cell = (s) => { const [x, y] = s.split(',').map(Number); return { x, y }; };
/** 'I7' → {x:8,y:6} (letter = column, number = row 1-based). Fallback only. */
function labelToCell(label) {
  const m = /^([A-Za-z])(\d+)$/.exec(label);
  return m ? { x: m[1].toUpperCase().charCodeAt(0) - 65, y: Number(m[2]) - 1 } : null;
}
const labels = (s) => s.trim().split(/\s+/).map(labelToCell).filter(Boolean);

const matchers = [];
const def = (id, priority, test, parse) => matchers.push({ id, priority, test, parse });

def('move', 10, (l) => /^\d+,\d+(\s+\d+,\d+)*$/.test(l) || l === 'SWAP',
  (l) => (l === 'SWAP' ? { kind: 'move', swap: true, cells: [] }
    : { kind: 'move', swap: false, cells: l.split(/\s+/).map(cell) }));

def('error-ack', 20, (l) => l === 'OK' || l.startsWith('ERROR'),
  (l) => (l === 'OK' ? { kind: 'ack' } : { kind: 'error', text: l.slice(5).trim() }));

def('pv-block', 30, (l, ctx) => /^INFO (PV|[A-Z]+)\b/.test(l) && (ctx.pv || /^INFO PV\b/.test(l)),
  (l, ctx) => {
    const m = /^INFO (\S+)\s*(.*)$/.exec(l);
    const key = m[1]; const val = m[2].trim();
    if (key === 'PV') {
      if (val === 'DONE') {
        const pv = ctx.pv; ctx.pv = null;
        return pv ? { kind: 'pv', ...pv } : null;
      }
      ctx.pv = { index: Number(val), line: [], extra: {} };
      return null;
    }
    if (!ctx.pv) return { kind: 'misc', tag: `INFO ${key}`, raw: l };
    const name = PV_KEYS[key];
    if (!name) ctx.pv.extra[key] = val;
    else if (name === 'bestline') ctx.pv.line = val ? val.split(/\s+/).map(cell) : [];
    else if (name === 'eval') ctx.pv.eval = val;
    else if (NUMERIC.has(name)) ctx.pv[name] = Number(val);
    return null;
  });

def('realtime', 40, (l) => /^(MESSAGE )?REALTIME /.test(l),
  (l) => {
    const m = /^(?:MESSAGE )?REALTIME (\w+)(?: (\d+),(\d+))?/.exec(l);
    return { kind: 'realtime', what: m[1], ...(m[2] !== undefined ? { x: +m[2], y: +m[3] } : {}) };
  });

def('progress-normal', 50, (l) => /^MESSAGE Depth \d+-\d+ \| Eval /.test(l),
  (l) => {
    const m = /^MESSAGE Depth (\d+)-(\d+) \| Eval (\S+) \| Time (\d+)ms \| (.*)$/.exec(l);
    return m ? { kind: 'progress', depth: +m[1], seldepth: +m[2], eval: m[3], timeMs: +m[4], pv: labels(m[5]) }
      : { kind: 'unknown', raw: l };
  });

def('progress-ucilike', 55, (l) => /^MESSAGE depth \d+-\d+ /.test(l),
  (l) => {
    const m = /^MESSAGE depth (\d+)-(\d+)(?: multipv (\d+))? ev (\S+) n (\d+) n\/ms (\d+) tm (\d+) pv (.*)$/.exec(l);
    return m ? {
      kind: 'progress', depth: +m[1], seldepth: +m[2], multipv: m[3] ? +m[3] : 1, eval: m[4],
      nodes: +m[5], nps: +m[6] * 1000, timeMs: +m[7], pv: labels(m[8]),
    } : { kind: 'unknown', raw: l };
  });

def('summary-brief', 60, (l) => /^MESSAGE (Speed|Bestline) /.test(l),
  (l) => {
    let m = /^MESSAGE Speed (\S+) \| Depth (\d+)-(\d+) \| Eval (\S+) \| Node (\d+) \| Time (\d+)ms/.exec(l);
    if (m) return { kind: 'summary', speed: m[1], depth: +m[2], seldepth: +m[3], eval: m[4], nodes: +m[5], timeMs: +m[6] };
    m = /^MESSAGE Bestline (.*)$/.exec(l);
    return m ? { kind: 'summary', bestline: labels(m[1]) } : { kind: 'unknown', raw: l };
  });

def('capabilities', 70, (l) => /^MESSAGE (Rapfi |INFO MAX_(THREAD_NUM|HASH_SIZE) )/.test(l),
  (l) => ({ kind: 'capabilities', raw: l.slice(8) }));

def('misc', 80, (l) => /^(MESSAGE (Transposition table|Unknown Info Parameter|Load config|Setting )|FORBID|DATABASE|DEBUG)/.test(l),
  (l) => ({ kind: 'misc', tag: l.split(/\s+/).slice(0, 2).join(' '), raw: l }));

class EngineOutputParser {
  constructor({ builtins = true } = {}) {
    this._matchers = [];
    this._ctx = {};
    this._carry = '';
    if (builtins) matchers.forEach((m) => this.register(m, { priority: m.priority }));
  }

  register(matcher, { priority = 100 } = {}) {
    this._matchers.push({ ...matcher, priority });
    this._matchers.sort((a, b) => a.priority - b.priority);
    return this;
  }

  reset() { this._ctx = {}; this._carry = ''; }

  /** One complete line → events (possibly empty). Never throws; unmatched → `unknown`. */
  feed(rawLine) {
    const line = String(rawLine).replace(/\r$/, '').trim();
    if (!line) return [];
    for (const m of this._matchers) {
      if (!m.test(line, this._ctx)) continue;
      const out = m.parse(line, this._ctx);
      return out ? (Array.isArray(out) ? out : [out]) : [];
    }
    return [{ kind: 'unknown', raw: line }];
  }

  /** Arbitrary text chunk (may end mid-line) → events. Client batches may split anywhere. */
  feedChunk(text) {
    const parts = (this._carry + text).split('\n');
    this._carry = parts.pop();
    return parts.flatMap((l) => this.feed(l));
  }
}

module.exports = { EngineOutputParser, labelToCell };
