#!/usr/bin/env node
'use strict';
// Token-cheap reader for the tracking indexes (see .claude/rules/tracking-files.md).
//   track.js <N|CODE>      index line(s) + head of the TODO detail + instruction detail
//   track.js open          open items (TODO.md), one line each
//   track.js find <kw...>  case-insensitive search over TODO/DONE/instruction/fix-log indexes
//   track.js log [N=8]     last N fix-log rows (truncated)
// Lines are truncated to 200 chars so one call costs a few hundred tokens, not a whole index.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const rd = (p) => (fs.existsSync(path.join(ROOT, p)) ? fs.readFileSync(path.join(ROOT, p), 'utf8') : '');
const cut = (s, n = 200) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const HEAD_LINES = 25;

function blocks(text) {
  const out = [];
  for (const l of text.split('\n')) {
    if (/^-\s/.test(l)) out.push(l);
    else if (out.length && /^\s+\S/.test(l)) out[out.length - 1] += ' ' + l.trim();
  }
  return out;
}


function detailFiles(dirRel, code) {
  const dir = path.join(ROOT, dirRel);
  if (!fs.existsSync(dir)) return [];
  const re = new RegExp('^' + code.replace(/[^A-Za-z0-9§]/g, '') + '-', 'i');
  return fs.readdirSync(dir).filter((f) => re.test(f)).map((f) => path.join(dirRel, f));
}

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd) {
  console.log('usage: track.js <N|CODE> | open | find <kw> | log [N]');
  process.exit(1);
}

if (cmd === 'open') {
  for (const b of blocks(rd('TODO.md'))) console.log(cut(b));
} else if (cmd === 'find') {
  const kw = rest.join(' ').toLowerCase();
  for (const f of ['TODO.md', 'docs/todo/DONE.md', 'instruction.md', 'docs/fix-log.md']) {
    for (const b of blocks(rd(f)).concat(f === 'docs/fix-log.md' ? rd(f).split('\n').filter((l) => l.startsWith('|')) : [])) {
      if (b.toLowerCase().includes(kw)) console.log(`${f}: ${cut(b, 170)}`);
    }
  }
} else if (cmd === 'log') {
  const n = parseInt(rest[0], 10) || 8;
  const rows = rd('docs/fix-log.md').split('\n').filter((l) => /^\| \d{4}-/.test(l));
  for (const r of rows.slice(-n)) console.log(cut(r, 260));
} else {
  let arg = cmd.replace(/^#/, '');
  const num = /^\d+$/.test(arg) ? arg : null;
  const hits = [];
  for (const f of ['TODO.md', 'docs/todo/DONE.md', 'instruction.md']) {
    for (const b of blocks(rd(f))) {
      const m = /^-\s*(?:✅|⏳|⬜|⚠️)?\s*\*\*(?:#)?([A-Za-z]?\d+)\.\*\*/.exec(b);
      const link = /\(docs\/todo\/([A-Za-z0-9§]+)-/.exec(b);
      const id = m && m[1];
      const code = (link && link[1]) || '';
      if ((num && (id === num || code.replace(/^[AB]0*/, '') === num)) || (!num && (id === arg || code.toLowerCase() === arg.toLowerCase()))) hits.push(`${f}: ${cut(b, 400)}`);
    }
  }
  if (!hits.length) { console.log('no index line for ' + cmd); process.exit(1); }
  console.log(hits.join('\n'));
  const codes = new Set(hits.map((h) => (/docs\/todo\/([A-Za-z0-9§]+)-/.exec(h) || [])[1]).filter(Boolean));
  for (const code of codes) {
    for (const rel of detailFiles('docs/todo', code).concat(detailFiles('docs/instruction', code.replace(/^([AB])0+/, '$1')))) {
      console.log(`\n=== ${rel} (first ${HEAD_LINES} lines) ===`);
      console.log(fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n').slice(0, HEAD_LINES).map((l) => cut(l, 220)).join('\n'));
    }
  }
}
