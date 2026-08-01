'use strict';

/**
 * load-env.js — Minimal `.env` reader.
 *
 * Exists because backend fix #1 made a missing JWT_SECRET a hard startup
 * failure in every environment except `test` (deliberately — the old fallback
 * was a public dev secret anyone could forge tokens with). That left no
 * ordinary way to run the server locally: `npm start`, `npm run dev` and
 * start.sh all died on the guard unless the variable was exported by hand
 * every session.
 *
 * Hand-rolled rather than pulling in `dotenv`: this needs ~20 lines, and a
 * dependency that runs at startup and can inject environment variables is a
 * supply-chain surface worth not having for that.
 *
 * Rules:
 *   - A variable already set in the real environment always wins. The file is
 *     a fallback for local development, never an override, so a production
 *     process manager (pm2/systemd/docker) cannot be silently overridden by a
 *     stray file on disk.
 *   - Never loaded under NODE_ENV=test, so the suite stays hermetic.
 *   - A missing file is not an error.
 */

const fs = require('fs');
const path = require('path');

/**
 * Parse the contents of a .env file.
 *
 * Supports `KEY=value`, blank lines, `#` comments, `export KEY=value`, and
 * single- or double-quoted values. Anything else is skipped rather than
 * throwing — a malformed line should not stop the server from booting.
 *
 * @param {string} contents
 * @returns {Record<string,string>}
 */
function parseEnv(contents) {
  const out = {};
  for (const rawLine of String(contents).split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const withoutExport = line.startsWith('export ') ? line.slice(7).trim() : line;
    const eq = withoutExport.indexOf('=');
    if (eq <= 0) continue;

    const key = withoutExport.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = withoutExport.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
        (value.startsWith("'") && value.endsWith("'") && value.length > 1)) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * Load a .env file into process.env, without overriding anything already set.
 *
 * @param {string} [file] — defaults to `.env` at the repo root
 * @returns {string[]} names of the variables actually applied
 */
function loadEnv(file = path.join(__dirname, '..', '..', '.env')) {
  if (process.env.NODE_ENV === 'test') return [];

  let contents;
  try {
    contents = fs.readFileSync(file, 'utf8');
  } catch {
    return []; // no file — nothing to do
  }

  const applied = [];
  for (const [key, value] of Object.entries(parseEnv(contents))) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
      applied.push(key);
    }
  }
  return applied;
}

module.exports = { loadEnv, parseEnv };
