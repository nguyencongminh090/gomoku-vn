'use strict';

/**
 * escape-utils.js — Context-correct escaping helpers for interpolated markup.
 *
 * UMD-style module, same pattern as profanity-filter.js: `require()`-able from
 * Node (so it is unit-testable without a DOM) and side-effect `import`-able in
 * the browser, where it attaches to `globalThis.EscapeUtils`.
 *
 * These are pure string functions — no DOM — which is exactly why they live
 * here instead of inline in lobby.js / room-ui.js: it makes them testable from
 * the existing Node/Jest setup, with no jsdom.
 *
 * Two different contexts, two different functions. Picking the wrong one is
 * itself the vulnerability:
 *
 *   escapeAttr      → for an HTML attribute value:  class="${escapeAttr(x)}"
 *   escapeJsString  → for a JS string literal, and ALWAYS wrapped in
 *                     escapeAttr when that literal sits inside an inline
 *                     handler attribute:  onclick="f('${escapeAttr(escapeJsString(x))}')"
 *
 * Do not use escapeAttr alone inside an inline handler. The HTML parser
 * decodes entities in the attribute value *before* the JavaScript is parsed,
 * so a lone `&#39;` becomes a real `'` in the JS source and closes the string
 * literal early — the exact injection the escaping was meant to prevent.
 *
 * As of B65 (CSP hardening) the codebase no longer has any inline
 * `onclick="..."` handlers — see js/action-delegate.js, which dispatches
 * data-action/data-arg attributes instead. Plain HTML attribute values
 * (data-arg="${escapeAttr(x)}") only need escapeAttr; escapeJsString stays
 * here as the correct tool if an inline-handler-attribute pattern is ever
 * reintroduced, but has no current call site.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.EscapeUtils = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  /**
   * Escape a value for interpolation into an HTML attribute value.
   *
   * Replaces the previous implementation, which backslash-escaped quotes
   * (`\"` / `\'`). Backslashes mean nothing to an HTML parser: `\"` inside a
   * double-quoted attribute still terminates that attribute, letting the rest
   * of the value be read as further attributes (e.g. an `onerror=` handler).
   * Entities are what actually neutralize a quote in this context.
   *
   * @param {*} str
   * @returns {string}
   */
  function escapeAttr(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Escape a value for interpolation into a single- or double-quoted
   * JavaScript string literal.
   *
   * Backslash-escaping is correct *here* — this is the JS-source context, not
   * the HTML one. `\` goes first so the escapes this function adds are not
   * themselves re-escaped. Line terminators are escaped because a raw newline
   * is not legal inside a JS string literal.
   *
   * @param {*} str
   * @returns {string}
   */
  function escapeJsString(str) {
    return String(str)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
  }

  /**
   * Turn the server's escaped chat text back into the characters the sender
   * actually typed, for rendering into a text node.
   *
   * ChatHandler.sanitize() escapes `<` and `>` on the way out, so the payload
   * on the wire is inert for any consumer that ever renders it as HTML. The
   * chat UI does not: it assigns to `textContent`, which shows the escaped form
   * verbatim — someone typing `<b>bold</b>` saw `&lt;b&gt;bold&lt;/b&gt;`.
   *
   * Reversing exactly those two entities immediately before writing to a text
   * node is safe, and is not a hole in the escaping: `textContent` never parses
   * its input as markup, so the result is displayed, not interpreted. The value
   * must not be handed to `innerHTML` afterwards — that is what the escaped
   * form is for.
   *
   * `&amp;` is deliberately NOT decoded: the server never produces it (it
   * leaves `&` alone so ordinary text like "R&D" survives), so a literal
   * "&amp;" in a message is something the sender actually typed.
   *
   * @param {*} str
   * @returns {string}
   */
  function decodeChatText(str) {
    return String(str)
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }

  return {
    escapeAttr: escapeAttr,
    escapeJsString: escapeJsString,
    decodeChatText: decodeChatText,
  };
});
