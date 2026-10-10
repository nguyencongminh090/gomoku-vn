'use strict';

/**
 * avatar-store.js — where avatar files live (shared by the profile routes and staff removal, #207).
 * One file per user: <AVATAR_DIR>/<userId>.webp. The DB side is users.avatar_v (0 = none).
 */

const fs = require('fs');
const path = require('path');

const AVATAR_DIR = process.env.AVATAR_DIR || path.join(__dirname, '..', 'data', 'avatars');

const avatarFile = (userId) => path.join(AVATAR_DIR, `${userId}.webp`);

/** Delete the file if present (idempotent). */
const removeFile = (userId) => fs.rmSync(avatarFile(userId), { force: true });

module.exports = { AVATAR_DIR, avatarFile, removeFile };
