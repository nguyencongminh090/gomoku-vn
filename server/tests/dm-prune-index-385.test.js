'use strict';

/**
 * dm-prune-index-385.test.js — B385: DmService.pruneExpired runs on the game thread (boot, hourly, DM reads
 * ≤ 1/min); its DELETE must seek idx_dm_created (migration 016), never scan direct_messages. Expiry unchanged.
 */

jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { db } = require('../db/connection');
const dm = require('../managers/DmService');

const plan = (sql, ...p) => db.prepare('EXPLAIN QUERY PLAN ' + sql).all(...p).map((r) => r.detail).join(' | ');

test('migration 016: idx_dm_created on direct_messages(created_at)', () => {
  expect(db.pragma('index_info(idx_dm_created)').map((c) => c.name)).toEqual(['created_at']);
});

test('the prune DELETE seeks the index (no table scan)', () => {
  const p = plan('DELETE FROM direct_messages WHERE created_at < ?', new Date().toISOString());
  expect(p).toMatch(/USING COVERING INDEX idx_dm_created/);
  expect(p).not.toMatch(/SCAN direct_messages/);
});

test('expiry unchanged: older than DM_TTL_MS gone, newer kept', () => {
  const ins = db.prepare('INSERT INTO users (id, username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)');
  ins.run('u385a', 'u385a', 'A', 'x'); ins.run('u385b', 'u385b', 'B', 'x');
  const now = Date.now();
  const msg = db.prepare('INSERT INTO direct_messages (conv_key, sender_id, recipient_id, body, created_at) VALUES (?, ?, ?, ?, ?)');
  msg.run('u385a|u385b', 'u385a', 'u385b', 'old', new Date(now - dm.DM_TTL_MS - 1).toISOString());
  msg.run('u385a|u385b', 'u385a', 'u385b', 'edge', new Date(now - dm.DM_TTL_MS).toISOString());
  msg.run('u385a|u385b', 'u385a', 'u385b', 'new', new Date(now - 1000).toISOString());
  expect(dm.pruneExpired(now, true)).toBe(1);
  expect(db.prepare("SELECT body FROM direct_messages WHERE conv_key = 'u385a|u385b' ORDER BY id").all().map((r) => r.body)).toEqual(['edge', 'new']);
});
