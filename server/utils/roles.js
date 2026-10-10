'use strict';

/**
 * roles.js — staff roles (R8, #205). One source of truth for "who may do what";
 * services call can(userId, permission) instead of reading a flag themselves.
 * member < moderator < admin. Guests have no users row → no role.
 */

const database = require('../db/database');

const ROLES = ['member', 'moderator', 'admin'];

const PERMISSIONS = {
  'puzzle.review': ['moderator', 'admin'],
  'forum.moderate': ['moderator', 'admin'],
  'admin.access': ['moderator', 'admin'],
};

/** The user's role; 'member' for an unknown/missing id or an unrecognised stored value. */
function roleOf(userId) {
  if (!userId) return 'member';
  const row = database.db.prepare('SELECT role FROM users WHERE id = ?').get(userId);
  return row && ROLES.includes(row.role) ? row.role : 'member';
}

function can(userId, permission) {
  return !!userId && (PERMISSIONS[permission] || []).includes(roleOf(userId));
}

/** Permissions a user holds, for the client to decide which tabs to show (the server still gates each call). */
function permissionsOf(userId) {
  return Object.keys(PERMISSIONS).filter((p) => can(userId, p));
}

module.exports = { ROLES, PERMISSIONS, roleOf, can, permissionsOf };
