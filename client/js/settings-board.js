/**
 * settings-board.js — Settings › Giao diện › Bàn cờ (TODO.md #216).
 *
 * The ONLY editor of the shared board look (window.BoardPrefs, board.js): style
 * (paper X/O or stones), palette presets, custom colours, piece style,
 * coordinates, last-move / move-number marks, with a live preview. Every board
 * page follows the same store live.
 *
 * Contrast is checked quietly: nothing about WCAG is shown in the form; when a
 * change leaves a colour below WCAG 2.2 AA on its background, one toast names
 * it and offers the nearest passing colour.
 *
 * mount(host) builds the section once and keeps it; settings-page.js re-appends
 * the same node on every re-render so the preview renderer is not rebuilt.
 */
(function () {
  const t = (key, vars) => (typeof window.t === 'function' ? window.t(key, vars) : key);

  // A short, recognisable position for the preview (black X first).
  const SAMPLE = [[7, 7], [8, 8], [8, 6], [6, 8], [9, 5], [10, 4], [7, 6], [7, 5], [6, 6], [5, 6], [9, 6], [10, 6], [8, 7]];
  const N = 15;

  let section = null;
  let controls = null;
  let preview = null;
  let toast = null;

  function el(tag, text, cls) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }

  function segment(options, active, onPick, label) {
    const wrap = el('div', undefined, 'pseg');
    wrap.setAttribute('role', 'group');
    if (label) wrap.setAttribute('aria-label', label);
    for (const [value, text] of options) {
      const b = el('button', text, 'pseg__opt' + (value === active ? ' is-active' : ''));
      b.type = 'button';
      b.setAttribute('aria-pressed', String(value === active));
      b.addEventListener('click', () => onPick(value));
      wrap.appendChild(b);
    }
    return wrap;
  }

  function field(label, control) {
    const f = el('div', undefined, 'pboard__field');
    const h = el('div', label, 'pboard__label');
    f.append(h, control);
    return f;
  }

  function switchRow(label, checked, onChange) {
    const row = el('label', undefined, 'pboard__check');
    const i = document.createElement('input');
    i.type = 'checkbox';
    i.checked = checked;
    i.addEventListener('change', () => onChange(i.checked));
    const sw = el('span', undefined, 'pswitch');
    sw.append(i, el('span'));
    row.append(el('span', label), sw);
    return row;
  }

  function sampleBoard() {
    const b = Array.from({ length: N }, () => Array(N).fill(0));
    SAMPLE.forEach(([x, y], i) => { b[y][x] = i % 2 ? 2 : 1; });
    const [lx, ly] = SAMPLE[SAMPLE.length - 1];
    return { board: b, lastMove: { x: lx, y: ly }, moveHistory: SAMPLE.map(([x, y]) => ({ x, y })) };
  }

  // Apply a change, then check it quietly.
  function change(patch) {
    const s = window.BoardPrefs.set(patch);
    checkContrast(s);
    renderControls();
  }

  function checkContrast(s) {
    const probs = window.BoardPrefs.problems(s);
    if (!probs.length) { hideToast(); return; }
    const p = probs[0];
    toast.replaceChildren();
    const body = el('div');
    body.append(el('b', t('board.wcag_title', { what: t('board.what_' + p.what) })),
      el('p', t('board.wcag_body', { ratio: p.ratio.toFixed(1), min: p.min })));
    const actions = el('div', undefined, 'pboard__toast-actions');
    if (p.suggestion) {
      const apply = el('button', undefined, 'pbtn pbtn--primary');
      apply.type = 'button';
      const chip = el('i', undefined, 'pboard__chip');
      chip.style.background = p.suggestion;
      apply.append(chip, el('span', t('board.wcag_apply')));
      apply.addEventListener('click', () => {
        const [theme, key] = p.key.split('.');
        change({ [theme]: { [key]: p.suggestion } });
      });
      actions.append(apply);
    }
    const keep = el('button', t('board.wcag_keep'), 'pbtn pbtn--ghost');
    keep.type = 'button';
    keep.addEventListener('click', hideToast);
    actions.append(keep);
    body.append(actions);
    toast.append(body);
    toast.hidden = false;
  }

  function hideToast() { if (toast) toast.hidden = true; }

  function renderControls() {
    const s = window.BoardPrefs.get();
    const theme = s.theme;
    const presets = window.BoardPrefs.PRESETS[theme];
    const presetKey = theme + 'Preset';

    const sw = el('div', undefined, 'pboard__swatches');
    sw.setAttribute('role', 'group');
    sw.setAttribute('aria-label', t('board.palette'));
    for (const p of presets) {
      const b = el('button', undefined, 'pboard__swatch' + (s[presetKey] === p.id ? ' is-active' : ''));
      b.type = 'button';
      b.setAttribute('aria-pressed', String(s[presetKey] === p.id));
      b.title = t('board.preset_' + p.id);
      b.innerHTML = window.boardPreviewSvg(theme, p); // static SVG built from our own constant colours
      b.appendChild(el('span', t('board.preset_' + p.id)));
      b.addEventListener('click', () => change({ [presetKey]: p.id }));
      sw.appendChild(b);
    }

    const colorKeys = theme === 'paper'
      ? [['bg', 'board.color_bg'], ['grid', 'board.color_grid'], ['xColor', 'board.color_x'], ['oColor', 'board.color_o']]
      : [['bg', 'board.color_bg'], ['line', 'board.color_line']];
    const colors = el('div', undefined, 'pboard__colors');
    for (const [k, label] of colorKeys) {
      const lab = el('label', undefined, 'pboard__color');
      const input = document.createElement('input');
      input.type = 'color';
      input.value = s[theme][k];
      // `change` (not `input`): one store write + one contrast check per pick, not per drag step.
      input.addEventListener('change', () => change({ [theme]: { [k]: input.value } }));
      lab.append(input, el('span', t(label)));
      colors.appendChild(lab);
    }

    const styles = theme === 'paper' ? window.BoardPrefs.PAPER_STYLES : window.BoardPrefs.STONE_STYLES;

    controls.replaceChildren(
      field(t('board.theme'), segment([['paper', t('board.theme_paper')], ['stone', t('board.theme_stone')]], theme,
        (v) => change({ theme: v }), t('board.theme'))),
      field(t('board.palette') + (s[presetKey] === 'custom' ? ' · ' + t('board.custom') : ''), sw),
      field(t('board.custom_colors'), colors),
      field(t('board.piece_style'), segment(styles.map(v => [v, t('board.style_' + v)]), s[theme].style,
        (v) => change({ [theme]: { style: v } }), t('board.piece_style'))),
      field(t('board.coords'), segment([['edge', t('board.coords_edge')], ['cell', t('board.coords_cell')]], s.coords,
        (v) => change({ coords: v }), t('board.coords'))),
      switchRow(t('board.last_move'), s.showLastMove, (on) => change({ showLastMove: on })),
      switchRow(t('board.move_numbers'), s.showMoveNumbers, (on) => change({ showMoveNumbers: on })),
      (() => {
        const r = el('button', t('board.reset'), 'pbtn pbtn--ghost pboard__reset');
        r.type = 'button';
        r.addEventListener('click', () => { window.BoardPrefs.reset(); hideToast(); renderControls(); });
        return r;
      })(),
    );
  }

  function mount(host) {
    if (!window.BoardPrefs || !window.BoardRenderer) return;
    if (!section) {
      section = el('section', undefined, 'pboard');
      section.setAttribute('aria-labelledby', 'pboard-h');
      const h = el('h2', t('board.section'), 'ph2 ph2--gap');
      h.id = 'pboard-h';
      const grid = el('div', undefined, 'pboard__grid');
      controls = el('div', undefined, 'pboard__controls');
      const aside = el('div', undefined, 'pboard__preview');
      const wrap = el('div', undefined, 'pboard__board');
      const svgHost = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      wrap.appendChild(svgHost);
      aside.append(wrap, el('p', t('board.preview_note')));
      aside.setAttribute('aria-label', t('board.preview'));
      grid.append(controls, aside);
      toast = el('div', undefined, 'pboard__toast');
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      toast.hidden = true;
      section.append(h, grid, toast);
      host.appendChild(section);
      preview = new window.BoardRenderer(svgHost, { boardSize: N });
      preview.setState(sampleBoard());
      preview.resize();
      // Another tab (or reset) changed the look → keep the form in sync.
      window.addEventListener('boardprefschange', () => renderControls());
    } else {
      host.appendChild(section);
      preview.resize();
    }
    renderControls();
  }

  window.SettingsBoard = { mount };
})();
