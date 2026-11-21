'use strict';

/**
 * renju-opening-ui.js — the Taraguchi-10 / Yamaguchi opening step as the room and the tournament
 * match show it (TODO.md #427). One source for both pages: which clicks place, the green zone,
 * the hint text and the choice buttons. State = `gameState.swap2` from GameEngine.serialize()
 * (RenjuOpening.describe adds rule / step / stoneColor / zone / offers / offerN / choices / maxN).
 *
 * Buttons carry data-action="swap2Choose" data-arg="stay|swap|offer" and data-action="rxDeclare"
 * (the room wires them through action-delegate.js; the tournament page binds them itself).
 * UMD, DOM-free.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RenjuOpeningUI = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const RULES = ['taraguchi10', 'yamaguchi'];

  /** Is this a Renju opening (not Swap2) still running? */
  function active(swap2) {
    return !!(swap2 && swap2.enabled && RULES.includes(swap2.rule) && swap2.openingPhase !== 'play' && swap2.step);
  }

  /** Does a board click act now (place a stone, offer a 5th, pick an offer)? */
  function clickActs(swap2) {
    return active(swap2) && (swap2.step === 'place' || swap2.step === 'offer' || swap2.step === 'pick');
  }

  /** Cells of the central (2*zone+1) square, for the board's green zone. */
  function zoneCells(size, zone) {
    if (zone === null || zone === undefined) return [];
    const c = Math.floor(size / 2);
    const out = [];
    for (let y = c - zone; y <= c + zone; y++) for (let x = c - zone; x <= c + zone; x++) out.push({ x, y });
    return out;
  }

  /** Stone colour for the hover preview ('BLACK' | 'WHITE' | null). */
  function previewColor(swap2) {
    return active(swap2) && (swap2.step === 'place' || swap2.step === 'offer') ? swap2.stoneColor : null;
  }

  /** The colour `userId` holds right now (tentative), or null for a viewer. */
  function heldColor(swap2, userId) {
    if (!swap2 || !userId) return null;
    if (userId === swap2.tentativeBlackId) return 'BLACK';
    if (userId === swap2.firstPlayerId || userId === swap2.secondPlayerId) return 'WHITE';
    return null;
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  /**
   * Hint + buttons for the current step.
   * @param {object} swap2
   * @param {{ mine: boolean, userId: string, t: Function }} ctx
   */
  function controlsHtml(swap2, ctx) {
    const { t, mine } = ctx;
    if (!active(swap2)) return '';
    const colorName = (c) => t(c === 'BLACK' ? 'game.rx_black' : 'game.rx_white');
    const hint = (text) => `<div class="swap2-hint">${esc(text)}</div>`;
    const btn = (arg, key) => `<button class="btn-game" type="button" data-action="swap2Choose" data-arg="${arg}">${esc(t(key))}</button>`;
    const offers = (swap2.offers || []).length;
    const held = heldColor(swap2, ctx.userId);
    const holdLine = held ? `<div class="swap2-hint swap2-hint--sub">${esc(t('game.rx_you_hold', { color: colorName(held) }))}</div>` : '';

    if (!mine) {
      return hint(t('game.rx_wait_' + swap2.step, { done: offers, n: swap2.offerN || '' })) + holdLine;
    }
    switch (swap2.step) {
      case 'place': {
        if (swap2.zone === 0) return hint(t('game.rx_place_centre')) + holdLine;
        if (swap2.zone === null || swap2.zone === undefined) return hint(t('game.rx_place_any', { color: colorName(swap2.stoneColor) })) + holdLine;
        return hint(t('game.rx_place_zone', { color: colorName(swap2.stoneColor), size: 2 * swap2.zone + 1 })) + holdLine;
      }
      case 'offer': return hint(t('game.rx_offer', { done: offers, n: swap2.offerN })) + holdLine;
      case 'pick': return hint(t('game.rx_pick')) + holdLine;
      case 'swap':
        return hint(t('game.rx_swap_prompt')) + holdLine
          + `<div class="swap2-choice">${btn('stay', 'game.rx_stay')}${btn('swap', 'game.rx_swap')}</div>`;
      case 'choice':
        return hint(t('game.rx_choice_prompt')) + holdLine
          + `<div class="swap2-choice">${btn('stay', 'game.rx_choice_stay')}${btn('swap', 'game.rx_choice_swap')}${btn('offer', 'game.rx_choice_offer')}</div>`;
      case 'declare': {
        const max = swap2.maxN || 10;
        const opts = Array.from({ length: max }, (_, i) => `<option value="${i + 1}"${i === 1 ? ' selected' : ''}>${i + 1}</option>`).join('');
        return hint(t('game.rx_declare_prompt'))
          + `<div class="swap2-choice"><select class="rx-declare-n" aria-label="${esc(t('game.rx_declare_prompt'))}">${opts}</select>`
          + `<button class="btn-game" type="button" data-action="rxDeclare">${esc(t('game.rx_declare_btn'))}</button></div>`;
      }
      default: return '';
    }
  }

  return { RULES, active, clickActs, zoneCells, previewColor, heldColor, controlsHtml };
}));
