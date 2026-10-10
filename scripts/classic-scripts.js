'use strict';

/**
 * Classic (non-module) `<script src="js/...">` references across client/*.html — the files the
 * vite `copy-classic-scripts` plugin must copy into dist/ (see vite.config.js). Lives here, as
 * CommonJS, so Jest can test it; vite.config.js is ESM and not requirable.
 */

const { readdirSync, readFileSync } = require('fs');
const { resolve } = require('path');

const CLASSIC_RE = /<script\s+src="js\/([^"?]+)(?:\?[^"]*)?"(?![^>]*type="module")[^>]*>/g;

/** Classic script paths (relative to client/js) referenced by one HTML source; comments are not markup (#194). */
function classicScriptsIn(html) {
  const live = html.replace(/<!--[\s\S]*?(?:-->|$)/g, '');
  return [...live.matchAll(CLASSIC_RE)].map((m) => m[1]);
}

function findClassicScripts(clientDir) {
  const files = new Set();
  for (const htmlFile of readdirSync(clientDir)) {
    if (!htmlFile.endsWith('.html') || htmlFile.includes('mockup')) continue;
    for (const f of classicScriptsIn(readFileSync(resolve(clientDir, htmlFile), 'utf8'))) files.add(f);
  }
  return [...files];
}

module.exports = { classicScriptsIn, findClassicScripts };
