// Colour mode (dark | light) + skin — applied before first paint on every page.
// Cookie first (readable server-side later), localStorage as fallback.
(function() {
  var m = null;
  try { var c = document.cookie.match(/(?:^|; )gvn_mode=(light|dark)/); m = c && c[1]; } catch (e) { m = null; }
  if (!m) { try { m = localStorage.getItem('gvn_color_mode'); } catch (e) { m = null; } }
  var r = document.documentElement;
  r.setAttribute('data-skin', 'arena');
  r.setAttribute('data-mode', m === 'light' ? 'light' : 'dark');
})();
