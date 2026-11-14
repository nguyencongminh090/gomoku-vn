// session.js and socket-client.js are NOT imported here: index.html loads them as
// classic <head> scripts so the socket handshake can start during parsing
// (TODO.md #145). Importing them here as well would evaluate both files a second
// time under a different specifier — the #51 duplicate-socket bug, by another route.
//
// audio-manager.js and escape-utils.js are UMD modules — see the comment in
// room-entry.js for why they load as classic <script> tags in index.html
// instead of an ES import here (a bare side-effect import of a CJS-shaped
// file never runs in a production Vite build).
import './i18n.js?v=70ecfb22';
import './ui-mode.js?v=3e1ff171';
import './settings-panel.js?v=f5001901';
import './platform-shell.js?v=bd6fcdfc';
import './lobby.js?v=5f51da63';
import './private-chat.js?v=fd2b4134';
import './tournaments.js?v=48180dfc';
import './lobby-home.js?v=fb566fa2';
