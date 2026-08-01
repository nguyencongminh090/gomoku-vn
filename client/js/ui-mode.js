'use strict';

/**
 * ui-mode.js — Lite / Default / Pro UI-mode system.
 *
 * The mode lives as `data-ui-mode` on <html> and is persisted at
 * localStorage['gvn_ui_mode']. Every page applies it before first paint via a
 * blocking IIFE in its <head> (modelled on the existing theme script), so this
 * module is only responsible for *changing* the mode. The switcher UI itself
 * lives in the global Settings panel (see settings-panel.js), which calls
 * setUiMode() directly and listens for 'uimodechange' to stay in sync.
 *
 * Exports (on window):
 *   getUiMode()
 *   setUiMode(mode)
 */

(function(global) {
  'use strict';

  const STORAGE_KEY = 'gvn_ui_mode';
  const MODES = ['lite', 'default', 'pro'];

  function getUiMode() {
    const m = document.documentElement.getAttribute('data-ui-mode');
    return MODES.includes(m) ? m : 'default';
  }

  function setUiMode(mode) {
    if (!MODES.includes(mode) || mode === getUiMode()) return;
    document.documentElement.setAttribute('data-ui-mode', mode);
    try { localStorage.setItem(STORAGE_KEY, mode); } catch (e) { /* private mode */ }
    global.dispatchEvent(new CustomEvent('uimodechange', { detail: { mode } }));
  }

  global.getUiMode = getUiMode;
  global.setUiMode = setUiMode;

})(window);
