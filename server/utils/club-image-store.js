'use strict';

/**
 * club-image-store.js — where club avatar/banner files live (#250).
 * One file per club per kind: <CLUB_IMAGE_DIR>/<clubId>-<kind>.webp. The DB side is clubs.avatar_v / banner_v (0 = none).
 */

const fs = require('fs');
const path = require('path');

const CLUB_IMAGE_DIR = process.env.CLUB_IMAGE_DIR || path.join(__dirname, '..', 'data', 'club-images');
const KINDS = Object.freeze({
  avatar: { w: 256, h: 256, maxBytes: 30 * 1024 },
  banner: { w: 1200, h: 200, maxBytes: 150 * 1024 },
});

const imageFile = (clubId, kind) => path.join(CLUB_IMAGE_DIR, `${clubId}-${kind}.webp`);
const removeImage = (clubId, kind) => fs.rmSync(imageFile(clubId, kind), { force: true });

module.exports = { CLUB_IMAGE_DIR, KINDS, imageFile, removeImage };
