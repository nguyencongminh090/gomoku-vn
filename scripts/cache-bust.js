#!/usr/bin/env node
'use strict';
// Per-file content-hash cache-busting (#265): every `path?v=X` in client/*.html, client/js/**, client/css/**
// gets X = first 8 hex of sha256 of the referenced file's bytes, so a changed file gets a new URL and an
// unchanged one keeps its cached copy.
//   cache-bust.js            verify: rewriting would change nothing (exit 1 + list of stale files if not)
//   cache-bust.js --write    rewrite every ?v= to its target's hash (alias: --bump)
// A file that references others is hashed AFTER its own refs are rewritten (Merkle order), so a module whose
// import changes gets a new URL too. Import cycles are hashed as one unit (every member shares the hash).
// Resolution: HTML refs and non-relative JS strings (`/js/x.js`, `assets/…svg`) resolve against client/ (the
// page URL); `./x.js` / `../x.js` resolve against the referencing module's own directory.
// Mockups are frozen and skipped. Only hex `?v=` is touched, so `?v=${ASSET_VERSION}` and prose are left alone.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', 'client');
const RE = /([A-Za-z0-9_./-]+)\?v=([0-9a-f]+)(?![0-9A-Za-z_$])/g;
const PLACEHOLDER = '?v=@';

const hash = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);

function sourceFiles(root) {
  const out = [];
  for (const f of fs.readdirSync(root)) if (f.endsWith('.html') && !f.includes('mockup')) out.push(f);
  for (const [dir, ext] of [['js', '.js'], ['css', '.css']]) {
    (function walk(rel) {
      const abs = path.join(root, rel);
      if (!fs.existsSync(abs)) return;
      for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
        const p = path.posix.join(rel, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(ext)) out.push(p);
      }
    })(dir);
  }
  return out.sort();
}

function resolveRef(from, ref) {
  if (ref.startsWith('./') || ref.startsWith('../')) return path.posix.normalize(path.posix.join(path.posix.dirname(from), ref));
  return path.posix.normalize(ref.replace(/^\/+/, ''));
}

/**
 * Pure core. `read(rel)` returns a file's content (string) or null if missing; `sources` are the files whose refs
 * are rewritten. Returns { out: Map<rel, newContent> (sources only), hashes: Map<rel, hash>, errors: string[] }.
 */
function computeAll(sources, read) {
  const content = new Map();
  const errors = [];
  const refsOf = new Map(); // source -> Set of resolved targets
  for (const f of sources) {
    const s = read(f);
    content.set(f, s);
    const deps = new Set();
    for (const m of s.matchAll(RE)) {
      const t = resolveRef(f, m[1]);
      if (read(t) == null) errors.push(`${f}: unresolvable ${m[1]}?v=${m[2]} (→ client/${t})`);
      else deps.add(t);
    }
    refsOf.set(f, deps);
  }
  if (errors.length) return { out: new Map(), hashes: new Map(), errors };

  // Tarjan SCC over sources; leaves (svg, vendor css, …) are hashed raw. SCCs come out dependencies-first.
  const hashes = new Map();
  const out = new Map();
  const leafHash = (t) => {
    if (!hashes.has(t)) hashes.set(t, hash(read(t)));
    return hashes.get(t);
  };
  const rewrite = (f, inScc, sccHash) => content.get(f).replace(RE, (all, ref) => {
    const t = resolveRef(f, ref);
    if (inScc.has(t)) return ref + (sccHash == null ? PLACEHOLDER : `?v=${sccHash}`);
    return `${ref}?v=${refsOf.has(t) ? hashes.get(t) : leafHash(t)}`;
  });
  const finish = (scc) => {
    const members = new Set(scc);
    const cyclic = scc.length > 1 || refsOf.get(scc[0]).has(scc[0]);
    if (!cyclic) {
      const s = rewrite(scc[0], members, null);
      out.set(scc[0], s);
      hashes.set(scc[0], hash(s));
      return;
    }
    const sorted = [...scc].sort();
    const h = hash(sorted.map((f) => `${f}\0${rewrite(f, members, null)}`).join('\0'));
    for (const f of sorted) { hashes.set(f, h); out.set(f, rewrite(f, members, h)); }
  };
  let idx = 0;
  const index = new Map(), low = new Map(), stack = [], onStack = new Set();
  function strong(v) {
    index.set(v, idx); low.set(v, idx); idx++;
    stack.push(v); onStack.add(v);
    for (const w of refsOf.get(v)) {
      if (!refsOf.has(w)) continue;
      if (!index.has(w)) { strong(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
    }
    if (low.get(v) === index.get(v)) {
      const scc = [];
      let w;
      do { w = stack.pop(); onStack.delete(w); scc.push(w); } while (w !== v);
      finish(scc);
    }
  }
  for (const f of sources) if (!index.has(f)) strong(f);
  return { out, hashes, errors };
}

function run(root, write) {
  const sources = sourceFiles(root);
  const read = (rel) => {
    const p = path.join(root, rel);
    return fs.existsSync(p) && fs.statSync(p).isFile() ? fs.readFileSync(p, 'utf8') : null;
  };
  const { out, errors } = computeAll(sources, read);
  if (errors.length) return { ok: false, errors, stale: [] };
  const stale = sources.filter((f) => out.get(f) !== read(f));
  if (write) for (const f of stale) fs.writeFileSync(path.join(root, f), out.get(f));
  return { ok: write || stale.length === 0, errors, stale };
}

module.exports = { computeAll, resolveRef, run, RE };

if (require.main === module) {
  const arg = process.argv[2];
  if (arg === '--set') {
    console.error('--set is gone (#265): versions are content hashes now. After a merge just run: node scripts/cache-bust.js --write');
    process.exit(2);
  }
  const write = arg === '--write' || arg === '--bump';
  const r = run(ROOT, write);
  if (r.errors.length) { console.log(`FAIL: ${r.errors.length} unresolvable ref(s):\n  ${r.errors.join('\n  ')}`); process.exit(1); }
  if (write) console.log(`rewrote ${r.stale.length} file(s)${r.stale.length ? ': ' + r.stale.join(', ') : ''}`);
  const v = write ? run(ROOT, false) : r;
  if (v.ok) console.log('OK: every ?v= matches its file\'s content hash');
  else { console.log(`FAIL: ${v.stale.length} file(s) with stale ?v= (run --write): ${v.stale.join(', ')}`); process.exit(1); }
}
