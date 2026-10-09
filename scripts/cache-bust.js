#!/usr/bin/env node
'use strict';
// The CLAUDE.md "?v=N" cache-busting rule as a tool (replaces the manual grep + bulk sed).
//   cache-bust.js          verify: exactly one distinct ?v=N across client/*.html + client/js/** (exit 1 if not)
//   cache-bust.js --bump   rewrite every ?v=N there to N+1 (max found + 1), then verify
//   cache-bust.js --set N  rewrite every ?v=N to N (use for max(dev, main)+1 after a merge)
// Mockups are intentionally frozen and skipped. Only digit-suffixed `?v=` is touched, so template
// strings like `?v=${ASSET_VERSION}` and prose mentions of `?v=` are left alone.
const fs = require('fs');
const path = require('path');
const CLIENT = path.resolve(__dirname, '..', 'client');

function files() {
  const out = [];
  for (const f of fs.readdirSync(CLIENT)) if (f.endsWith('.html') && !f.includes('mockup')) out.push(path.join(CLIENT, f));
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) out.push(p);
    }
  })(path.join(CLIENT, 'js'));
  return out;
}

const RE = /\?v=(\d+)/g;
function scan() {
  const seen = new Map();
  for (const f of files()) for (const m of fs.readFileSync(f, 'utf8').matchAll(RE)) seen.set(m[1], (seen.get(m[1]) || 0) + 1);
  return seen;
}

const arg = process.argv[2];
let seen = scan();
if (arg === '--bump' || arg === '--set') {
  const target = arg === '--set' ? parseInt(process.argv[3], 10) : Math.max(...[...seen.keys()].map(Number)) + 1;
  if (!Number.isInteger(target)) { console.error('usage: --set N'); process.exit(2); }
  for (const f of files()) {
    const s = fs.readFileSync(f, 'utf8');
    const n = s.replace(RE, `?v=${target}`);
    if (n !== s) fs.writeFileSync(f, n);
  }
  seen = scan();
}
const vals = [...seen.keys()];
if (vals.length === 1) console.log(`OK: single ?v=${vals[0]} (${seen.get(vals[0])} refs)`);
else { console.log(`FAIL: ${vals.length} distinct values: ${vals.map((v) => `${v}×${seen.get(v)}`).join(', ')}`); process.exit(1); }
