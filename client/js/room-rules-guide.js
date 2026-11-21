'use strict';

/**
 * room-rules-guide.js — the "Luật" tab of the room rail (#431): every rule the site offers, in plain words,
 * each with small demo boards. Static content (no server data); the rules this table is playing are only
 * flagged ("Đang dùng") and opened first.
 *
 * Window API: RoomRulesGuide.render(container, { t, active: ['freestyle', 'wall', …] })
 *             RoomRulesGuide.SECTIONS / boardHtml(rows) — exported for tests.
 *
 * Demo board strings (one string per row):
 *   .  empty        x  Black stone      o  White stone     #  wall (Ô khoá)    @  portal (Hố đen)
 *   *  the move being played (ghost Black stone)             1-9  opening stone n (odd = Black, even = White)
 *   +  empty cell the next stone may go in (opening zone)
 * `zones: true` shades the central 3×3 / 5×5 / 7×7 / 9×9 squares (Taraguchi-10).
 */

(function (global) {
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  // tone: ok = the move/line wins, no = it does not win (or is forbidden), info = just an illustration.
  const SECTIONS = [
    {
      id: 'basics', group: 'basics', nameKey: 'guide.basics_name', open: true, points: 5, examples: [],
    },
    {
      id: 'freestyle', group: 'win', nameKey: 'rule.freestyle', points: 2,
      examples: [
        { rows: ['.xxxxx..'], tone: 'ok', cap: 'guide.ex_five_wins' },
        { rows: ['.xxxxxx.'], tone: 'ok', cap: 'guide.ex_six_wins' },
      ],
    },
    {
      id: 'standard', group: 'win', nameKey: 'rule.standard', points: 2,
      examples: [
        { rows: ['.xxxxx..'], tone: 'ok', cap: 'guide.ex_five_wins' },
        { rows: ['.xxxxxx.'], tone: 'no', cap: 'guide.ex_six_goes_on' },
      ],
    },
    {
      id: 'caro', group: 'win', nameKey: 'rule.caro', points: 3,
      examples: [
        { rows: ['oxxxxx..'], tone: 'ok', cap: 'guide.ex_caro_one_end' },
        { rows: ['oxxxxxo.'], tone: 'no', cap: 'guide.ex_caro_two_ends' },
        { rows: ['.xxxxx..'], tone: 'ok', cap: 'guide.ex_caro_edge' },
      ],
    },
    {
      id: 'renju', group: 'win', nameKey: 'rule.renju', points: 5,
      examples: [
        { rows: ['.xxxxx..'], tone: 'ok', cap: 'guide.ex_renju_five' },
        { rows: ['.xxxxxx.'], tone: 'no', cap: 'guide.ex_renju_overline' },
        { rows: ['.oooooo.'], tone: 'ok', cap: 'guide.ex_renju_white_six' },
        {
          rows: ['.......', '...x...', '...x...', '.xx*...', '.......', '.......', '.......'],
          tone: 'no', cap: 'guide.ex_renju_33',
        },
        {
          rows: ['...x...', '...x...', '...x...', 'xxx*...', '.......', '.......', '.......'],
          tone: 'no', cap: 'guide.ex_renju_44',
        },
      ],
    },
    {
      id: 'wall', group: 'variant', nameKey: 'room.rule_wall', points: 2,
      examples: [
        {
          rows: ['.......', '..#....', '...*...', '.......', '.....#.', '.......', '.......'],
          tone: 'info', cap: 'guide.ex_wall_first',
        },
      ],
    },
    {
      id: 'portal', group: 'variant', nameKey: 'room.rule_portal', points: 3,
      examples: [
        { rows: ['xxx@..@xx'], tone: 'ok', cap: 'guide.ex_portal_line' },
      ],
    },
    {
      id: 'swap2', group: 'opening', nameKey: 'guide.swap2_name', points: 4,
      examples: [
        { rows: ['.......', '.......', '..3....', '...12..', '.......', '.......', '.......'], tone: 'info', cap: 'guide.ex_swap2_three' },
        { rows: ['.......', '....5..', '..3....', '...12..', '...4...', '.......', '.......'], tone: 'info', cap: 'guide.ex_swap2_five' },
      ],
    },
    {
      id: 'taraguchi10', group: 'opening', nameKey: 'rule.opening_taraguchi10', points: 5, zones: true,
      examples: [
        {
          rows: ['.........', '.........', '.........', '...3.....', '....1....', '.....2...', '.........', '.........', '.........'],
          tone: 'info', cap: 'guide.ex_tara_zones', zones: true,
        },
      ],
    },
    {
      id: 'yamaguchi', group: 'opening', nameKey: 'rule.opening_yamaguchi', points: 4,
      examples: [
        { rows: ['.......', '.*.....', '..3....', '...12..', '.....*.', '.......', '..*....'], tone: 'info', cap: 'guide.ex_yama_offers' },
      ],
    },
  ];

  const GROUPS = ['basics', 'win', 'variant', 'opening'];

  /** One demo board as HTML (a CSS grid of cells; decorative, the caption carries the meaning). */
  function boardHtml(rows, opts = {}) {
    const n = rows[0].length;
    const mid = (rows.length - 1) / 2; // zone shading is centred on the middle of the diagram
    let cells = '';
    rows.forEach((row, r) => {
      [...row].forEach((ch, c) => {
        let cls = 'rg-c';
        let inner = '';
        if (ch === 'x' || ch === 'o') cls += ` rg-c--${ch}`;
        else if (ch === '#') cls += ' rg-c--wall';
        else if (ch === '@') cls += ' rg-c--portal';
        else if (ch === '*') cls += ' rg-c--ghost';
        else if (ch === '+') cls += ' rg-c--zone';
        else if (/[1-9]/.test(ch)) { cls += ` rg-c--${Number(ch) % 2 ? 'x' : 'o'} rg-c--num`; inner = `<b>${ch}</b>`; }
        if (opts.zones) cls += ` rg-c--z${Math.min(4, Math.max(Math.abs(r - mid), Math.abs(c - (n - 1) / 2)))}`;
        cells += `<span class="${cls}">${inner}</span>`;
      });
    });
    return `<span class="rg-board" style="--rg-cols:${n}" aria-hidden="true">${cells}</span>`;
  }

  function exampleHtml(ex, t) {
    const mark = ex.tone === 'ok' ? '✓' : ex.tone === 'no' ? '✗' : '';
    return `<figure class="rg-ex rg-ex--${ex.tone}">${boardHtml(ex.rows, { zones: ex.zones })}`
      + `<figcaption>${mark ? `<b class="rg-ex__mark" aria-hidden="true">${mark}</b>` : ''}${esc(t(ex.cap))}</figcaption></figure>`;
  }

  /** Body text: lead sentence + numbered/bulleted points, all from i18n (guide.<id>_lead, guide.<id>_p1…pN). */
  function bodyHtml(sec, t) {
    const points = Array.from({ length: sec.points }, (_, i) => t(`guide.${sec.id}_p${i + 1}`));
    const tag = sec.group === 'opening' ? 'ol' : 'ul';
    return `<p class="rg-lead">${esc(t(`guide.${sec.id}_lead`))}</p>`
      + `<${tag} class="rg-points">${points.map((p) => `<li>${esc(p)}</li>`).join('')}</${tag}>`
      + (sec.examples.length ? `<div class="rg-exs">${sec.examples.map((ex) => exampleHtml(ex, t)).join('')}</div>` : '');
  }

  function sectionHtml(sec, t, activeIds) {
    const live = activeIds.includes(sec.id);
    const badge = live ? `<span class="rg-live">${esc(t('guide.in_use'))}</span>` : '';
    return `<details class="rg-sec" data-rule="${sec.id}"${live || sec.open ? ' open' : ''}>`
      + `<summary><span class="rg-sec__name">${esc(t(sec.nameKey))}</span>${badge}</summary>`
      + `<div class="rg-sec__body">${bodyHtml(sec, t)}</div></details>`;
  }

  function render(container, { t, active = [] }) {
    if (!container) return;
    container.innerHTML = GROUPS.map((g) => {
      const secs = SECTIONS.filter((s) => s.group === g);
      return `<section class="rg-group" data-group="${g}"><h3 class="rg-group__t">${esc(t(`guide.group_${g}`))}</h3>`
        + secs.map((s) => sectionHtml(s, t, active)).join('') + '</section>';
    }).join('');
  }

  global.RoomRulesGuide = { SECTIONS, GROUPS, boardHtml, render };
})(typeof window !== 'undefined' ? window : globalThis);
