'use strict';

/** db/profiles.js — split out of database.js (#258); code moved verbatim. */

const { db } = require('./connection');


// ---------------------------------------------------------------------------
// Profiles (#177)
// ---------------------------------------------------------------------------

const PROFILE_COLS = 'id, username, display_name, created_at, bio, avatar_v, hide_history, hide_bio, country, city, who_can_dm, who_can_challenge, who_can_friend, hide_online';

function getUiSkin(userId) {
  const r = db.prepare('SELECT ui_skin FROM users WHERE id = ?').get(userId);
  return r ? r.ui_skin : null;
}

function getProfileById(id) {
  return db.prepare(`SELECT ${PROFILE_COLS} FROM users WHERE id = ?`).get(id);
}

function getProfileByUsername(username) {
  return db.prepare(`SELECT ${PROFILE_COLS} FROM users WHERE username = ? COLLATE NOCASE`).get(username);
}

/** @param {{bio?:string, hide_history?:boolean, hide_bio?:boolean, ui_skin?:string}} f */
function updateProfile(userId, f) {
  const sets = [], params = [];
  if (typeof f.ui_skin === 'string') { sets.push('ui_skin = ?'); params.push(f.ui_skin); }
  if (typeof f.bio === 'string') { sets.push('bio = ?'); params.push(f.bio); }
  if (typeof f.hide_history === 'boolean') { sets.push('hide_history = ?'); params.push(f.hide_history ? 1 : 0); }
  if (typeof f.hide_bio === 'boolean') { sets.push('hide_bio = ?'); params.push(f.hide_bio ? 1 : 0); }
  if (typeof f.country === 'string') { sets.push('country = ?'); params.push(f.country); }
  if (typeof f.city === 'string') { sets.push('city = ?'); params.push(f.city); }
  for (const k of ['who_can_dm', 'who_can_challenge', 'who_can_friend']) {
    if (typeof f[k] === 'string') { sets.push(`${k} = ?`); params.push(f[k]); }
  }
  if (typeof f.hide_online === 'boolean') { sets.push('hide_online = ?'); params.push(f.hide_online ? 1 : 0); }
  if (!sets.length) return;
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params, userId);
}

/** Set (bump) or clear (0) the avatar version; returns the new version. */
function setAvatarVersion(userId, clear) {
  db.prepare('UPDATE users SET avatar_v = ? WHERE id = ?')
    .run(clear ? 0 : Date.now() % 2147483647, userId);
  return db.prepare('SELECT avatar_v FROM users WHERE id = ?').get(userId).avatar_v;
}

/** Aggregate record for a user's finished games. */
function getUserGameStats(userId) {
  return db.prepare(`
    SELECT COUNT(*) AS games,
           SUM(CASE WHEN winner_color = 'DRAW' THEN 1 ELSE 0 END) AS draws,
           SUM(CASE WHEN (winner_color = 'BLACK' AND black_player_id = @id)
                      OR (winner_color = 'WHITE' AND white_player_id = @id) THEN 1 ELSE 0 END) AS wins
    FROM games
    WHERE (black_player_id = @id OR white_player_id = @id) AND ended_at IS NOT NULL
  `).get({ id: userId });
}

/** Newest-first outcomes ('win'|'loss'|'draw') of the user's finished RATED games with a decided result. */
function getUserRankedResults(userId, limit) {
  return db.prepare(`
    SELECT winner_color, black_player_id FROM games
    WHERE (black_player_id = @id OR white_player_id = @id) AND ranked = 1 AND ended_at IS NOT NULL AND winner_color IS NOT NULL
    ORDER BY ended_at DESC LIMIT @limit
  `).all({ id: userId, limit }).map((g) => {
    if (g.winner_color === 'DRAW') return 'draw';
    return (g.winner_color === 'BLACK') === (g.black_player_id === userId) ? 'win' : 'loss';
  });
}

function countUserRankedWins(userId) {
  return db.prepare(`
    SELECT COUNT(*) AS n FROM games
    WHERE ranked = 1 AND ended_at IS NOT NULL
      AND ((winner_color = 'BLACK' AND black_player_id = @id) OR (winner_color = 'WHITE' AND white_player_id = @id))
  `).get({ id: userId }).n;
}

function getUserRecentGames(userId, limit, offset = 0) {
  return db.prepare(`
    SELECT id, black_player_id, black_player_name, white_player_name, winner_color, ended_at
    FROM games
    WHERE (black_player_id = @id OR white_player_id = @id) AND ended_at IS NOT NULL
    ORDER BY ended_at DESC, id LIMIT @limit OFFSET @offset
  `).all({ id: userId, limit, offset });
}

module.exports = { getProfileByUsername, getProfileById, getUiSkin, updateProfile, setAvatarVersion, getUserGameStats, getUserRecentGames, getUserRankedResults, countUserRankedWins };
