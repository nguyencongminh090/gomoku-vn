'use strict';

/**
 * ui-mode.js — Lite / Default UI-mode system.
 *
 * The mode lives as `data-ui-mode` on <html> and is persisted at
 * localStorage['gvn_ui_mode']. Every page applies it before first paint via a
 * blocking IIFE in its <head> (modelled on the existing theme script), so this
 * module is only responsible for *changing* the mode. The switcher UI itself
 * lives in the global Settings panel (see settings-panel.js), which calls
 * setUiMode() directly and listens for 'uimodechange' to stay in sync.
 *
 * A third mode 'pro' was removed (B161): its extra-detail affordances either
 * folded into Default or were dropped. Anyone who still has 'pro' stored is
 * normalised to 'default' (not the 'lite' whitelist-fallback) — see
 * normalizeMode() here and the one-time rewrite in ui-mode-preload.js.
 *
 * getUiMode() is the single source of truth for the resolved mode value —
 * lobby.js / room-ui.js / history.js delegate to it rather than re-reading the
 * attribute themselves.
 *
 * Exports (on window):
 *   getUiMode()
 *   setUiMode(mode)
 */

(function(global) {
  'use strict';

  const STORAGE_KEY = 'gvn_ui_mode';
  const MODES = ['lite', 'default'];

  function normalizeMode(m) {
    if (m === 'pro') return 'default'; // B161: Pro removed → fold into Default
    return MODES.includes(m) ? m : 'lite';
  }

  function getUiMode() {
    return normalizeMode(document.documentElement.getAttribute('data-ui-mode'));
  }

  function setUiMode(mode) {
    if (!MODES.includes(mode) || mode === getUiMode()) return;
    document.documentElement.setAttribute('data-ui-mode', mode);
    try { localStorage.setItem(STORAGE_KEY, mode); } catch (e) { /* private mode */ }
    global.dispatchEvent(new CustomEvent('uimodechange', { detail: { mode } }));
  }

  global.getUiMode = getUiMode;
  global.setUiMode = setUiMode;

  // ── Colour mode (dark | light), B173 ─────────────────────────────────────
  // data-mode on <html>, set before first paint by skin-preload.js. Persisted
  // in cookie `gvn_mode` (primary) + localStorage['gvn_color_mode'] (fallback).
  const COLOR_KEY = 'gvn_color_mode';
  const COLOR_MODES = ['dark', 'light'];

  function getColorMode() {
    return document.documentElement.getAttribute('data-mode') === 'light' ? 'light' : 'dark';
  }

  function setColorMode(mode) {
    if (!COLOR_MODES.includes(mode) || mode === getColorMode()) return;
    document.documentElement.setAttribute('data-mode', mode);
    try { document.cookie = 'gvn_mode=' + mode + '; Path=/; Max-Age=31536000; SameSite=Lax'; } catch (e) { /* ignore */ }
    try { localStorage.setItem(COLOR_KEY, mode); } catch (e) { /* private mode */ }
    global.dispatchEvent(new CustomEvent('colormodechange', { detail: { mode } }));
  }

  global.getColorMode = getColorMode;
  global.setColorMode = setColorMode;

})(window);
