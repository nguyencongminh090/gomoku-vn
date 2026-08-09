'use strict';

// =============================================================================
// GomokuVN — Server Configuration
// All constants are defined here. Never use magic numbers elsewhere.
// =============================================================================

// Pull in a local .env before anything reads process.env. Real environment
// variables always win; see server/utils/load-env.js for why this exists and
// what it deliberately does not do.
require('./utils/load-env').loadEnv();

// --- Room limits ---
// Overridable via env var so the capacity-test harness (scripts/capacity-test/)
// can dial concurrency for a run without editing this tracked file each time
// (see TODO.md #26 / instruction.md §B26). Unset in production — the literal
// defaults below are what actually ships.
//
// Raised 2026-08-03 (TODO.md #31) from the original 10/20 (200 total
// room-members) to 50/40 (2000 total): these were always an abuse-prevention
// choice, not a capacity one (see docs/stress-test-report.md §8) — the
// server itself is verified clean up to ~3000-4000 concurrent players
// (docs/stress-test-report.md §9-10, TODO.md #27-29), so 2000 total
// room-members still leaves comfortable headroom under that ceiling.
// MAX_ROOMS_PER_IP was deliberately left at 3 (not asked for, not scaled
// up) — see the comment on it below for why that's still a meaningful cap
// at the new pool size.
const MAX_ROOMS             = parseInt(process.env.MAX_ROOMS, 10) || 50;
// Per-IP share of MAX_ROOMS. Deliberately not 1: phones on the same mobile
// carrier NAT, and everyone on one office/school/home wifi, share a public IP,
// so a limit of 1 would lock out real users who did nothing wrong. 3 still
// stops one client from taking the whole MAX_ROOMS pool — and still does at
// MAX_ROOMS=50 (3/50 = 6% of the pool, tighter in relative terms than the
// original 3/10 = 30%), so this was not raised alongside MAX_ROOMS.
const MAX_ROOMS_PER_IP      = parseInt(process.env.MAX_ROOMS_PER_IP, 10) || 3;
// A room whose sole occupant just disconnected sits in EMPTY_ROOM_GRACE_MS
// (below) still counting toward MAX_ROOMS_PER_IP even though it's abandoned
// in every practical sense — that let a stray disconnect eat into a shared
// IP's quota for up to 20s with nobody actually online. MAX_ROOMS_PER_IP
// itself now only counts rooms NOT currently in that grace window (see
// RoomManager.createRoom's graceRoomIds param), so a real new room isn't
// blocked by one that's mid-teardown. This second, separate cap exists so
// that exemption can't be turned into a bypass: an attacker repeatedly
// creating a room and immediately disconnecting it (which starts a fresh
// grace timer each time) can still be capped, since grace-room count is
// checked on its own instead of being uncounted entirely. See TODO.md #43 /
// instruction.md §43.
const MAX_GRACE_ROOMS_PER_IP = parseInt(process.env.MAX_GRACE_ROOMS_PER_IP, 10) || 3;
const MAX_USERS_PER_ROOM    = parseInt(process.env.MAX_USERS_PER_ROOM, 10) || 40; // 2 players + 38 guests
const IDLE_TIMEOUT_MS       = 600_000; // 10 minutes
const IDLE_SCAN_INTERVAL_MS = 60_000;  // How often rooms are scanned against IDLE_TIMEOUT_MS

// --- Disconnect grace ---
const DISCONNECT_GRACE_MS   = 60_000; // 60 seconds
// How long a room with exactly one occupant is kept alive after that
// occupant's socket drops before being destroyed as "empty". A full-page
// navigation (index.html -> room.html, or any reload) always disconnects the
// old socket before the new page's socket reconnects; over a real network
// that gap can be several seconds, not the near-zero gap seen on localhost.
// Without this grace, that gap alone destroys a just-created room before its
// creator's room.html socket ever gets to join it. Bounded — not "wait
// forever" — so a genuinely abandoned solo room still gets reclaimed
// promptly. See TODO.md #18 / instruction.md §B18 (second pass).
const EMPTY_ROOM_GRACE_MS   = parseInt(process.env.EMPTY_ROOM_GRACE_MS, 10) || 20_000;
// A guest/spectator (or a seated player whose game isn't 'ongoing' yet) who
// drops connection while other people remain in the room used to be removed
// immediately — no grace at all — unlike the two cases above. That gap made a
// brief mobile network blip (screen lock, wifi handoff) permanently evict
// them and, on reconnect, made the client wrongly show "Phòng không còn tồn
// tại" even though the room was still alive with other people in it. See
// TODO.md #39 / instruction.md §39.
const SPECTATOR_GRACE_MS    = parseInt(process.env.SPECTATOR_GRACE_MS, 10) || 30_000;

