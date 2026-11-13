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
import './i18n.js?v=3a34a48f';
import './ui-mode.js?v=3e1ff171';
import './settings-panel.js?v=014127cb';
import './socket-client.js?v=c3c76eda';
import './board.js?v=9e0cd3f5';
import './room.js?v=c455bd4f';
import './chat-ui.js?v=87065d01';
import './room-ui.js?v=cac1d548';
import './room-stage.js?v=76bf0157';
import './game-ui.js?v=7f0e0d35';
import './room-socket.js?v=8bf4432f';
