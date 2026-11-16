// session.js and socket-client.js are NOT imported here: index.html loads them as
// classic <head> scripts so the socket handshake can start during parsing
// (TODO.md #145). Importing them here as well would evaluate both files a second
// time under a different specifier — the #51 duplicate-socket bug, by another route.
//
// audio-manager.js and escape-utils.js are UMD modules — see the comment in
// room-entry.js for why they load as classic <script> tags in index.html
// instead of an ES import here (a bare side-effect import of a CJS-shaped
// file never runs in a production Vite build).
import './i18n.js?v=3ab6807f';
import './ui-mode.js?v=3e1ff171';
import './settings-panel.js?v=7acad48e';
import './platform-shell.js?v=bd6fcdfc';
import './lobby.js?v=f155548e';
import './private-chat.js?v=0606a1fd';
import './tournaments.js?v=a7608bd9';
import './lobby-home.js?v=dd3c2d33';
import './pwa-install.js';
