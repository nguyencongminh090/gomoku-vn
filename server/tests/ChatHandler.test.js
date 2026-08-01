'use strict';

/**
 * ChatHandler.test.js — Unit tests for chat message sanitization.
 *
 * Focus: `sanitize()` escapes HTML markup instead of stripping tags, so an
 * unterminated tag (the review's repro: `<img src=x onerror=alert(1)`) can no
 * longer survive intact. The profanity filter is mocked to a pass-through so
 * these tests exercise sanitization only — profanity has its own suite in
 * profanity-filter.test.js.
 */

jest.mock('../../client/js/profanity-filter', () => ({
  filterMessage: jest.fn(text => text),
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const { sanitize, handleMessage, cleanupUser } = require('../managers/ChatHandler');

describe('ChatHandler.sanitize — escapes markup instead of stripping tags', () => {
  test('the review repro (unterminated tag) no longer passes through intact', () => {
    const out = sanitize('<img src=x onerror=alert(1)');
    // The old strip regex required a closing '>', so this string came out
    // byte-for-byte unchanged — a live tag for any HTML-rendering consumer.
    expect(out).not.toContain('<');
    expect(out).toBe('&lt;img src=x onerror=alert(1)');
  });

  test('a well-formed tag is escaped, not deleted', () => {
    expect(sanitize('<b>hi</b>')).toBe('&lt;b&gt;hi&lt;/b&gt;');
  });

  test('a full unterminated script payload is fully neutralized', () => {
    const out = sanitize('<script>alert(1)</script');
    expect(out).toBe('&lt;script&gt;alert(1)&lt;/script');
    expect(out).not.toMatch(/<[^>]*$/);
  });

  test('every angle bracket is escaped, not just the first', () => {
    expect(sanitize('a < b > c < d')).toBe('a &lt; b &gt; c &lt; d');
  });

  test('text content between tags is preserved (the strip regex threw it away with the tag)', () => {
    expect(sanitize('<div>quan trọng</div>')).toBe('&lt;div&gt;quan trọng&lt;/div&gt;');
  });

  test('& is left alone so ordinary text renders correctly under textContent', () => {
    expect(sanitize('R&D & co')).toBe('R&D & co');
  });

  test('a clean message is unchanged apart from trimming', () => {
    expect(sanitize('  xin chào  ')).toBe('xin chào');
  });

  test('non-string input yields an empty string', () => {
    expect(sanitize(null)).toBe('');
    expect(sanitize(undefined)).toBe('');
    expect(sanitize(42)).toBe('');
    expect(sanitize({})).toBe('');
  });
});

describe('ChatHandler.handleMessage — broadcasts the escaped text', () => {
  function makeIo() {
    const io = {
      _emitted: [],
      to: jest.fn(room => ({
        emit: jest.fn((event, data) => io._emitted.push({ room, event, data })),
      })),
    };
    return io;
  }

  function makeSocket(userId = 'u1') {
    return {
      user: { userId, displayName: 'Alice' },
      emit: jest.fn(),
    };
  }

  afterEach(() => {
    cleanupUser('u1');
    cleanupUser('u2');
  });

  test('a markup payload reaches other room members escaped', () => {
    const io = makeIo();
    const socket = makeSocket('u1');

    handleMessage(io, socket, 'room1', '<img src=x onerror=alert(1)');

    expect(io._emitted).toHaveLength(1);
    const { room, event, data } = io._emitted[0];
    expect(room).toBe('room1');
    expect(event).toBe('chat:message');
    expect(data.text).toBe('&lt;img src=x onerror=alert(1)');
  });

  test('a message that is only markup is still delivered (escaping leaves content behind)', () => {
    const io = makeIo();
    const socket = makeSocket('u2');

    // Under the old strip regex this became '' and was silently dropped.
    handleMessage(io, socket, 'room1', '<b></b>');

    expect(io._emitted).toHaveLength(1);
    expect(io._emitted[0].data.text).toBe('&lt;b&gt;&lt;/b&gt;');
  });

  test('an empty message is still ignored', () => {
    const io = makeIo();
    const socket = makeSocket('u1');

    handleMessage(io, socket, 'room1', '   ');

    expect(io._emitted).toHaveLength(0);
  });
});
