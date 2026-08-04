'use strict';

/**
 * error-codes-i18n-consistency.test.js — TODO.md #45, sub-item 2: static
 * consistency check between every server-side error `code` and the client's
 * i18n dictionary.
 *
 * The functional fix (auth-error-codes.test.js, GameHandler.test.js,
 * LobbyHandler.test.js) proves individual call sites forward `code` correctly.
 * This file guards the other failure mode: a `code` that exists on the server
 * but has no `err.<code>` key in client/js/i18n.js (or exists in only one of
 * vi/en) — that would make client/js/room-socket.js's `serverMessage()` fall
 * through to the raw key string instead of translated text, silently
 * reintroducing #45 for that one error. Parses source as text (no server/
 * client module coupling), so it stays valid across refactors as long as the
 * `{ error: '...', code: 'X' }` / `{ message: '...', code: 'X' }` shape holds.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');

const SERVER_FILES = [
  'server/managers/GameEngine.js',
  'server/managers/RoomManager.js',
  'server/managers/ChatHandler.js',
  'server/socket/handlers/GameHandler.js',
  'server/socket/handlers/RoomHandler.js',
  'server/socket/handlers/LobbyHandler.js',
  'server/socket/SocketHandler.js',
];

/** Every `code: 'X'` literal that sits inside an `{ error/message: ..., code: 'X' }` object literal. */
function extractCodes(source) {
  const codes = new Set();
  const re = /code:\s*'([A-Z0-9_]+)'/g;
  let m;
  while ((m = re.exec(source))) codes.add(m[1]);
  return codes;
}

function allServerCodes() {
  const codes = new Set();
  for (const rel of SERVER_FILES) {
    const source = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    for (const c of extractCodes(source)) codes.add(c);
  }
  return codes;
}

/** Load TRANSLATIONS.vi / TRANSLATIONS.en key sets from client/js/i18n.js without executing DOM code. */
function loadTranslationKeys() {
  const source = fs.readFileSync(path.join(REPO_ROOT, 'client/js/i18n.js'), 'utf8');
  const match = source.match(/const TRANSLATIONS = (\{[\s\S]*?\n\});/);
  if (!match) throw new Error('Could not locate TRANSLATIONS object in i18n.js');
  // eslint-disable-next-line no-eval
  const TRANSLATIONS = eval('(' + match[1] + ')');
  return {
    vi: new Set(Object.keys(TRANSLATIONS.vi)),
    en: new Set(Object.keys(TRANSLATIONS.en)),
  };
}

describe('server error codes ↔ client i18n consistency (TODO #45)', () => {
  const serverCodes = allServerCodes();
  const { vi, en } = loadTranslationKeys();

  test('sanity: found a non-trivial number of codes and keys', () => {
    // Loose bounds — this just guards against the regex/eval silently
    // matching nothing (e.g. after an unrelated refactor of the object shape).
    expect(serverCodes.size).toBeGreaterThan(40);
    expect(vi.size).toBeGreaterThan(200);
    expect(en.size).toBeGreaterThan(200);
  });

  test.each([...serverCodes].sort())('code %s has a vi AND en i18n key (err.%s)', (code) => {
    const key = 'err.' + code.toLowerCase();
    expect(vi.has(key)).toBe(true);
    expect(en.has(key)).toBe(true);
  });

  test('vi and en TRANSLATIONS have the same key set (pre-existing invariant, still holds)', () => {
    const missingFromEn = [...vi].filter(k => !en.has(k));
    const missingFromVi = [...en].filter(k => !vi.has(k));
    expect(missingFromEn).toEqual([]);
    expect(missingFromVi).toEqual([]);
  });
});
