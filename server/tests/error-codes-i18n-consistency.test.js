'use strict';

/**
 * error-codes-i18n-consistency.test.js — TODO.md #45, sub-item 2 (+ follow-up
 * "system chat messages" pass): static consistency check between every
 * server-side `code` and the client's i18n dictionary.
 *
 * The functional fix (auth-error-codes.test.js, GameHandler.test.js,
 * LobbyHandler.test.js) proves individual call sites forward `code` correctly.
 * This file guards the other failure mode: a `code` that exists on the server
 * but has no matching key in client/js/i18n.js (or exists in only one of
 * vi/en) — that would make the client's translation fall through to the raw
 * key string instead of translated text, silently reintroducing #45 for that
 * one message. Parses source as text (no server/client module coupling), so
 * it stays valid across refactors as long as the object-literal shapes below
 * hold.
 *
 * Two code families, two i18n namespaces:
 *   - `{ error/message: '...', code: 'X' }` (auth/room/game errors) → `err.<code>`
 *   - `{ text: '...', code: 'X', vars: {...} }` (chat:message system announcements) → `sys.<code>`
 * These must be told apart (not just unioned into one set) because a code
 * used only as a chat announcement has no reason to also exist under `err.*`,
 * and mixing the two would let a genuinely-missing key hide behind the other
 * family's coincidentally-matching entry.
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
  'server/socket/handlers/ChatHandler.js',
  'server/socket/handlers/PrivateChatHandler.js',
  'server/socket/handlers/DisconnectHandler.js',
  'server/socket/SocketHandler.js',
  'server/socket/state.js',
  'server/routes/games.js',
  'server/middleware/auth.js',
  'server/middleware/errorHandler.js',
  'server/index.js',
];

/**
 * Scan for `code: 'X'` and classify by whichever of `text:`/`error:`/
 * `message:` appears closest (last) before it in the source — `text:` →
 * sys-family, `error:`/`message:` → err-family. A bounded-distance backward
 * search rather than brace-matching, because these payloads' `text:` values
 * are template literals with `${...}` interpolation — the `{` inside that
 * interpolation is textually closer to `code:` than the object literal's own
 * opening `{`, which breaks naive brace matching.
 */
function extractCodes(source) {
  const errCodes = new Set();
  const sysCodes = new Set();
  const codeRe = /code:\s*'([A-Z0-9_]+)'/g;
  const WINDOW = 400;
  let m;
  while ((m = codeRe.exec(source))) {
    const code = m[1];
    const windowStart = Math.max(0, m.index - WINDOW);
    const before = source.slice(windowStart, m.index);
    const lastText = before.lastIndexOf('text:');
    const lastError = before.lastIndexOf('error:');
    const lastMessage = before.lastIndexOf('message:');
    const lastErrOrMsg = Math.max(lastError, lastMessage);
    if (lastText === -1 && lastErrOrMsg === -1) continue;
    if (lastText > lastErrOrMsg) {
      sysCodes.add(code);
    } else {
      errCodes.add(code);
    }
  }
  return { errCodes, sysCodes };
}

function allServerCodes() {
  const errCodes = new Set();
  const sysCodes = new Set();
  for (const rel of SERVER_FILES) {
    const source = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    const found = extractCodes(source);
    for (const c of found.errCodes) errCodes.add(c);
    for (const c of found.sysCodes) sysCodes.add(c);
  }
  return { errCodes, sysCodes };
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
  const { errCodes, sysCodes } = allServerCodes();
  const { vi, en } = loadTranslationKeys();

  test('sanity: found a non-trivial number of codes and keys', () => {
    // Loose bounds — this just guards against the regex/eval silently
    // matching nothing (e.g. after an unrelated refactor of the object shape).
    expect(errCodes.size).toBeGreaterThan(40);
    expect(sysCodes.size).toBeGreaterThan(10);
    expect(vi.size).toBeGreaterThan(200);
    expect(en.size).toBeGreaterThan(200);
  });

  test.each([...errCodes].sort())('error code %s has a vi AND en i18n key (err.%s)', (code) => {
    const key = 'err.' + code.toLowerCase();
    expect(vi.has(key)).toBe(true);
    expect(en.has(key)).toBe(true);
  });

  test.each([...sysCodes].sort())('system chat code %s has a vi AND en i18n key (sys.%s)', (code) => {
    const key = 'sys.' + code.toLowerCase();
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
