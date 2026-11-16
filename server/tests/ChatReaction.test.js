'use strict';

/**
 * #368 — room:react: a spectator/player taps 👏 on the phone "live stage"; everyone else in the room sees it float up.
 * Whitelisted kinds only, own sliding-window rate limit (separate from chat), sender excluded (it plays locally).
 */

jest.mock('../../client/js/profanity-filter', () => ({ filterMessage: jest.fn((t) => t) }));
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { handleReaction, cleanupUser, REACTION_KINDS, REACT_RATE_LIMIT } = require('../managers/ChatHandler');

function makeSocket(userId = 'u1') {
  const sent = [];
  return {
    sent,
    user: { userId, displayName: 'Alice' },
    emit: jest.fn(),
    to: jest.fn((room) => ({ emit: (event, data) => sent.push({ room, event, data }) })),
  };
}

afterEach(() => { cleanupUser('u1'); cleanupUser('u2'); });

test('a whitelisted kind is broadcast to the rest of the room with the sender id', () => {
  const s = makeSocket('u1');
  expect(handleReaction(s, 'room1', 'clap')).toBe(true);
  expect(s.sent).toEqual([{ room: 'room1', event: 'room:react', data: { kind: 'clap', fromId: 'u1' } }]);
});

test('unknown kinds and non-strings are dropped silently', () => {
  const s = makeSocket('u1');
  for (const k of ['<img>', 'CLAP', '', null, undefined, 42, { kind: 'clap' }]) expect(handleReaction(s, 'room1', k)).toBe(false);
  expect(s.sent).toHaveLength(0);
  expect(s.emit).not.toHaveBeenCalled();
});

test('the whitelist is small and fixed', () => {
  expect(REACTION_KINDS).toEqual(['clap', 'heart', 'fire', 'wow']);
});

test('rate limit: more than REACT_RATE_LIMIT inside the window is dropped, per user', () => {
  const a = makeSocket('u1');
  const b = makeSocket('u2');
  for (let i = 0; i < REACT_RATE_LIMIT + 5; i++) handleReaction(a, 'room1', 'clap');
  expect(a.sent).toHaveLength(REACT_RATE_LIMIT);
  expect(handleReaction(b, 'room1', 'heart')).toBe(true);
});

test('reactions do not use up the chat message budget', () => {
  const { handleMessage } = require('../managers/ChatHandler');
  const s = makeSocket('u1');
  for (let i = 0; i < REACT_RATE_LIMIT; i++) handleReaction(s, 'room1', 'clap');
  const io = { to: jest.fn(() => ({ emit: jest.fn() })) };
  handleMessage(io, s, 'room1', 'xin chào');
  expect(s.emit).not.toHaveBeenCalledWith('chat:error', expect.anything());
  expect(io.to).toHaveBeenCalledWith('room1');
});
