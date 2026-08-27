/**
 * TODO.md #126 / docs/todo/B126-modulepreload-cho-es-module-do-tren-domain-that-qua-tunnel.md
 *
 * room.html and index.html each declare <link rel="modulepreload"> hints for
 * every module their entry file (room-entry.js / index-entry.js) statically
 * imports, so the browser can start fetching them before it finishes
 * parsing the entry module instead of discovering them one level late.
 *
 * The failure mode if these two lists ever drift apart is silent: a stale
 * or missing hint doesn't throw or log anything, it just makes the browser
 * fetch that module twice (once via the ignored/mismatched preload, once via
 * the real import) — see the todo file's "double-load" warning. This test
 * parses both the HTML hint list and the entry file's real `import`
 * statements from source and asserts they name the exact same files at the
 * exact same `?v=` version, so an edit to one side without the other fails
 * `npm test` instead of shipping a silent double-fetch.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const CLIENT_DIR = path.join(__dirname, '..');

function extractModulepreloadHints(htmlFile) {
  const html = fs.readFileSync(path.join(CLIENT_DIR, htmlFile), 'utf8');
  const linkRe = /<link\s+rel="modulepreload"\s+href="js\/([^"?]+)\?v=(\d+)"\s*\/>/g;
  const hints = [];
  let m;
  while ((m = linkRe.exec(html)) !== null) {
    hints.push({ file: m[1], version: m[2] });
  }
  return hints;
}

function extractEntryImports(entryFile) {
  const src = fs.readFileSync(path.join(CLIENT_DIR, 'js', entryFile), 'utf8');
  const importRe = /^import\s+['"]\.\/([^'"?]+)\?v=(\d+)['"];/gm;
  const imports = [];
  let m;
  while ((m = importRe.exec(src)) !== null) {
    imports.push({ file: m[1], version: m[2] });
  }
  return imports;
}

function asSortedKeys(entries) {
  return entries.map((e) => `${e.file}@${e.version}`).sort();
}

// index-entry.js dropped from 7 imports to 5 in TODO.md #145: session.js and
// socket-client.js became classic <head> scripts on index.html so the socket
// handshake can start during parsing. Both sides were removed together (the
// hint/import parity tests below are what prove that), and the two files must
// NOT come back as module imports — importing a file that a <script> tag has
// already run evaluates it a second time, which is the #51 duplicate-socket
// bug. That direction is guarded in client/tests/socket-early-connect.test.js.
// room-entry.js is untouched: #145 is index.html-only for now.
// #159 then added private-chat.js as a 6th index-entry import (+ its hint).
describe.each([
  ['room.html', 'room-entry.js', 11],
  ['index.html', 'index-entry.js', 6],
])('%s modulepreload hints vs %s imports (TODO.md #126)', (htmlFile, entryFile, expectedCount) => {
  test(`entry file has exactly ${expectedCount} static imports (sanity check on the count itself)`, () => {
    const imports = extractEntryImports(entryFile);
    expect(imports.length).toBe(expectedCount);
  });

  test('HTML declares exactly one modulepreload hint per entry import, no more, no fewer', () => {
    const hints = extractModulepreloadHints(htmlFile);
    const imports = extractEntryImports(entryFile);

    expect(hints.length).toBe(imports.length);
  });

  test('hint list and import list name the exact same files at the exact same ?v= version', () => {
    const hints = extractModulepreloadHints(htmlFile);
    const imports = extractEntryImports(entryFile);

    expect(asSortedKeys(hints)).toEqual(asSortedKeys(imports));
  });

  test('no duplicate hints for the same file', () => {
    const hints = extractModulepreloadHints(htmlFile);
    const files = hints.map((h) => h.file);
    expect(new Set(files).size).toBe(files.length);
  });
});
