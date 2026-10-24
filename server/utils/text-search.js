'use strict';

/**
 * text-search.js — pure NLP core for name search (no I/O).
 *
 * Pipeline: fold (NFKC → NFD, drop combining marks / zero-width / bidi, đ→d, lowercase)
 *   → tokenize (letters+digits) → score a query against a document's fields:
 *   exact > prefix > all tokens matched as prefixes (any order) > substring > typo-tolerant
 *   (optimal-string-alignment distance, so a swapped pair "nugyen" costs 1).
 * Fuzzy matches are a fallback tier: used only when nothing matches without a typo,
 * so a precise query is never padded with look-alikes.
 */

// Zero-width space/joiners, LRM/RLM, bidi embeddings/overrides/isolates, word joiner, BOM.
const INVISIBLE = /[​-‏‪-‮⁠-⁩﻿]/g;
const MARKS = /[̀-ͯ]/g;

/** Case-, accent- and invisible-char-insensitive form: "Nguyễn  Đức" → "nguyen duc". */
function fold(s) {
  return String(s == null ? '' : s)
    .normalize('NFKC').replace(INVISIBLE, '')
    .normalize('NFD').replace(MARKS, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ').trim();
}

function tokenize(folded) {
  return folded.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** Edits a token of this length may be off by (0 for ≤3 chars: "an" must not match "ba"). */
function maxEdits(len) {
  return len <= 3 ? 0 : len <= 6 ? 1 : 2;
}

/** Optimal-string-alignment distance (insert, delete, substitute, adjacent swap); returns max+1 when over `max`. */
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

/** A prepared searchable field. */
function prepare(text) {
  const f = fold(text);
  return { raw: String(text == null ? '' : text), fold: f, tokens: tokenize(f) };
}

/** Prepare a query once for many scoreField calls. Empty `fold` means "matches nothing". */
function prepareQuery(q) {
  const f = fold(q);
  return { fold: f, tokens: tokenize(f), rawLower: String(q || '').normalize('NFC').toLowerCase().trim() };
}

/**
 * Score one field, 0 = no match. Fuzzy-tier scores are < 30, exact-tier scores ≥ 40,
 * so callers can tell the tiers apart with `score >= EXACT_TIER`.
 */
const EXACT_TIER = 40;

function scoreField(query, field) {
  if (!query.fold || !field.fold) return 0;
  let score = 0;
  if (field.fold === query.fold) score = 100;
  else if (field.fold.startsWith(query.fold)) score = 85;

  if (!score) {
    // Every query token must hit some field token (prefix); order-free, so "van nguyen" finds "Nguyễn Văn A".
    let sum = 0;
    let inOrder = true;
    let at = -1;
    let ok = true;
    for (const qt of query.tokens) {
      let best = 0;
      let bestIdx = -1;
      field.tokens.forEach((ft, i) => {
        const s = ft === qt ? 1 : ft.startsWith(qt) ? 0.8 : 0;
        if (s > best) { best = s; bestIdx = i; }
      });
      if (!best) { ok = false; break; }
      sum += best;
      if (bestIdx <= at) inOrder = false;
      at = bestIdx;
    }
    if (ok && query.tokens.length) score = 50 + 10 * (sum / query.tokens.length) + (inOrder ? 3 : 0);
  }
  if (!score && field.fold.includes(query.fold)) score = EXACT_TIER + 5; // mid-word substring: "guyen" in "nguyen"

  if (!score) {
    // Typo tier: each query token within its edit budget of some field token (or of that token's same-length prefix).
    let penalty = 0;
    let ok = query.tokens.length > 0;
    for (const qt of query.tokens) {
      const budget = maxEdits(qt.length);
      let best = Infinity;
      for (const ft of field.tokens) {
        const d = Math.min(editDistance(qt, ft, budget), editDistance(qt, ft.slice(0, qt.length), budget));
        if (d < best) best = d;
      }
      if (best > budget) { ok = false; break; }
      penalty += best;
    }
    if (ok) score = Math.max(1, 25 - 8 * penalty);
  }

  // Typing the accents exactly as stored is a (small) tie-breaker over the accent-less match.
  if (score && query.rawLower !== query.fold && field.raw.normalize('NFC').toLowerCase().includes(query.rawLower)) score += 2;
  return score;
}

/** Score docs, keep the exact tier if it has any hit, else the typo tier; best first. */
function rank(query, docs, limit) {
  const exact = [];
  const fuzzy = [];
  for (const d of docs) {
    let best = 0;
    for (const f of d.fields) {
      const s = scoreField(query, f);
      if (s > best) best = s;
    }
    if (best >= EXACT_TIER) exact.push({ id: d.id, score: best, len: d.fields[0].fold.length });
    else if (best > 0) fuzzy.push({ id: d.id, score: best, len: d.fields[0].fold.length });
  }
  const hits = exact.length ? exact : fuzzy;
  hits.sort((a, b) => b.score - a.score || a.len - b.len || (a.id < b.id ? -1 : 1));
  return (limit ? hits.slice(0, limit) : hits).map(({ id, score }) => ({ id, score }));
}

/**
 * Rank documents for a query (brute force: scores every doc).
 * @param {string} q
 * @param {Array<{id:string, fields:Array<ReturnType<prepare>>}>} docs
 * @param {{limit?:number}} [opts]
 * @returns {Array<{id:string, score:number}>} best first; shorter names win ties
 */
function search(q, docs, opts = {}) {
  const query = prepareQuery(q);
  return query.fold ? rank(query, docs, opts.limit) : [];
}

/**
 * Token → doc index so a query scores only plausible docs instead of all of them.
 * Result-identical to search(): a query token always lies inside ONE doc token (tokens are
 * maximal letter/digit runs), so "some doc token contains the longest query token" is a
 * necessary condition for every exact-tier match (exact, prefix, token-prefix, substring);
 * the typo tier is gathered the same way with the edit budget.
 */
function createIndex(docs) {
  const byToken = new Map(); // token → docs having it in any field
  for (const d of docs) {
    for (const f of d.fields) {
      for (const t of f.tokens) {
        let l = byToken.get(t);
        if (!l) byToken.set(t, (l = []));
        if (l[l.length - 1] !== d) l.push(d);
      }
    }
  }
  return { docs, byToken };
}

function collect(index, match) {
  const seen = new Set();
  for (const [tok, list] of index.byToken) {
    if (!match(tok)) continue;
    for (const d of list) seen.add(d);
  }
  return seen;
}

function searchIndex(q, index, opts = {}) {
  const query = prepareQuery(q);
  if (!query.fold) return [];
  // Punctuation-only query ("%", "_"): no token to index on; literal substring over everything, as search() does.
  if (!query.tokens.length) return rank(query, index.docs, opts.limit);
  const key = query.tokens.reduce((a, b) => (b.length > a.length ? b : a));
  const exact = rank(query, collect(index, (tok) => tok.includes(key)), opts.limit);
  if (exact.length && exact[0].score >= EXACT_TIER) return exact;
  const budget = maxEdits(key.length);
  return rank(query, collect(index, (tok) => editDistance(key, tok, budget) <= budget
    || editDistance(key, tok.slice(0, key.length), budget) <= budget), opts.limit);
}

module.exports = { fold, tokenize, editDistance, prepare, prepareQuery, scoreField, search, createIndex, searchIndex, EXACT_TIER };