// --- Game / Board ---
const DEFAULT_BOARD_SIZE    = 17;
const VALID_BOARD_SIZES     = [15, 17, 19, 20];
const DEFAULT_TIMER_MODE    = 'per_move';
const DEFAULT_TIMER_SECONDS = 60;
const DEFAULT_TIMER_INCREMENT_SECONDS = 0;
const TIME_REQUEST_BONUS    = 30;  // Seconds added per "Xin Time" request
const TIME_REQUEST_FREE     = 3;   // Number of free "Xin Time" requests before needing permission

// --- WALL mechanic ---
const WALL_COUNT            = 3;
const WALL_EDGE_MIN_DIST    = 4;   // Min distance from any board edge
const WALL_CENTER_ZONE      = 1;   // Center ±1 cells is forbidden (3x3 zone)
const WALL_MIN_CHEBYSHEV    = 5;   // Chebyshev dist between any 2 walls must be >= 5
const WALL_RETRY_LIMIT      = 100;

// --- PORTAL mechanic ---
const PORTAL_PAIR_COUNT     = 2;
const PORTAL_MIN_CHEBYSHEV  = 5;   // Min Chebyshev dist between any 2 portal cells
const PORTAL_EDGE_MIN_DIST  = 4;   // Min distance from any board edge
const PORTAL_RETRY_LIMIT    = 100;

// --- Chat rate limiting ---
const CHAT_RATE_LIMIT       = 5;    // Max messages per window
const CHAT_RATE_WINDOW_MS   = 3000; // Window duration

// --- Authentication ---
const JWT_SECRET  = process.env.JWT_SECRET || 'gomokuvn-dev-secret-change-in-production';
if (process.env.NODE_ENV !== 'test' && JWT_SECRET === 'gomokuvn-dev-secret-change-in-production') {
  throw new Error(
    'JWT_SECRET must be set (no default secret allowed outside test).\n' +
    'For local development, run ./start.sh — it generates one into .env on ' +
    'first run. Otherwise export JWT_SECRET yourself, e.g.\n' +
    "  JWT_SECRET=$(node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\") npm start"
  );
}
// JWT is no longer the session credential (TODO.md #68 — sessions now live in
// the `sessions` table, browser holds an opaque id). These two remain ONLY for
// the time-boxed migration path: POST /api/auth/upgrade-session still verifies
// a legacy token issued before the switch, and verifySocketToken still accepts
// one during the transition window. Delete both, and the jsonwebtoken
// dependency on the auth path, once the window closes (see
// features/jwt-httponly-cookie/planning.md step 12).
const JWT_EXPIRY  = '7d';
const JWT_GUEST_EXPIRY = '24h';
const BCRYPT_ROUNDS = 12;

// --- OAuth (Google, TODO.md #91) ---
// Optional, unlike JWT_SECRET: an environment that hasn't configured Google
// OAuth (local dev without it, CI) must still boot. The routes check for
// null themselves and respond with a clear "not configured" error instead.
//
// No GOOGLE_CALLBACK_URL here on purpose (removed post-launch — see
// docs/fix-log for the incident): a single fixed callback URL breaks the
// moment the app is reachable under more than one origin at once (e.g.
// localhost:3000 for local testing AND a Cloudflare Tunnel domain for real
// use) — the state cookie set on one origin never reaches Google's redirect
// back to the other. routes/auth.js now derives the callback URL from each
// request's own Host header instead, so every origin that's actually
// registered as an authorized redirect URI in Google Cloud Console works.
const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID || null;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || null;

// --- Sessions (TODO.md #68) ---
// Same lifetimes the JWTs had, so the switch changes the mechanism without
// silently changing how long people stay signed in.
const SESSION_TTL_MS       = 7 * 24 * 60 * 60 * 1000;  // 7 days  — registered users
const SESSION_GUEST_TTL_MS = 24 * 60 * 60 * 1000;      // 24 hours — guests
const SESSION_COOKIE_NAME  = 'gvn_session';
// Expired rows do not disappear on their own the way an expired JWT does.
const SESSION_SWEEP_INTERVAL_MS = 60 * 60 * 1000;      // hourly

// --- Guest name generation ---
// All words 3-5 letters so combined name is 4-8 letters total.
const GUEST_NAME_ADJECTIVES = [
  'Red', 'Blue', 'Bold', 'Dark', 'Fast', 'Free', 'Grim', 'Iron',
  'Jade', 'Kind', 'Lone', 'Neon', 'Pale', 'Pure', 'Sage', 'Slim',
  'Soft', 'Teal', 'True', 'Wild',
];
const GUEST_NAME_NOUNS = [
  'Bear', 'Bird', 'Buck', 'Bull', 'Colt', 'Crow', 'Deer', 'Dove',
  'Duck', 'Elk',  'Fish', 'Flea', 'Fly',  'Fox',  'Gnu',  'Hawk',
  'Ibis', 'Kite', 'Lamb', 'Lark', 'Lion', 'Lynx', 'Mink', 'Mole',
  'Moth', 'Mule', 'Newt', 'Puma', 'Rook', 'Slug', 'Swan', 'Toad',
  'Vole', 'Wolf', 'Wren', 'Yak',
];

