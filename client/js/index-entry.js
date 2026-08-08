// audio-manager.js and escape-utils.js are UMD modules — see the comment in
// room-entry.js for why they load as classic <script> tags in index.html
// instead of an ES import here (a bare side-effect import of a CJS-shaped
// file never runs in a production Vite build).
import './session.js?v=85';
import './i18n.js?v=85';
import './ui-mode.js?v=85';
import './settings-panel.js?v=85';
import './socket-client.js?v=85';
import './lobby.js?v=85';
import './tournaments.js?v=85';
