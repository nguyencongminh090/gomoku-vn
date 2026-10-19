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
import './session.js?v=7d763f30';
import './i18n.js?v=3b0d0335';
import './ui-mode.js?v=3e1ff171';
import './settings-panel.js?v=014127cb';
import './socket-client.js?v=13b77de5';
import './board.js?v=8a25f014';
import './room.js?v=d303980d';
import './chat-ui.js?v=c9347a46';
import './room-ui.js?v=6339f10d';
import './game-ui.js?v=40aa4bb0';
import './room-socket.js?v=c7acb632';
