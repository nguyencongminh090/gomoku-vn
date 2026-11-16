'use strict';
/**
 * GET /engine/<buildId>/<file> — engine files for a live lease (#405, design §3).
 *
 * Token in the `X-Engine-Token` header, never the URL: the URL stays stable per build so the browser keeps
 * one cached copy (`private` keeps it out of Cloudflare's shared cache, so every first download per browser
 * passes this check). Revocation = the token is refused once its lease is gone; files a browser already holds
 * cannot be taken back (control, not DRM).
 */
const path = require('path');
const express = require('express');
const { resolveBuild, ENGINE_FILE_NAME, ENGINE_BUILD_ID_RE } = require('../engine/build');
const { ERR } = require('../engine/constants');

const CACHE = 'private, max-age=31536000, immutable';
const TYPES = { js: 'text/javascript; charset=utf-8', wasm: 'application/wasm', data: 'application/octet-stream' };

function createEngineFilesRouter({ getLeaseManager, dir, buildId = null }) {
  const router = express.Router();
  let build;
  const currentBuild = () => {
    if (build === undefined) build = resolveBuild({ dir, buildId });
    return build;
  };

  router.get('/:buildId/:file', (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); // for every refusal below
    const { buildId: id, file } = req.params;
    const m = ENGINE_FILE_NAME.exec(file);
    const b = currentBuild();
    if (!ENGINE_BUILD_ID_RE.test(id) || !m || !b || id !== b.buildId || !Object.values(b.variants).some((f) => Object.values(f).includes(file))) {
      return res.status(404).json({ code: ERR.NO_BUILD });
    }
    const lm = getLeaseManager();
    const lease = lm && lm.verifyToken(req.get('X-Engine-Token'));
    if (!lease) return res.status(403).json({ code: ERR.BAD_TOKEN });
    lm.touch(lease.id);
    res.setHeader('Cache-Control', CACHE);
    res.setHeader('Content-Type', TYPES[m[2]]);
    return res.sendFile(path.join(b.dir, b.buildId, file), { dotfiles: 'deny', cacheControl: false, lastModified: false }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ code: ERR.NO_BUILD });
    });
  });

  return router;
}

module.exports = { createEngineFilesRouter, ENGINE_FILE_CACHE: CACHE };
