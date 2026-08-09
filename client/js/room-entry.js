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
// loads all four as plain classic <script> tags instead, before this module
// script, so the global attachment always runs as ordinary script execution.
import './session.js?v=94';
import './i18n.js?v=94';
import './ui-mode.js?v=94';
import './settings-panel.js?v=94';
import './socket-client.js?v=94';
import './board.js?v=94';
import './room.js?v=94';
import './chat-ui.js?v=94';
import './room-ui.js?v=94';
import './game-ui.js?v=94';
import './room-socket.js?v=94';
