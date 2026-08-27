// UI mode (lite | default) — applied before first paint on every page
// so mode-dependent layout is correct on first load, not just in the lobby.
(function() {
  var m;
  try { m = localStorage.getItem('gvn_ui_mode'); } catch (e) { m = null; }
  if (m === 'pro') {
    // B161: Pro removed. Migrate a stored 'pro' to 'default' (the mode Pro's
    // extra detail folded into) once, so getUiMode()'s whitelist fallback
    // doesn't silently drop these users down to 'lite'.
    m = 'default';
    try { localStorage.setItem('gvn_ui_mode', 'default'); } catch (e) { /* private mode */ }
  }
  var mode = (m === 'lite' || m === 'default') ? m : 'lite';
  document.documentElement.setAttribute('data-ui-mode', mode);
})();
