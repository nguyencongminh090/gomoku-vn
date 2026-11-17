'use strict';

/**
 * earlyHints.js — origin `Link` header for the lobby page (TODO.md #410).
 *
 * Cloudflare Early Hints (zone setting ON) caches the `Link` header of an HTML
 * response and replays it as a 103 before the next 200. With no origin header,
 * the browser got preloads that did not match how the page fetches the files
 * (`as=script` for a `type=module` entry, …) → "preloaded but not used" warnings.
 *
 * The list is derived from client/index.html itself, so the `?v=` hashes written
 * by scripts/cache-bust.js can never drift from a second hand-written list.
 * Mapping (a hint must match the real fetch mode or the browser refetches):
 *   <script src>               → rel=preload; as=script            (no crossorigin: same-origin classic)
 *   <script type=module src>   → rel=modulepreload
 *   <link rel=modulepreload>   → rel=modulepreload
 *   <link rel=stylesheet>      → rel=preload; as=style
 *   <link rel=preload …>       → copied (as / type / crossorigin)
 * Off-origin URLs are skipped; duplicates keep their first position.
 */

const fs = require('fs');
const path = require('path');

const ATTR_RE = /([a-zA-Z-]+)(?:\s*=\s*"([^"]*)")?/g;

function parseAttrs(tagBody) {
  const attrs = {};
  let m;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(tagBody))) attrs[m[1].toLowerCase()] = m[2] === undefined ? true : m[2];
  return attrs;
}

function toPath(url) {
  if (!url || /^[a-z]+:|^\/\//i.test(url)) return null; // off-origin / data: — not ours to hint
  return url.startsWith('/') ? url : '/' + url;
}

/** Ordered hint list `{ href, rel, as?, type?, crossorigin? }` for an HTML document. */
function collectHints(html) {
  const src = html.replace(/<!--[\s\S]*?-->/g, '');
  const hints = [];
  const seen = new Set();
  const add = (hint) => {
    if (!hint.href || seen.has(hint.href)) return;
    seen.add(hint.href);
    hints.push(hint);
  };
  const tagRe = /<(script|link)\b([^>]*)>/gi;
  let m;
  while ((m = tagRe.exec(src))) {
    const a = parseAttrs(m[2]);
    if (m[1].toLowerCase() === 'script') {
      const href = toPath(a.src);
      if (a.type === 'module') add({ href, rel: 'modulepreload' });
      else add({ href, rel: 'preload', as: 'script' });
      continue;
    }
    const rel = typeof a.rel === 'string' ? a.rel.toLowerCase() : '';
    const href = toPath(a.href);
    if (rel === 'modulepreload') add({ href, rel: 'modulepreload' });
    else if (rel === 'stylesheet') add({ href, rel: 'preload', as: 'style' });
    else if (rel === 'preload' && a.as) {
      add({ href, rel: 'preload', as: a.as, type: a.type, crossorigin: a.crossorigin !== undefined });
    }
  }
  return hints;
}

function formatHint(h) {
  let s = `<${h.href}>; rel=${h.rel}`;
  if (h.as) s += `; as=${h.as}`;
  if (typeof h.type === 'string') s += `; type=${h.type}`;
  if (h.crossorigin) s += '; crossorigin';
  return s;
}

function buildLinkHeader(html) {
  return collectHints(html).map(formatHint).join(', ');
}

/**
 * Express middleware: sets `Link` on GET/HEAD `/` and `/index.html`. Built once at
 * startup (index.html only changes with a deploy, which restarts the server).
 */
function indexLinkHints(clientPath) {
  const value = buildLinkHeader(fs.readFileSync(path.join(clientPath, 'index.html'), 'utf8'));
  return (req, res, next) => {
    if ((req.method === 'GET' || req.method === 'HEAD') && (req.path === '/' || req.path === '/index.html')) {
      res.setHeader('Link', value);
    }
    next();
  };
}

module.exports = { collectHints, buildLinkHeader, indexLinkHints };
