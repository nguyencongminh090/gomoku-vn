// audio-manager.js and escape-utils.js are UMD modules — see the comment in
// room-entry.js for why they load as classic <script> tags in index.html
// instead of an ES import here (a bare side-effect import of a CJS-shaped
// file never runs in a production Vite build).
import './session.js?v=118';
import './i18n.js?v=118';
import './ui-mode.js?v=118';
import './settings-panel.js?v=118';
import './socket-client.js?v=118';
import './lobby.js?v=118';
import './tournaments.js?v=118';
