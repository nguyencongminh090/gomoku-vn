'use strict';

/**
 * export_badwords.js — Dump normalized bad-word forms to JSON so the Python
 * training script doesn't need to re-implement normalizeToken().
 */

const fs = require('fs');
const path = require('path');
const pf = require('../../client/js/profanity-filter');

const forms = new Set();
pf.VI_BADWORDS.concat(pf.EN_BADWORDS).forEach((w) => {
  const norm = pf.normalizeToken(w);
  if (norm.hasDiacritics) {
    if (norm.accented.length >= 2) forms.add(norm.accented);
  } else {
    if (norm.basic.length >= 2) forms.add(norm.basic);
    if (norm.tight.length >= 2) forms.add(norm.tight);
  }
});

const outPath = path.join(__dirname, 'data', 'badword_forms.json');
fs.writeFileSync(outPath, JSON.stringify([...forms], null, 2), 'utf8');
console.log(`Wrote ${forms.size} normalized bad-word forms to ${outPath}`);
