// session.js and socket-client.js are NOT imported here: index.html loads them as
// classic <head> scripts so the socket handshake can start during parsing
// (TODO.md #145). Importing them here as well would evaluate both files a second
// time under a different specifier — the #51 duplicate-socket bug, by another route.
//
// audio-manager.js and escape-utils.js are UMD modules — see the comment in
// room-entry.js for why they load as classic <script> tags in index.html
// instead of an ES import here (a bare side-effect import of a CJS-shaped
// file never runs in a production Vite build).
import './i18n.js?v=44e21116';
import './ui-mode.js?v=3e1ff171';
import './settings-panel.js?v=349e6629';
import './platform-shell.js?v=2914e34c';
import './lobby.js?v=7a02f9d9';
import './private-chat.js?v=dd9f40ff';
import './tournaments.js?v=a0b08f0e';
import './room-rules-guide.js?v=69333b4f';
import './lobby-home.js?v=50999328';
import './home-lamp.js?v=bbe72945';
import './pwa-install.js';
