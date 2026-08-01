'use strict';

/**
 * mine_confusables.js — Find real words (Vietnamese AND English — this is a
 * bilingual chat) that sit within edit distance of a vendored bad word,
 * using the SAME distance primitives as the production filter
 * (client/js/profanity-filter.js). These are exactly the "suspect zone"
 * cases a lightweight classifier needs to learn to reject (real word) vs
 * confirm (actual obfuscated bad word).
 *
 * Reads tools/profanity-training/data/{Viet74K,words_en}.txt (gitignored,
 * offline-only — see .gitignore for why) and writes confusables.csv next
 * to them.
 *
 * Usage: node tools/profanity-training/mine_confusables.js
 */

const fs = require('fs');
const path = require('path');
const pf = require('../../client/js/profanity-filter');

const DATA_DIR = path.join(__dirname, 'data');
const WORDLIST_PATHS = [
  path.join(DATA_DIR, 'Viet74K.txt'),
  path.join(DATA_DIR, 'words_en.txt'),
];
const OUT_PATH = path.join(DATA_DIR, 'confusables.csv');

// Same ratio+absolute-cap formula production uses (DEFAULT_THRESHOLD=0.25,
// absCap 1 for len<=6 else 2) — but deliberately WITHOUT production's
// MIN_*_LENGTH_FOR_FUZZY floor, so this also surfaces short-word collisions
// that are currently blocked only by that floor. That's the point: a
// reliable classifier reject-stage could let the floor come back down.
function maxDistFor(len) {
  const byRatio = Math.floor(len * pf.DEFAULT_THRESHOLD);
  const absCap = len <= 6 ? 1 : 2;
  return Math.min(byRatio, absCap);
}

function loadWordlists() {
  const words = new Set();
  WORDLIST_PATHS.forEach((p) => {
    const raw = fs.readFileSync(p, 'utf8');
    raw.split('\n').forEach((line) => {
      const w = line.trim().toLowerCase();
      if (!w || /[\s-']/.test(w)) return; // single tokens only
      words.add(w);
    });
  });
  return [...words];
}

function main() {
  const words = loadWordlists();
  const dict = pf.buildDictionary(pf.VI_BADWORDS.concat(pf.EN_BADWORDS));
  const seen = new Set();
  const rows = [['word', 'matched_form', 'distance', 'path']];
  let checked = 0;

  words.forEach((word) => {
    const norm = pf.normalizeToken(word);
    checked++;

    if (norm.hasDiacritics) {
      const units = pf.decomposeUnits(norm.accented);
      if (units.length < 2) return;
      const maxDist = maxDistFor(units.length);
      if (maxDist < 1) return;
      for (let len = units.length - maxDist; len <= units.length + maxDist; len++) {
        const bucket = dict.toneAware.byLength.get(len);
        if (!bucket) continue;
        for (const entry of bucket) {
          const dist = pf.toneAwareDistanceBounded(units, entry.units, maxDist);
          const key = word + '' + entry.toneKey;
          if (dist <= maxDist && !seen.has(key)) {
            seen.add(key);
            rows.push([word, entry.toneKey, String(dist), 'toneAware']);
          }
        }
      }
    } else {
      [norm.basic, norm.tight].forEach((form) => {
        if (!form || form.length < 2) return;
        const maxDist = maxDistFor(form.length);
        if (maxDist < 1) return;
        for (let len = form.length - maxDist; len <= form.length + maxDist; len++) {
          const bucket = dict.stripped.byLength.get(len);
          if (!bucket) continue;
          for (const cand of bucket) {
            const dist = pf.levenshteinBounded(form, cand, maxDist);
            const key = word + '' + cand;
            if (dist <= maxDist && !seen.has(key)) {
              seen.add(key);
              rows.push([word, cand, String(dist), 'stripped']);
            }
          }
        }
      });
    }
  });

  const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
  fs.writeFileSync(OUT_PATH, csv, 'utf8');
  console.log(`Checked ${checked} words, found ${rows.length - 1} confusable pairs.`);
  console.log(`Written to ${OUT_PATH}`);
}

main();