// --- HTTP ---
const HTTP_PORT = process.env.PORT || 3000;
// TCP accept-queue depth passed to server.listen(). Node's own default is 511,
// which the kernel silently overflows (dropping SYNs — surfacing to clients as
// "connect timeout", and NEVER as a server-side log line) once thousands of NEW
// connections arrive in the same burst. Measured directly, at 4000 players
// connecting at once: with 511 the run lost ~12-14% of connections and
// TcpExtListenOverflows climbed by ~14 000; with 4096 the same run completed
// 100% with zero errors. See docs/stress-test-report.md §10.
// The kernel caps this at net.core.somaxconn, so a value larger than the host
// allows is silently clamped rather than failing — safe to leave high.
const LISTEN_BACKLOG = parseInt(process.env.LISTEN_BACKLOG, 10) || 4096;

// --- Security ---
const MAX_EVENTS_PER_SECOND = 50; // Socket flood protection
const FLOOD_DISCONNECT_STREAK = 5; // Consecutive over-limit 1s windows before force-disconnect

// --- Tournament (features/tournament/, TODO.md #48) ---
const TOURNAMENT_FORMATS = ['swiss', 'round_robin', 'double_elim'];
// Per-match scheduling deadline (decision 2 in features/tournament/planning.md):
// counted from when a pairing is announced, not per-round/per-tournament.
// 48h gives a same-day-negotiate, next-day-play window without forcing same-day
// play — a real "self-dealt" World-Blitz-Cup-style pair needs room to find a
// mutually free slot. Organizer-configurable per tournament via ruleSet.
const DEFAULT_SCHEDULING_WINDOW_MS = parseInt(process.env.TOURNAMENT_SCHEDULING_WINDOW_MS, 10) || 48 * 60 * 60 * 1000;
// Only one tiebreak method is implemented (decision 9) — kept as a ruleSet
// field, not a hardcoded constant, so a future format-specific override has
// somewhere to live without a schema change.
const DEFAULT_TIEBREAK_RULE = 'buchholz_sonneborn_berger';
// Deadline-sweep cadence (design answer (b) in the Phase 1-6 plan): mirrors
// RoomManager's IDLE_SCAN_INTERVAL_MS pattern — one setInterval scanning a
// Map of only currently-pending deadlines, not one timer per pairing. 10s is
// tight enough that a missed deadline resolves promptly, loose enough to be
// cheap even with many concurrent tournaments.
const TOURNAMENT_DEADLINE_SCAN_INTERVAL_MS = parseInt(process.env.TOURNAMENT_DEADLINE_SCAN_INTERVAL_MS, 10) || 10_000;

module.exports = {
  MAX_ROOMS,
  MAX_ROOMS_PER_IP,
  MAX_GRACE_ROOMS_PER_IP,
  MAX_USERS_PER_ROOM,
  IDLE_TIMEOUT_MS,
  IDLE_SCAN_INTERVAL_MS,
  DISCONNECT_GRACE_MS,
  EMPTY_ROOM_GRACE_MS,
  SPECTATOR_GRACE_MS,
  DEFAULT_BOARD_SIZE,
  VALID_BOARD_SIZES,
  DEFAULT_TIMER_MODE,
  DEFAULT_TIMER_SECONDS,
  DEFAULT_TIMER_INCREMENT_SECONDS,
  TIME_REQUEST_BONUS,
  TIME_REQUEST_FREE,
  WALL_COUNT,
  WALL_EDGE_MIN_DIST,
  WALL_CENTER_ZONE,
  WALL_MIN_CHEBYSHEV,
  WALL_RETRY_LIMIT,
  PORTAL_PAIR_COUNT,
  PORTAL_MIN_CHEBYSHEV,
  PORTAL_EDGE_MIN_DIST,
  PORTAL_RETRY_LIMIT,
  CHAT_RATE_LIMIT,
  CHAT_RATE_WINDOW_MS,
  JWT_SECRET,
  JWT_EXPIRY,
  JWT_GUEST_EXPIRY,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  SESSION_TTL_MS,
  SESSION_GUEST_TTL_MS,
  SESSION_COOKIE_NAME,
  SESSION_SWEEP_INTERVAL_MS,
  BCRYPT_ROUNDS,
  GUEST_NAME_ADJECTIVES,
  GUEST_NAME_NOUNS,
  HTTP_PORT,
  LISTEN_BACKLOG,
  MAX_EVENTS_PER_SECOND,
  FLOOD_DISCONNECT_STREAK,
  TOURNAMENT_FORMATS,
  DEFAULT_SCHEDULING_WINDOW_MS,
  DEFAULT_TIEBREAK_RULE,
  TOURNAMENT_DEADLINE_SCAN_INTERVAL_MS,
};
