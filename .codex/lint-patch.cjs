'use strict';

const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const lintScript = path.join(root, '.claude/hooks/web-visual/ui-lint.sh');
const env = { ...process.env, CLAUDE_PROJECT_DIR: root };

async function lintFile(filePath) {
  const output = await new Promise((resolve, reject) => {
    const child = execFile('bash', [lintScript], { cwd: root, env }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
    child.stdin.on('error', reject);
    child.stdin.end(JSON.stringify({ file_path: filePath }));
  });
  if (output) return JSON.parse(output).hookSpecificOutput?.additionalContext;
}

function editedFiles(patch) {
  const lines = patch.split(/\r?\n/);
  const paths = new Set();
  for (const [index, line] of lines.entries()) {
    const edit = /^\*\*\* (?:Add|Update) File: (.+)$/.exec(line);
    if (!edit) continue;
    const move = /^\*\*\* Move to: (.+)$/.exec(lines[index + 1] || '');
    paths.add(move ? move[1] : edit[1]);
  }
  return paths;
}

async function main() {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const patch = input.tool_input?.command;
  if (typeof patch !== 'string') return;

  const warnings = [];
  for (const file of editedFiles(patch)) {
    const filePath = path.resolve(input.cwd || process.cwd(), file);
    const warning = await lintFile(filePath);
    if (warning) warnings.push(warning);
  }
  if (warnings.length) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: warnings.join('\n') },
    }) + '\n');
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
