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
import './i18n.js?v=01244baf';
import './ui-mode.js?v=3e1ff171';
import './settings-panel.js?v=546585e1';
import './board.js?v=91667397';
import './room.js?v=499b9291';
import './chat-ui.js?v=48746649';
import './room-invite.js?v=9d126390';
import './room-ui.js?v=136c04cd';
import './room-stage.js?v=93bad581';
import './game-ui.js?v=0be3b7a7';
import './room-socket.js?v=9733dd3b';
