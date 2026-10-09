// Skin (arena | zen | bento) + colour mode (dark | light) — applied before first paint on every page.
// Cookie first (readable server-side later), localStorage as fallback.
(function() {
  function read(cookieRe, storageKey, ok) {
    var v = null;
    try { var c = document.cookie.match(cookieRe); v = c && c[1]; } catch (e) { v = null; }
    if (!v) { try { v = localStorage.getItem(storageKey); } catch (e) { v = null; } }
    return ok.indexOf(v) >= 0 ? v : ok[0];
  }
  var r = document.documentElement;
  r.setAttribute('data-skin', read(/(?:^|; )gvn_skin=([a-z]+)/, 'gvn_skin', ['arena', 'zen', 'bento']));
  r.setAttribute('data-mode', read(/(?:^|; )gvn_mode=([a-z]+)/, 'gvn_color_mode', ['dark', 'light']));
})();
