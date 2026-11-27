// Puzzle redesign mockups — fixture + real BoardRenderer/PuzzleBoard + view switcher (#solve, #list, #mine, #editor).
(function () {
  const S = (x, y, color) => ({ x, y, color });
  const SOLVE = {
    boardSize: 15, toMove: 'BLACK',
    stones: [S(7, 7, 'BLACK'), S(8, 7, 'BLACK'), S(9, 7, 'BLACK'), S(6, 8, 'WHITE'), S(7, 9, 'WHITE'), S(8, 9, 'WHITE'), S(9, 10, 'WHITE'), S(5, 6, 'BLACK'), S(10, 8, 'WHITE')],
  };
  const EDIT = { boardSize: 15, stones: [S(7, 7, 'BLACK'), S(8, 8, 'WHITE'), S(6, 6, 'BLACK'), S(9, 9, 'WHITE'), S(7, 6, 'BLACK')], last: { x: 7, y: 6 } };

  function board(canvasId, data, opts) {
    const c = document.getElementById(canvasId);
    if (!c || !window.BoardRenderer) return;
    const r = new window.BoardRenderer(c, { boardSize: data.boardSize, clickMode: 'single' });
    const draw = () => {
      const st = window.PuzzleBoard.state(data.boardSize, data.stones, data.toMove || 'BLACK', [], { interactive: !!(opts && opts.interactive) });
      st.lastMove = (opts && opts.last) || data.last || null;
      r.resize(); r.setState(st);
    };
    requestAnimationFrame(draw);
    addEventListener('resize', draw);
    document.addEventListener('mock:view', draw);
  }

  function views() {
    const show = () => {
      const v = (location.hash || '#solve').slice(1);
      document.querySelectorAll('[data-view]').forEach((n) => { n.hidden = n.dataset.view !== v; });
      document.querySelectorAll('.mock-nav a').forEach((a) => a.setAttribute('aria-current', a.getAttribute('href') === '#' + v ? 'page' : 'false'));
      document.dispatchEvent(new Event('mock:view'));
    };
    addEventListener('hashchange', show);
    show();
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (window.PlatformShell) window.PlatformShell.build('learn');
    views();
    board('solve-canvas', SOLVE, { interactive: false });
    board('edit-canvas', EDIT, { interactive: true });
    // Demo of the solved/unlocked state toggle in the solve view.
    document.querySelectorAll('[data-demo-state]').forEach((b) => b.addEventListener('click', () => {
      const root = b.closest('[data-view]');
      root.dataset.state = b.dataset.demoState;
      root.querySelectorAll('[data-demo-state]').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    }));
  });
})();
