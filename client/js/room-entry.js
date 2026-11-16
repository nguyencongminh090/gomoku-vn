// audio-manager.js, profanity-classifier-model.js, profanity-filter.js, and
// escape-utils.js are UMD modules that self-attach to a global
// (window.audioManager / window.ProfanityFilter / etc.) via a plain
// `if (typeof module.exports) {...} else { root.X = ... }` branch. Vite's
// commonjs plugin detects that CJS branch and lazily wraps the *whole* file
// so nothing runs until something imports a named/default binding and calls
// it — a bare side-effect `import './x.js'` never triggers that in a
// production build, silently leaving the global unset (see TODO.md #65
// fix-log: this is exactly how B65's production-build check caught
// window.EscapeUtils/window.ProfanityFilter never getting set). room.html
// loads them as plain classic <script> tags instead, before this module
// script, so the global attachment always runs as ordinary script execution
// (profanity-filter.js is injected the same classic way by room.js on first
// chat focus, #264; the classifier model is never loaded in the browser).
//
// session.js and socket-client.js are NOT imported here (#391): room.html loads
// them as classic <head> scripts so socket-early.js can open the socket while
// the page parses. Importing them too would evaluate both a second time — the
// #51 duplicate-socket bug.
import './i18n.js?v=3ab6807f';
import './ui-mode.js?v=3e1ff171';
import './settings-panel.js?v=7acad48e';
import './board.js?v=f4df4701';
import './room.js?v=36813fdf';
import './chat-ui.js?v=87065d01';
import './room-ui.js?v=ccffbeb5';
import './room-stage.js?v=07770a6a';
import './game-ui.js?v=823536da';
import './room-socket.js?v=3cfe0e77';
