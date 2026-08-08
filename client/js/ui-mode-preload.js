// UI mode (lite | default | pro) — applied before first paint on every page
// so mode-dependent layout is correct on first load, not just in the lobby.
(function() {
  var m;
  try { m = localStorage.getItem('gvn_ui_mode'); } catch (e) { m = null; }
  var mode = (m === 'lite' || m === 'default' || m === 'pro') ? m : 'lite';
  document.documentElement.setAttribute('data-ui-mode', mode);
})();
