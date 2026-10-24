'use strict';

/**
 * db/user-search.js — in-memory name index over `users` for the NLP search (utils/text-search.js).
 *
 * Query results are LRU-cached per index version (rankings asks for the page and the count).
 * Rebuilt when the users table's (row count, max rowid) changes, i.e. on sign-up / delete.
 * Names are never edited in place today; if a rename path is added, call invalidate() from it.
 */

const { db } = require('./connection');
const textSearch = require('../utils/text-search');

const RESULT_CACHE_MAX = 200;
let cache = null; // { stamp, index, results: Map<q, id[]> }

function stamp() {
  const r = db.prepare('SELECT COUNT(*) AS n, COALESCE(MAX(rowid), 0) AS m FROM users').get();
  return `${r.n}:${r.m}`;
}

function load() {
  const s = stamp();
  if (!cache || cache.stamp !== s) {
    const rows = db.prepare('SELECT id, username, display_name FROM users').all();
    // fields[0] = display name (what people type / see), fields[1] = login handle.
    const docs = rows.map((r) => ({ id: r.id, fields: [textSearch.prepare(r.display_name), textSearch.prepare(r.username)] }));
    cache = { stamp: s, index: textSearch.createIndex(docs), results: new Map() };
  }
  return cache;
}

function invalidate() { cache = null; }

/**
 * User ids matching `q` (username or display name), best first.
 * @param {string} q
 * @param {{limit?:number, exclude?:string}} [opts]
 * @returns {string[]}
 */
function matchUserIds(q, opts = {}) {
  const c = load();
  const key = String(q);
  let ids = c.results.get(key);
  if (!ids) {
    ids = textSearch.searchIndex(key, c.index).map((h) => h.id);
    if (c.results.size >= RESULT_CACHE_MAX) c.results.delete(c.results.keys().next().value);
    c.results.set(key, ids);
  } else {
    c.results.delete(key); c.results.set(key, ids); // LRU touch
  }
  if (opts.exclude) ids = ids.filter((id) => id !== opts.exclude);
  return opts.limit ? ids.slice(0, opts.limit) : ids;
}

module.exports = { matchUserIds, invalidate };
