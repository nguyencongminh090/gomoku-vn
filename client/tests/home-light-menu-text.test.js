/**
 * ui-audit 2026-11-18 (F1/F3/F4) — phone Home (#418), light mode.
 * F1: #418 sets `.pnav` text white over the photo; `.pnav a { color: inherit }` (0,1,1) beats
 *     `.pnav__item { color }` (0,1,0), so the account-menu links were white on the white menu.
 *     The popups inside .pnav must set their own text colour.
 * F3: the hero is a stacking context, so the #qm-pick sheet sat under the fixed tab bar.
 * F4: the news card's padding-right lost to the shared card rule (:not([hidden]) specificity).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'css', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (css, sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\>:]/g, '\\$&');
  const all = [...css.matchAll(new RegExp('(^|[}\\s])' + esc + '\\s*\\{([^}]*)\\}', 'g'))]; // the selector's own rules, not a selector list
  return all.length ? all.map((m) => m[2]).join(';') : null;
};

describe('phone Home light-mode text (ui-audit 2026-11-18)', () => {
  const shell = read('platform-shell.css');
  const hero = read('home-hero.css');

  it.each(['.pnav__menu', '.pbell__panel'])('%s sets its own text colour (does not inherit the white nav)', (sel) => {
    expect(rule(shell, sel)).toMatch(/(^|;)\s*color:\s*var\(--c-ink\)/);
  });

  it('home-hero still whitens .pnav (the reason the popups need their own colour)', () => {
    expect(hero).toMatch(/body\.zen-lobby\.is-home \.pnav \{[^}]*color: var\(--hh-on-photo\)/);
  });

  it('lifts the hero above the fixed tab bar while the #qm-pick sheet is open', () => {
    const tab = shell.match(/\.ptabbar \{[^}]*z-index:\s*(\d+)/);
    const lift = hero.match(/\.hq-main:has\(> \.hq-menu:not\(\[hidden\]\)\) \{\s*z-index:\s*(\d+)/);
    expect(lift).not.toBeNull();
    expect(Number(lift[1])).toBeGreaterThan(Number(tab[1]));
  });

  it('news card padding-right uses the same :not([hidden]) selector as the shared card rule', () => {
    expect(rule(hero, 'body.zen-lobby #screen-home > .hnews:not([hidden])')).toMatch(/padding-right:\s*16px/);
  });
});
