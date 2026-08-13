#!/usr/bin/env node
'use strict';

// Enforces the "Index/detail sync" rule from .claude/rules/tracking-files.md:
// every item TODO.md marks with a leading ✅ must have a matching completion
// marker in its docs/todo/<CODE>-<slug>.md detail file.
//
// Modes:
//   (default)  "diff" mode — only checks items newly marked ✅ since the last
//              git commit (HEAD). This is what the Stop hook runs: cheap, and
//              only blocks on drift introduced in the current session, not the
//              pre-existing backlog.
//   --full     checks every ✅ item in TODO.md, regardless of git state. For
//              manual/periodic audits (see .claude/rules/tracking-files.md).
//   --hook     emits the Stop-hook JSON protocol on stdout instead of a plain
//              report, and reads stop_hook_active from stdin to avoid looping.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TODO_PATH = path.join(ROOT, 'TODO.md');
const TODO_DIR = path.join(ROOT, 'docs', 'todo');

const INDEX_LINE = /^-\s*(✅\s*)?\*\*#\S+\.\*\*.*\(docs\/todo\/([A-Za-z0-9§]+)-[^)]+\.md\)/;
// Canonical + accepted-legacy completion verbs (see .claude/rules/tracking-files.md
// for which one new entries should use going forward).
const DONE_VERBS = ['ĐÃ XONG', 'đã xong', 'Đã sửa', 'đã sửa', 'Đã đóng', 'đã đóng', 'ĐÃ ĐÓNG', 'Đã đo', 'đã đo'];
const DONE_VERB_RE = new RegExp(DONE_VERBS.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');

function parseIndex(content) {
  const items = new Map();
  for (const rawLine of content.split('\n')) {
    const m = INDEX_LINE.exec(rawLine.trim());
    if (m) items.set(m[2], Boolean(m[1]));
  }
  return items;
}

function detailHasDoneMarker(code) {
  if (!fs.existsSync(TODO_DIR)) return { found: false, reason: 'docs/todo/ missing' };
  const file = fs.readdirSync(TODO_DIR).find((f) => f.startsWith(code + '-'));
  if (!file) return { found: false, reason: 'no matching detail file' };
  const content = fs.readFileSync(path.join(TODO_DIR, file), 'utf8');
  DONE_VERB_RE.lastIndex = 0;
  let m;
  while ((m = DONE_VERB_RE.exec(content))) {
    const windowStart = Math.max(0, m.index - 15);
    if (content.slice(windowStart, m.index).includes('✅')) return { found: true };
  }
  return { found: false, reason: 'no ✅+completion-verb marker in detail file' };
}

function findMismatches(items) {
  const mismatches = [];
  for (const [code, done] of items) {
    if (!done) continue;
    const result = detailHasDoneMarker(code);
    if (!result.found) mismatches.push({ code, reason: result.reason });
  }
  return mismatches;
}

function gitShowHeadTodo() {
  try {
    return execSync('git show HEAD:TODO.md', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    return null; // no commit yet, or TODO.md not tracked at HEAD
  }
}

function readHookStdin() {
  if (process.stdin.isTTY) return null;
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch (e) {
    return null;
  }
}

function main() {
  const isFull = process.argv.includes('--full');
  const isHook = process.argv.includes('--hook');

  if (isHook) {
    const input = readHookStdin();
    if (input && input.stop_hook_active === true) {
      // Already blocked once this turn — don't loop forever if the drift can't
      // or won't be fixed.
      process.exit(0);
    }
  }

  if (!fs.existsSync(TODO_PATH)) process.exit(0);
  const current = fs.readFileSync(TODO_PATH, 'utf8');
  const currentItems = parseIndex(current);

  let itemsToCheck = currentItems;

  if (!isFull) {
    const head = gitShowHeadTodo();
    if (head === null) process.exit(0); // no safe baseline — fail open, don't block
    const headItems = parseIndex(head);
    itemsToCheck = new Map();
    for (const [code, done] of currentItems) {
      const wasDone = headItems.get(code) || false;
      if (done && !wasDone) itemsToCheck.set(code, true);
    }
    if (itemsToCheck.size === 0) process.exit(0);
  }

  const mismatches = findMismatches(itemsToCheck);

  if (mismatches.length === 0) process.exit(0);

  if (isHook) {
    const list = mismatches.map((m) => `${m.code} (${m.reason})`).join(', ');
    const response = {
      hookSpecificOutput: {
        hookEventName: 'Stop',
        permissionDecision: 'deny',
        permissionDecisionReason:
          `TODO.md marks these item(s) as newly ✅ done, but their docs/todo/<CODE>-*.md ` +
          `detail file has no matching completion marker (per .claude/rules/tracking-files.md ` +
          `"Index/detail sync" rule): ${list}. Add a "**Trạng thái:** ✅ <ĐÃ XONG|Đã sửa|Đã đóng|Đã đo>" ` +
          `line (with summary/test notes) to each detail file before finishing this turn — or, if ` +
          `the item was marked ✅ prematurely, remove the ✅ from TODO.md instead.`,
      },
      systemMessage:
        `Tracking-sync check blocked stop: ${mismatches.length} item(s) newly marked ✅ in TODO.md ` +
        `missing a detail-file status marker (${mismatches.map((m) => m.code).join(', ')}).`,
    };
    process.stdout.write(JSON.stringify(response));
    process.exit(0);
  }

  console.log(`Found ${mismatches.length} sync mismatch(es):`);
  for (const m of mismatches) console.log(`  ${m.code}: ${m.reason}`);
  process.exit(1);
}

main();
