/**
 * TODO.md #139 / docs/fix-log/*-todo-139-mobile-start-modal-behind-sheet.md
 *
 * On a phone the zen drawer is a bottom sheet (`.panel-right-shell`,
 * `z-index: 700` inside room-zen.css's ≤768px block) that is OPEN before a
 * match starts — that is where the seat and ready controls live. The start
 * modal carries game.css's deliberately low `z-index: 50` (§B36: it must not
 * block the drawer on desktop), so its "Bắt đầu" button — the ONLY
 * `confirmStart` call site in the whole client, i.e. the only way into a
 * match — was rendering underneath the sheet. Measured on a 393×727 phone
 * before the fix: 183 of the card's 210px covered, `elementFromPoint` at the
 * button's centre returned a node inside `.panel-right-shell`, and a real
 * Playwright tap timed out. A phone player could not start a game at all
 * without first discovering the undocumented "tap a rail icon to collapse the
 * sheet" trick.
 *
 * z-index layering is a cascade/stacking-context property; jsdom computes
 * neither, and client/js has no browser-based test runner — so this guards the
 * fix at the level it actually lives at: the stylesheet's own numbers. The
 * live behaviour (real taps at 5 viewports) was verified with Playwright and
 * recorded in docs/todo/B139-*.md; this file is what keeps a future edit from
 * silently re-burying the button.
 *
 * @jest-environment node
 */

'use strict';

const fs = require('fs');
const path = require('path');

const CSS_DIR = path.join(__dirname, '..', 'css');

// Comments are stripped first: both files explain these rules at length, and
// a comment's own braces/selectors would otherwise be parsed as CSS.
const read = (f) => fs.readFileSync(path.join(CSS_DIR, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const roomZen = read('room-zen.css');
const gameCss = read('game.css');

/**
 * Extract the body of room-zen.css's `@media (max-width: 768px)` block by
 * brace-matching from its opening brace — a regex can't do this, and slicing
 * to the next `}` would stop at the first nested rule.
 */
function mobileBlock(css) {
  const at = css.indexOf('@media (max-width: 768px)');
  expect(at).toBeGreaterThan(-1);
  const open = css.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error('unterminated @media (max-width: 768px) block');
}

/** Last `z-index` declared for `selector` inside `block` (last one wins). */
function zIndexOf(block, selector) {
  const rules = [...block.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(m => m[1].split(',').some(s => s.trim() === selector));
  expect(rules.length).toBeGreaterThan(0);
  const values = rules
    .map(m => /z-index:\s*(-?\d+)/.exec(m[2]))
    .filter(Boolean)
    .map(m => Number(m[1]));
  return values.length ? values[values.length - 1] : null;
}

describe('TODO.md #139 — mobile start modal must stay above the bottom sheet', () => {
  const block = mobileBlock(roomZen);

  const SHEET = 'body.zen-room .panel-right-shell';
  const MODAL = 'body.zen-room .start-modal';

  test('the sheet still declares its own z-index in the mobile block', () => {
    // Guards the premise of every assertion below: if the sheet stops setting
    // z-index here, these comparisons would silently test nothing.
    expect(zIndexOf(block, SHEET)).toBe(700);
  });

  test('the start modal is layered ABOVE the sheet on mobile', () => {
    const modalZ = zIndexOf(block, MODAL);
    expect(modalZ).not.toBeNull();
    expect(modalZ).toBeGreaterThan(zIndexOf(block, SHEET));
  });

  test.each([
    ['body.zen-room .quick-chat-bar', 650],
    ['body.zen-room .float-messages', 550],
  ])('the modal also clears the other floating chrome (%s)', (selector, z) => {
    // Read the rung from the stylesheet rather than trusting the literal:
    // if the ladder is renumbered, this compares against the real value.
    const declared = zIndexOf(block, selector);
    if (declared !== null) expect(declared).toBe(z);
    // These are the documented rungs of the mobile z-index ladder; the modal
    // has to outrank all of them, not just the sheet.
    expect(zIndexOf(block, MODAL)).toBeGreaterThan(declared === null ? z : declared);
  });

  test('the overlay is re-anchored to the strip above the sheet', () => {
    // The z-index alone would leave the card sitting ON the sheet, hiding the
    // seat controls it is supposed to leave usable (§B36). The height/inset
    // pair is what keeps them apart when the viewport has room for both.
    const rule = new RegExp(`${MODAL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
    const body = rule.exec(block);
    expect(body).not.toBeNull();
    expect(body[1]).toMatch(/position:\s*fixed/);
    expect(body[1]).toMatch(/--zen-sheet-h/);
    // A collapsed sheet frees more room; the strip must follow it down.
    expect(block).toMatch(/body\.zen-room\.zen-drawer-collapsed \.start-modal\s*\{[^}]*--zen-bar-h/);
  });

  test('§B36 stays intact: the overlay itself never catches clicks', () => {
    // Raising the modal would turn it into a full-screen click trap if this
    // regressed — the whole overlay spans the strip, and only the card is
    // meant to be interactive.
    expect(/\.start-modal\s*\{[^}]*pointer-events:\s*none/.test(gameCss)).toBe(true);
    expect(/\.start-modal__card\s*\{[^}]*pointer-events:\s*auto/.test(gameCss)).toBe(true);
    // The mobile override must not undo it.
    const body = new RegExp(`${MODAL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(block);
    expect(body[1]).not.toMatch(/pointer-events/);
  });

  test('desktop layering is untouched — the fix is mobile-only', () => {
    // Outside the media query the modal keeps game.css's low z-index, so the
    // desktop side drawer stays clickable next to it.
    expect(/\.start-modal\s*\{[^}]*z-index:\s*50/.test(gameCss)).toBe(true);
    const outsideMobile = roomZen.replace(block, '');
    expect(/body\.zen-room \.start-modal\s*\{[^}]*z-index/.test(outsideMobile)).toBe(false);
  });
});
