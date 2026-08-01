'use strict';

/**
 * escape-utils.test.js — Unit tests for client/js/escape-utils.js.
 *
 * The module is a pure-string UMD module with no DOM dependency, so it is
 * require()-able and testable straight from Node — no jsdom needed. Same
 * arrangement as profanity-filter.test.js, which also tests a client/js
 * module from the server-side Jest suite.
 */

const { escapeAttr, escapeJsString, decodeChatText } = require('../../client/js/escape-utils');

describe('escapeAttr — HTML attribute context', () => {
  test('a double quote can no longer terminate the attribute it sits in', () => {
    // The old implementation produced `\"`, which an HTML parser reads as a
    // backslash followed by a real attribute-closing quote.
    const out = escapeAttr('x" onerror="alert(1)');
    expect(out).not.toContain('"');
    expect(out).toBe('x&quot; onerror=&quot;alert(1)');
  });

  test('a single quote is escaped as an entity, not a backslash', () => {
    const out = escapeAttr("x' onerror='alert(1)");
    expect(out).not.toContain("'");
    expect(out).toBe('x&#39; onerror=&#39;alert(1)');
  });

  test('& is escaped first so existing entities are not double-decoded', () => {
    expect(escapeAttr('&quot;')).toBe('&amp;quot;');
    expect(escapeAttr('a&b')).toBe('a&amp;b');
  });

  test('angle brackets are escaped too', () => {
    expect(escapeAttr('<img src=x>')).toBe('&lt;img src=x&gt;');
  });

  test('the values actually passed today (server-generated ids) are unchanged', () => {
    expect(escapeAttr('a3f9c2e1-4b7d-4f2a-9c1e-8d6b5a4f3e2d'))
      .toBe('a3f9c2e1-4b7d-4f2a-9c1e-8d6b5a4f3e2d');
    expect(escapeAttr('guest_1a2b3c')).toBe('guest_1a2b3c');
  });

  test('non-string input is coerced, not crashed on', () => {
    expect(escapeAttr(42)).toBe('42');
    expect(escapeAttr(null)).toBe('null');
    expect(escapeAttr(undefined)).toBe('undefined');
  });
});

describe('escapeJsString — JavaScript string-literal context', () => {
  test('a single quote cannot close the literal', () => {
    expect(escapeJsString("x'); alert(1); //")).toBe("x\\'); alert(1); //");
  });

  test('backslashes are escaped first, so an escape cannot be re-escaped away', () => {
    // Without the leading \\ pass, input `\'` would become `\\'` — a literal
    // backslash followed by a live, string-closing quote.
    expect(escapeJsString("a\\'b")).toBe("a\\\\\\'b");
  });

  test('line terminators are escaped (a raw newline is illegal in a JS literal)', () => {
    expect(escapeJsString('a\nb')).toBe('a\\nb');
    expect(escapeJsString('a\r\nb')).toBe('a\\r\\nb');
    expect(escapeJsString('a\u2028b')).toBe('a\\u2028b');
    expect(escapeJsString('a\u2029b')).toBe('a\\u2029b');
  });
});

describe('nested context — a JS literal inside an inline handler attribute', () => {
  /**
   * Mirrors the two real call sites:
   *   lobby.js   onclick="joinRoom('${escapeAttr(escapeJsString(roomId))}')"
   *   room-ui.js onclick="kickUser('${escapeAttr(escapeJsString(userId))}')"
   *
   * Decodes the attribute value the way an HTML parser would (entities first),
   * yielding the JS source the engine actually sees.
   */
  function attrDecode(str) {
    return str
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  function jsSourceFor(raw) {
    return `joinRoom('${attrDecode(escapeAttr(escapeJsString(raw)))}')`;
  }

  test('a quote-breakout payload stays inside the string literal', () => {
    const src = jsSourceFor("x'); alert(1); //");
    expect(src).toBe("joinRoom('x\\'); alert(1); //')");
    // Every quote after the opening one is backslash-escaped until the final
    // closing quote — no statement break, so nothing executes.
    expect(src).not.toMatch(/[^\\]'\s*\)\s*;/);
  });

  test('escapeAttr alone would NOT be safe here — this is why both are applied', () => {
    // Documents the trap the combined form avoids: entity-escaping alone gets
    // decoded back into a live quote before the JS is parsed.
    const attrOnly = `joinRoom('${attrDecode(escapeAttr("x'); alert(1); //"))}')`;
    expect(attrOnly).toBe("joinRoom('x'); alert(1); //')");
  });

  test('an attribute-breakout payload cannot escape the attribute either', () => {
    const encoded = escapeAttr(escapeJsString('x" onmouseover="alert(1)'));
    expect(encoded).not.toContain('"');
  });

  test('a normal server-generated id round-trips to exactly itself', () => {
    const id = 'a3f9c2e1-4b7d-4f2a-9c1e-8d6b5a4f3e2d';
    expect(jsSourceFor(id)).toBe(`joinRoom('${id}')`);
  });
});

// ── Chat display decode (TODO #15, follow-up of the #13 decision) ──────────

describe('decodeChatText — rendering server-escaped chat into a text node', () => {
  // ChatHandler.sanitize() is the other half of this pair; these assert the
  // round trip, so the two cannot drift apart silently.
  const { sanitize } = require('../managers/ChatHandler');

  test('shows the sender what they actually typed', () => {
    expect(decodeChatText('&lt;b&gt;bold&lt;/b&gt;')).toBe('<b>bold</b>');
  });

  test('round-trips the review\'s repro string back to the original', () => {
    const typed = '<img src=x onerror=alert(1)';
    expect(decodeChatText(sanitize(typed))).toBe(typed);
  });

  test('round-trips ordinary text unchanged', () => {
    for (const typed of ['xin chào', 'R&D & co', 'a < b > c', '5 > 3 và 2 < 4']) {
      expect(decodeChatText(sanitize(typed))).toBe(typed);
    }
  });

  test('does not decode &amp;, which the server never produces', () => {
    // The server leaves `&` alone so "R&D" survives, so a literal "&amp;" in a
    // message is something the sender typed and must stay visible as typed.
    expect(decodeChatText('R&amp;D')).toBe('R&amp;D');
  });

  test('non-string input is coerced, not crashed on', () => {
    expect(decodeChatText(null)).toBe('null');
    expect(decodeChatText(42)).toBe('42');
  });

  test('the wire format itself stays escaped — this only changes rendering', () => {
    // Guards the point of the #13 decision: the payload leaving the server is
    // still inert for any future consumer that renders it as HTML.
    const onTheWire = sanitize('<script>alert(1)</script>');
    expect(onTheWire).not.toContain('<');
    expect(decodeChatText(onTheWire)).toContain('<');
  });
});
