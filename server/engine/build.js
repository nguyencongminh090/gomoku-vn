'use strict';
const fs = require('fs');
const path = require('path');

const DEFAULT_DIR = path.join(__dirname, '..', 'engine-files');
const BUILD_ID = /^[0-9a-f]{12}$/;
/** Files a lease may download. `multi` needs a cross-origin isolated page (SharedArrayBuffer, #408). */
const VARIANTS = Object.freeze({
  single: { js: 'rapfi-single-simd128.js', wasm: 'rapfi-single-simd128.wasm', data: 'rapfi-single-simd128.data' },
  multi: { js: 'rapfi-multi-simd128.js', wasm: 'rapfi-multi-simd128.wasm', data: 'rapfi-multi-simd128.data' },
});
const FILE_NAME = /^rapfi-(single|multi)-simd128\.(js|wasm|data)$/;

/**
 * Which build to serve: `buildId` if given and present, else the first `<hex12>` dir (sorted) that holds the
 * single variant (the always-available fallback). → { dir, buildId, files (single), variants: {single, multi?} } | null.
 */
function resolveBuild({ dir = DEFAULT_DIR, buildId = null } = {}) {
  let ids;
  try { ids = fs.readdirSync(dir).filter((d) => BUILD_ID.test(d)).sort(); } catch (_) { return null; }
  if (buildId) ids = ids.filter((d) => d === buildId);
  for (const id of ids) {
    const has = (v) => Object.values(VARIANTS[v]).every((f) => fs.existsSync(path.join(dir, id, f)));
    if (has('single')) {
      const variants = { single: VARIANTS.single };
      if (has('multi')) variants.multi = VARIANTS.multi;
      return { dir, buildId: id, files: VARIANTS.single, variants };
    }
  }
  return null;
}

module.exports = { resolveBuild, ENGINE_VARIANTS: VARIANTS, ENGINE_FILE_NAME: FILE_NAME, ENGINE_BUILD_ID_RE: BUILD_ID, DEFAULT_ENGINE_DIR: DEFAULT_DIR };
