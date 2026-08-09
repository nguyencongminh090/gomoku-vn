'use strict';

/**
 * tournament-detail.js — Tournament detail page (client/tournament.html).
 *
 * Wires the Phase 6 mockup (client/tournament-detail-mockup.html) to the
 * real PairingLifecycle socket protocol from Phase 4
 * (server/socket/handlers/TournamentHandler.js). See TODO.md #48 /
 * instruction.md B48.
 *
 * Standings and round grouping are computed CLIENT-SIDE from the pairings
 * list already received (mirrors server/managers/tournament/standings.js's
 * pure functions) rather than adding a new socket round-trip — the server
 * never exposes a "get standings" event, but every pairing's result is
 * already in the `tournament:detail`/`tournament:pairings_patch` payloads,
 * which is all that pure computation needs.
 *
 * Manual test checklist:
 *   [ ] tournament:get on load renders header/pairings/standings
 *   [ ] "your turn" banner appears for the right pairing state
 *   [ ] report/confirm/dispute/reschedule all emit the right event+payload
 *   [ ] organizer-only actions only render for the organizer, and only in
 *       the pairing states PairingLifecycle actually allows them in
 *   [ ] tournament:pairings_patch / tournament:updated live-update the page
 *   [ ] "Vào trận" navigates to tournament-match.html with the right ids
 */

(function authGuard() {
  // See lobby.js — optimistic only (TODO.md #68); the socket handshake is the
  // real check, since an HttpOnly cookie is unreadable from here.
  window.GvnSession.requireAuth();
})();

const client = new SocketClient();

const params = new URLSearchParams(window.location.search);
const tournamentId = params.get('id');
if (!tournamentId) window.location.replace('index.html');

// ── Element refs ─────────────────────────────────────────────────────────
const statusBanner = document.getElementById('status-banner');
const navUser = document.getElementById('nav-user');
const navBadge = document.getElementById('nav-badge');
const detailNameEl = document.getElementById('detail-name');
const detailMetaEl = document.getElementById('detail-meta');
const actionBannerSlot = document.getElementById('action-banner-slot');
const detailCancelSlot = document.getElementById('detail-cancel-slot');
const subTabPairings = document.getElementById('sub-tab-pairings');
const subTabStandings = document.getElementById('sub-tab-standings');
const subTabGames = document.getElementById('sub-tab-games');
const subtabPairingsPanel = document.getElementById('subtab-pairings');
const subtabStandingsPanel = document.getElementById('subtab-standings');
const subtabGamesPanel = document.getElementById('subtab-games');
const pairingsContainer = document.getElementById('pairings-container');
const standingsContainer = document.getElementById('standings-container');
const gamesContainer = document.getElementById('games-container');

const escapeHtml = (str) => {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
};
const escapeAttr = (str) => globalThis.EscapeUtils.escapeAttr(str);

// Live view of the session identity (TODO.md #68).
//
// Deliberately an object of getters rather than a snapshot: identity now
// arrives from the server as `session:me` shortly AFTER this module runs, so
// a value captured here would be null on the first load following the
// migration and would never update. Every `userInfo.userId` / `.displayName`
// read below therefore stays live, with no re-assignment plumbing. Use
// `userInfo.signedIn` where the old code tested the snapshot for truthiness —
// this object itself is always truthy.
const userInfo = {
  get signedIn()    { return !!window.GvnSession.getUser(); },
  get userId()      { const u = window.GvnSession.getUser(); return u ? u.userId : null; },
  get displayName() { const u = window.GvnSession.getUser(); return u ? u.displayName : ''; },
  get isGuest()     { const u = window.GvnSession.getUser(); return !!(u && u.isGuest); },
};
if (userInfo.signedIn) {
  navUser.textContent = userInfo.displayName;
  navBadge.textContent = userInfo.isGuest ? t('nav.guest_badge') : '';
  navBadge.style.display = userInfo.isGuest ? '' : 'none';
}
client.bindStatusBanner(statusBanner);

// ── State ────────────────────────────────────────────────────────────────
let tournament = null;               // serializeTournament() payload
let pairingsById = new Map();        // pairingId -> serializePairing() payload
let entriesById = new Map();         // entryId -> entry

function myEntry() {
  if (!userInfo || !tournament) return null;
  for (const e of tournament.entries) if (e.userId === userInfo.userId) return e;
  return null;
}
function isMinePairing(pairing) {
  const me = myEntry();
  return !!me && (pairing.player1EntryId === me.entryId || pairing.player2EntryId === me.entryId);
}
function isOrganizer() {
  return userInfo.signedIn && !!tournament && tournament.organizerId === userInfo.userId;
}
function entryName(entryId) {
  const e = entriesById.get(entryId);
  return e ? e.displayName : '—';
}

// ── Fetch + live updates ─────────────────────────────────────────────────

client.emit('tournament:get', { tournamentId });

// TODO.md #76 — the match clock starts server-side the instant both players
// check in ready (TournamentManager.markPairingReady -> timer.start()), so
// any manual "Vào trận" click delay eats into a real player's own clock.
// Skip the click for real participants; spectators still click through
// (isMinePairing() is false for them, so this never fires for a "watch"
// button). One flag is enough since goToMatch() navigates the page away.
let navigatingToMatch = false;
function checkAutoEnterMatch() {
  if (navigatingToMatch) return;
  for (const pairing of pairingsById.values()) {
    if (pairing.state === 'InProgress' && isMinePairing(pairing)) {
      navigatingToMatch = true;
      goToMatch(pairing.pairingId);
      return;
    }
  }
}

client.on('tournament:detail', (data) => {
  if (!data.tournament || data.tournament.tournamentId !== tournamentId) return;
  tournament = data.tournament;
  entriesById = new Map(tournament.entries.map((e) => [e.entryId, e]));
  pairingsById = new Map(data.pairings.map((p) => [p.pairingId, p]));
  checkAutoEnterMatch();
  renderAll();
});

client.on('tournament:updated', (data) => {
  if (!tournament || data.tournamentId !== tournamentId) return;
  const { entries, ...scalars } = data;
  Object.assign(tournament, scalars);
  if (entries) {
    for (const entryId of entries.removed) entriesById.delete(entryId);
    for (const entry of entries.upserts) entriesById.set(entry.entryId, entry);
    tournament.entries = Array.from(entriesById.values());
  }
  renderAll();
});

client.on('tournament:pairings_patch', (data) => {
  if (!tournament || data.tournamentId !== tournamentId) return;
  for (const pairing of data.pairings) pairingsById.set(pairing.pairingId, pairing);
  checkAutoEnterMatch();
  renderAll();
});

client.on('tournament:error', (data) => {
  alert(data.code ? t('err.' + data.code.toLowerCase()) : data.message);
});

// ── Sub-tabs ─────────────────────────────────────────────────────────────

const SUB_TABS = {
  pairings: { btn: subTabPairings, panel: subtabPairingsPanel },
  standings: { btn: subTabStandings, panel: subtabStandingsPanel },
  games: { btn: subTabGames, panel: subtabGamesPanel },
};

function activateSubTab(name) {
  for (const [key, { btn, panel }] of Object.entries(SUB_TABS)) {
    const isActive = key === name;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
    panel.classList.toggle('is-active', isActive);
  }
  // Games history has no live socket payload (unlike pairings/standings,
  // which are derived from data already in memory) — fetch lazily, only
  // when the tab is actually opened.
  if (name === 'games') loadGamesHistory();
}
subTabPairings.addEventListener('click', () => activateSubTab('pairings'));
subTabStandings.addEventListener('click', () => activateSubTab('standings'));
subTabGames.addEventListener('click', () => activateSubTab('games'));

// ── Formatting helpers ───────────────────────────────────────────────────

function formatDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(getLanguage() === 'en' ? 'en-US' : 'vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch (e) { return iso; }
}
function formatHoursRemaining(iso) {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return t('tdetail.deadline_overdue');
  const hours = Math.max(1, Math.round(ms / 3_600_000));
  return t('tdetail.deadline_hours', { n: hours });
}
function toISOFromLocalInput(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function formatLabel(format) {
  if (format === 'swiss') return t('tournaments.format_swiss');
  if (format === 'round_robin') return t('tournaments.format_round_robin');
  if (format === 'double_elim') return t('tournaments.format_double_elim');
  return format;
}
function statusBadgeInfo(status) {
  if (status === 'active') return { cls: 'badge--live', label: t('tournaments.filter_active') };
  if (status === 'completed') return { cls: 'badge--done', label: t('tournaments.filter_done') };
  if (status === 'cancelled') return { cls: 'badge--done', label: t('tournaments.status_cancelled') };
  return { cls: 'badge--upcoming', label: t('tournaments.filter_upcoming') };
}

// ── Header ───────────────────────────────────────────────────────────────

function renderHeader() {
  detailNameEl.textContent = tournament.name;
  const badge = statusBadgeInfo(tournament.status);
  let roundMeta = '';
  if (tournament.format !== 'double_elim' && tournament.totalRounds) {
    // round_robin's currentRoundIndex is a 0-based array index server-side
    // (Swiss's is already 1-based) — normalize to a 1-based display number.
    const displayRound = tournament.format === 'round_robin'
      ? (tournament.currentRoundIndex || 0) + 1
      : (tournament.currentRoundIndex || 1);
    roundMeta = `<span class="detail-meta-item"><i class="ph ph-flag-checkered"></i>${t('tdetail.round_label', { n: Math.min(displayRound, tournament.totalRounds), total: tournament.totalRounds })}</span>`;
  }
  detailMetaEl.innerHTML = `
    <span class="badge badge--format">${formatLabel(tournament.format)}</span>
    <span class="badge ${badge.cls}">${badge.label}</span>
    <span class="detail-meta-item"><i class="ph ph-users-three"></i>${tournament.entries.length} ${t('tournaments.players_suffix')}</span>
    <span class="detail-meta-item"><i class="ph ph-user-circle"></i>${t('tournaments.organized_by', { name: escapeHtml(tournament.organizerName || '—') })}</span>
    ${roundMeta}
  `;

  if (isOrganizer() && (tournament.status === 'draft' || tournament.status === 'active')) {
    detailCancelSlot.innerHTML = `<button class="btn-secondary btn-secondary--danger" type="button" id="btn-cancel-tournament">${t('tdetail.btn_cancel_tournament')}</button>`;
    document.getElementById('btn-cancel-tournament').addEventListener('click', () => {
      document.getElementById('cancel-tournament-reason-input').value = '';
      document.getElementById('modal-cancel-tournament').classList.add('visible');
    });
  } else {
    detailCancelSlot.innerHTML = '';
  }

  if (tournament.status === 'cancelled') {
    detailCancelSlot.innerHTML = `
      <div class="dispute-notice"><i class="ph ph-warning" style="font-size:18px;"></i>
        <span>${t('tdetail.cancelled_notice')}${tournament.cancelReason ? ` — ${escapeHtml(tournament.cancelReason)}` : ''}</span>
      </div>
    `;
  }
}

// ── "Your turn" banner ───────────────────────────────────────────────────

function findMyActionablePairing() {
  const me = myEntry();
  const pairings = Array.from(pairingsById.values());

  if (isOrganizer()) {
    const disputed = pairings.find((p) => p.disputed && p.state === 'Reported');
    if (disputed) return { type: 'organizer_dispute', pairing: disputed };
    const reschedule = pairings.find((p) => p.rescheduleRequest);
    if (reschedule) return { type: 'organizer_reschedule', pairing: reschedule };
  }

  if (!me) return null;
  const mine = pairings.filter((p) => p.player1EntryId === me.entryId || p.player2EntryId === me.entryId);

  const inProgress = mine.find((p) => p.state === 'InProgress');
  if (inProgress) return { type: 'in_progress', pairing: inProgress };

  const needsConfirm = mine.find((p) => p.state === 'Reported' && !p.disputed && p.reportedBy !== me.entryId);
  if (needsConfirm) return { type: 'needs_confirm', pairing: needsConfirm };

  const needsCheckIn = mine.find((p) => p.state === 'Ready' && !p.readyPlayers.includes(me.entryId));
  if (needsCheckIn) return { type: 'needs_checkin', pairing: needsCheckIn };

  const needsReport = mine.find((p) => p.state === 'Negotiating');
  if (needsReport) return { type: 'needs_report', pairing: needsReport };

  return null;
}

function renderActionBanner() {
  const action = findMyActionablePairing();
  if (!action) { actionBannerSlot.innerHTML = ''; return; }

  const opponentName = (() => {
    const me = myEntry();
    if (!me) return '';
    const oppId = action.pairing.player1EntryId === me.entryId ? action.pairing.player2EntryId : action.pairing.player1EntryId;
    return entryName(oppId);
  })();

  let title, sub, btnLabel, onClick;
  switch (action.type) {
    case 'organizer_dispute':
      title = t('tdetail.banner_organizer_dispute_title');
      sub = t('tdetail.banner_organizer_dispute_sub', { p1: entryName(action.pairing.player1EntryId), p2: entryName(action.pairing.player2EntryId) });
      btnLabel = t('tdetail.banner_view'); onClick = () => scrollToPairing(action.pairing.pairingId);
      break;
    case 'organizer_reschedule':
      title = t('tdetail.banner_organizer_reschedule_title');
      sub = t('tdetail.banner_organizer_reschedule_sub', { p1: entryName(action.pairing.player1EntryId), p2: entryName(action.pairing.player2EntryId) });
      btnLabel = t('tdetail.banner_view'); onClick = () => scrollToPairing(action.pairing.pairingId);
      break;
    case 'in_progress':
      title = t('tdetail.banner_in_progress_title');
      sub = t('tdetail.banner_in_progress_sub', { name: opponentName });
      btnLabel = t('tdetail.banner_enter_match');
      onClick = () => goToMatch(action.pairing.pairingId);
      break;
    case 'needs_confirm':
      title = t('tdetail.banner_needs_confirm_title');
      sub = t('tdetail.banner_needs_confirm_sub', { name: opponentName, time: formatDateTime(action.pairing.proposedTime) });
      btnLabel = t('tdetail.banner_view'); onClick = () => scrollToPairing(action.pairing.pairingId);
      break;
    case 'needs_checkin':
      title = t('tdetail.banner_needs_checkin_title');
      sub = t('tdetail.banner_needs_checkin_sub', { time: formatDateTime(action.pairing.agreedTime) });
      btnLabel = t('tdetail.banner_view'); onClick = () => scrollToPairing(action.pairing.pairingId);
      break;
    case 'needs_report':
      title = t('tdetail.banner_needs_report_title');
      sub = t('tdetail.banner_needs_report_sub', { name: opponentName });
      btnLabel = t('tdetail.banner_view'); onClick = () => scrollToPairing(action.pairing.pairingId);
      break;
  }

  actionBannerSlot.innerHTML = `
    <div class="action-banner">
      <div class="action-banner__icon"><i class="ph-bold ph-hourglass-medium"></i></div>
      <div>
        <div class="action-banner__title">${escapeHtml(title)}</div>
        <div class="action-banner__sub">${escapeHtml(sub)}</div>
      </div>
      <div class="action-banner__spacer"></div>
      <button class="btn btn-confirm" type="button" id="action-banner-btn">${escapeHtml(btnLabel)}</button>
    </div>
  `;
  document.getElementById('action-banner-btn').addEventListener('click', onClick);
}

function scrollToPairing(pairingId) {
  activateSubTab('pairings');
  requestAnimationFrame(() => {
    const el = document.querySelector(`[data-pairing-id="${CSS.escape(pairingId)}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}
function goToMatch(pairingId) {
  window.location.href = `tournament-match.html?tournamentId=${encodeURIComponent(tournamentId)}&pairingId=${encodeURIComponent(pairingId)}`;
}

// ── Pairings list ────────────────────────────────────────────────────────

function stateLabel(pairing) {
  if (pairing.player2EntryId === null) return { cls: 'completed', label: t('tdetail.state_bye') };
  if (pairing.disputed && pairing.state === 'Reported') return { cls: 'disputed', label: t('tdetail.state_disputed') };
  switch (pairing.state) {
    case 'Paired':
    case 'Negotiating': return { cls: 'negotiating', label: t('tdetail.state_negotiating') };
    case 'Reported': return { cls: 'reported', label: t('tdetail.state_reported') };
    case 'Ready': return { cls: 'ready', label: t('tdetail.state_ready') };
    case 'InProgress': return { cls: 'inprogress', label: t('tdetail.state_inprogress') };
    case 'Completed': return { cls: 'completed', label: t('tdetail.state_completed') };
    case 'Walkover': return { cls: 'walkover', label: t('tdetail.state_walkover') };
    case 'DoubleNoShow': return { cls: 'walkover', label: t('tdetail.state_doublenoshow') };
    case 'OrganizerAdjusted': return { cls: 'completed', label: t('tdetail.state_adjusted') };
    case 'Cancelled': return { cls: 'walkover', label: t('tdetail.state_cancelled') };
    default: return { cls: 'negotiating', label: pairing.state };
  }
}

function resultLine(pairing, me) {
  if (!pairing.result) return '';
  const { winnerEntryId, reason } = pairing.result;
  let text;
  if (winnerEntryId === null) {
    text = reason === 'organizer_adjusted' ? t('tdetail.result_adjusted') : t('tdetail.result_draw');
  } else {
    const won = me && winnerEntryId === me.entryId;
    const winnerName = entryName(winnerEntryId);
    text = won ? t('tdetail.result_you_won') : t('tdetail.result_winner', { name: winnerName });
    if (reason === 'walkover') text += ` (${t('tdetail.reason_walkover')})`;
    else if (reason === 'bye') text += ` (${t('tdetail.reason_bye')})`;
  }
  return `<div class="pairing-card__result">${t('tdetail.result_label')}: <span class="win">${escapeHtml(text)}</span></div>`;
}

function renderPairingCard(pairing) {
  const me = myEntry();
  const isMine = isMinePairing(pairing);
  const st = stateLabel(pairing);
  const p1Name = entryName(pairing.player1EntryId);
  const p2Name = pairing.player2EntryId ? entryName(pairing.player2EntryId) : t('tdetail.bye_opponent');

  const p1Label = me && pairing.player1EntryId === me.entryId ? `<span class="pairing-card__you">${t('tdetail.you')}</span>` : escapeHtml(p1Name);
  const p2Label = me && pairing.player2EntryId === me.entryId ? `<span class="pairing-card__you">${t('tdetail.you')}</span>` : escapeHtml(p2Name);

  let metaLine = '';
  let actions = '';
  const organizerActions = [];

  if (pairing.state === 'Negotiating' || pairing.state === 'Paired') {
    metaLine = `<i class="ph ph-hourglass"></i>${formatHoursRemaining(pairing.deadline)}`;
    if (isMine) actions += `<button class="btn btn-confirm" type="button" data-action="report" data-pairing-id="${escapeAttr(pairing.pairingId)}">${t('tdetail.btn_report')}</button>`;
    if (isOrganizer()) organizerActions.push(`<button class="btn-secondary btn-secondary--danger" type="button" data-action="adjust" data-pairing-id="${escapeAttr(pairing.pairingId)}">${t('tdetail.btn_adjust')}</button>`);
  } else if (pairing.state === 'Reported') {
    if (pairing.disputed) {
      metaLine = `<i class="ph ph-hourglass"></i>${formatHoursRemaining(pairing.deadline)}`;
      if (isOrganizer()) {
        organizerActions.push(`<button class="btn btn-confirm" type="button" style="padding:6px 12px; font-size:12px;" data-action="resolve" data-pairing-id="${escapeAttr(pairing.pairingId)}">${t('tdetail.btn_resolve')}</button>`);
        organizerActions.push(`<button class="btn-secondary btn-secondary--danger" type="button" data-action="adjust" data-pairing-id="${escapeAttr(pairing.pairingId)}">${t('tdetail.btn_adjust')}</button>`);
      }
    } else if (isMine && pairing.reportedBy === me.entryId) {
      metaLine = `<i class="ph ph-calendar"></i>${t('tdetail.proposed_label')}: ${formatDateTime(pairing.proposedTime)} &nbsp;·&nbsp; ${formatHoursRemaining(pairing.deadline)}`;
    } else if (isMine) {
      metaLine = `<i class="ph ph-calendar"></i>${t('tdetail.proposed_label')}: ${formatDateTime(pairing.proposedTime)} &nbsp;·&nbsp; ${formatHoursRemaining(pairing.deadline)}`;
      actions += `<button class="btn btn-confirm" type="button" data-action="confirm" data-pairing-id="${escapeAttr(pairing.pairingId)}">${t('tdetail.btn_confirm')}</button>`;
      actions += `<button class="btn-secondary" type="button" data-action="dispute" data-pairing-id="${escapeAttr(pairing.pairingId)}">${t('tdetail.btn_dispute')}</button>`;
    } else {
      metaLine = `<i class="ph ph-calendar"></i>${t('tdetail.proposed_label')}: ${formatDateTime(pairing.proposedTime)}`;
    }
    if (isOrganizer() && !pairing.disputed) organizerActions.push(`<button class="btn-secondary btn-secondary--danger" type="button" data-action="adjust" data-pairing-id="${escapeAttr(pairing.pairingId)}">${t('tdetail.btn_adjust')}</button>`);
  } else if (pairing.state === 'Ready') {
    metaLine = `<i class="ph ph-calendar"></i>${formatDateTime(pairing.agreedTime)}`;
    if (pairing.rescheduleRequest) {
      metaLine += ` &nbsp;·&nbsp; <i class="ph ph-arrows-clockwise"></i>${t('tdetail.reschedule_pending', { name: entryName(pairing.rescheduleRequest.requestedBy), time: formatDateTime(pairing.rescheduleRequest.newTime) })}`;
      if (isOrganizer()) {
        organizerActions.push(`<button class="btn btn-confirm" type="button" style="padding:6px 12px; font-size:12px;" data-action="approve_reschedule" data-pairing-id="${escapeAttr(pairing.pairingId)}">${t('tdetail.btn_approve')}</button>`);
        organizerActions.push(`<button class="btn-secondary" type="button" data-action="deny_reschedule" data-pairing-id="${escapeAttr(pairing.pairingId)}">${t('tdetail.btn_deny')}</button>`);
      }
    } else if (isMine) {
      actions += `<button class="btn-secondary" type="button" data-action="reschedule" data-pairing-id="${escapeAttr(pairing.pairingId)}">${t('tdetail.btn_request_reschedule')}</button>`;
    }
    if (isMine) {
      const checkedIn = pairing.readyPlayers.includes(me.entryId);
      if (!checkedIn) {
        actions += `<button class="btn btn-confirm" type="button" data-action="ready" data-pairing-id="${escapeAttr(pairing.pairingId)}">${t('tdetail.btn_ready')}</button>`;
      } else {
        metaLine += ` &nbsp;·&nbsp; ${t('tdetail.checked_in_waiting')}`;
      }
    }
  } else if (pairing.state === 'InProgress') {
    if (isMine) actions += `<button class="btn btn-confirm" type="button" data-action="enter" data-pairing-id="${escapeAttr(pairing.pairingId)}">${t('tdetail.btn_enter_match')}</button>`;
    else actions += `<button class="btn-secondary" type="button" data-action="enter" data-pairing-id="${escapeAttr(pairing.pairingId)}">${t('tdetail.btn_watch_match')}</button>`;
  }

  const organizerToolsHtml = organizerActions.length
    ? `<div class="organizer-tools"><span class="organizer-tools__label"><i class="ph ph-crown-simple"></i>${t('tdetail.organizer_tools')}</span>${organizerActions.join('')}</div>`
    : '';

  return `
    <div class="pairing-card${isMine ? ' is-me' : ''}" data-pairing-id="${escapeAttr(pairing.pairingId)}">
      <div class="pairing-card__top">
        <div class="pairing-card__players">${p1Label}<span class="pairing-card__vs">vs</span>${p2Label}</div>
        <span class="state-pill state-pill--${st.cls}">${st.label}</span>
      </div>
      ${metaLine ? `<div class="pairing-card__meta">${metaLine}</div>` : ''}
      ${resultLine(pairing, me)}
      ${actions ? `<div class="pairing-card__actions">${actions}</div>` : ''}
      ${organizerToolsHtml}
    </div>
  `;
}

function renderPairings() {
  const me = myEntry();
  const pairings = Array.from(pairingsById.values());

  if (pairings.length === 0) {
    pairingsContainer.innerHTML = `
      <div class="empty-tournaments">
        <span class="room-list__empty-text">${t('tdetail.no_pairings')}</span>
        <span class="room-list__empty-sub">${t('tdetail.no_pairings_sub')}</span>
      </div>
    `;
    return;
  }

  if (tournament.format === 'double_elim') {
    const sorted = [...pairings].sort((a, b) => (a.pairedAt < b.pairedAt ? 1 : -1));
    pairingsContainer.innerHTML = `
      <div class="round-group">
        <div class="round-group__title">${t('tdetail.bracket_matches')}</div>
        <div class="pairing-list">${sorted.map(renderPairingCard).join('')}</div>
      </div>
    `;
  } else {
    const byRound = new Map();
    for (const p of pairings) {
      const idx = p.roundIndex ?? 0;
      if (!byRound.has(idx)) byRound.set(idx, []);
      byRound.get(idx).push(p);
    }
    const roundIndexes = Array.from(byRound.keys()).sort((a, b) => b - a);
    const currentIdx = tournament.currentRoundIndex;

    pairingsContainer.innerHTML = roundIndexes.map((idx) => {
      const displayNum = tournament.format === 'round_robin' ? idx + 1 : idx;
      const isCurrent = idx === currentIdx && tournament.status === 'active';
      const label = `${t('tdetail.round_word')} ${displayNum}${isCurrent ? ` (${t('tdetail.round_current')})` : (tournament.status !== 'draft' ? ` (${t('tdetail.round_past')})` : '')}`;
      const list = byRound.get(idx).sort((a, b) => (a.pairedAt < b.pairedAt ? -1 : 1));
      return `
        <div class="round-group">
          <div class="round-group__title">${label}</div>
          <div class="pairing-list">${list.map(renderPairingCard).join('')}</div>
        </div>
      `;
    }).join('');
  }

  bindPairingActionHandlers();
  void me;
}

function bindPairingActionHandlers() {
  pairingsContainer.querySelectorAll('[data-action]').forEach((btn) => {
    const pairingId = btn.dataset.pairingId;
    const action = btn.dataset.action;
    btn.addEventListener('click', () => handlePairingAction(action, pairingId));
  });
}

function handlePairingAction(action, pairingId) {
  switch (action) {
    case 'report': openReportModal(pairingId); break;
    case 'confirm':
      if (confirm(t('tdetail.confirm_time_prompt'))) client.emit('tournament:confirm_time', { tournamentId, pairingId });
      break;
    case 'dispute': openDisputeModal(pairingId); break;
    case 'reschedule': openRescheduleModal(pairingId); break;
    case 'ready':
      client.emit('tournament:ready', { tournamentId, pairingId });
      break;
    case 'enter': goToMatch(pairingId); break;
    case 'resolve': openResolveModal(pairingId); break;
    case 'adjust': openAdjustModal(pairingId); break;
    case 'approve_reschedule':
      if (confirm(t('tdetail.approve_reschedule_prompt'))) client.emit('tournament:approve_reschedule', { tournamentId, pairingId });
      break;
    case 'deny_reschedule':
      if (confirm(t('tdetail.deny_reschedule_prompt'))) client.emit('tournament:deny_reschedule', { tournamentId, pairingId });
      break;
  }
}

// ── Modals ───────────────────────────────────────────────────────────────

let activePairingId = null;

function openModal(id, pairingId) {
  activePairingId = pairingId;
  document.getElementById(id).classList.add('visible');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('visible');
  activePairingId = null;
}
document.querySelectorAll('[data-modal-close]').forEach((btn) => {
  btn.addEventListener('click', () => closeModal(btn.dataset.modalClose));
});
document.querySelectorAll('.modal-overlay').forEach((ov) => {
  ov.addEventListener('click', (e) => { if (e.target === ov) ov.classList.remove('visible'); });
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.modal-overlay.visible').forEach((ov) => ov.classList.remove('visible'));
});

function openReportModal(pairingId) { document.getElementById('report-time-input').value = ''; openModal('modal-report-time', pairingId); }
function openDisputeModal(pairingId) { openModal('modal-dispute-time', pairingId); }
function openRescheduleModal(pairingId) { document.getElementById('reschedule-time-input').value = ''; openModal('modal-reschedule', pairingId); }
function openResolveModal(pairingId) { document.getElementById('resolve-time-input').value = ''; openModal('modal-resolve', pairingId); }
function openAdjustModal(pairingId) { document.getElementById('adjust-reason-input').value = ''; openModal('modal-adjust', pairingId); }

document.getElementById('btn-submit-report-time').addEventListener('click', () => {
  const iso = toISOFromLocalInput(document.getElementById('report-time-input').value);
  if (!iso) { alert(t('tdetail.err_missing_time')); return; }
  client.emit('tournament:report_time', { tournamentId, pairingId: activePairingId, proposedTime: iso });
  closeModal('modal-report-time');
});
document.getElementById('btn-submit-dispute').addEventListener('click', () => {
  client.emit('tournament:dispute_time', { tournamentId, pairingId: activePairingId });
  closeModal('modal-dispute-time');
});
document.getElementById('btn-submit-reschedule').addEventListener('click', () => {
  const iso = toISOFromLocalInput(document.getElementById('reschedule-time-input').value);
  if (!iso) { alert(t('tdetail.err_missing_time')); return; }
  client.emit('tournament:request_reschedule', { tournamentId, pairingId: activePairingId, newProposedTime: iso });
  closeModal('modal-reschedule');
});
document.getElementById('btn-submit-resolve').addEventListener('click', () => {
  const iso = toISOFromLocalInput(document.getElementById('resolve-time-input').value);
  if (!iso) { alert(t('tdetail.err_missing_time')); return; }
  client.emit('tournament:organizer_resolve', { tournamentId, pairingId: activePairingId, finalTime: iso });
  closeModal('modal-resolve');
});
document.getElementById('btn-submit-adjust').addEventListener('click', () => {
  const reason = document.getElementById('adjust-reason-input').value.trim();
  client.emit('tournament:organizer_adjust', { tournamentId, pairingId: activePairingId, reason: reason || undefined });
  closeModal('modal-adjust');
});
document.getElementById('btn-submit-cancel-tournament').addEventListener('click', () => {
  const reason = document.getElementById('cancel-tournament-reason-input').value.trim();
  client.emit('tournament:cancel', { tournamentId, reason: reason || undefined });
  document.getElementById('modal-cancel-tournament').classList.remove('visible');
});

// ── Standings (client-side port of standings.js's pure functions) ────────

function computeStandings() {
  const entries = tournament.entries.map((e) => ({ id: e.entryId }));
  const completed = Array.from(pairingsById.values())
    .filter((p) => p.state === 'Completed' || p.state === 'Walkover')
    .map((p) => ({
      player1: p.player1EntryId,
      player2: p.player2EntryId,
      winner: p.result ? (p.result.winnerEntryId === null ? 'draw' : p.result.winnerEntryId) : undefined,
    }));

  const score = new Map(entries.map((e) => [e.id, 0]));
  const opponents = new Map(entries.map((e) => [e.id, []]));
  for (const p of completed) {
    if (p.player2 == null) {
      if (score.has(p.player1)) score.set(p.player1, score.get(p.player1) + 1);
      continue;
    }
    if (p.winner === 'draw') {
      if (score.has(p.player1)) score.set(p.player1, score.get(p.player1) + 0.5);
      if (score.has(p.player2)) score.set(p.player2, score.get(p.player2) + 0.5);
    } else if (p.winner === p.player1 && score.has(p.player1)) {
      score.set(p.player1, score.get(p.player1) + 1);
    } else if (p.winner === p.player2 && score.has(p.player2)) {
      score.set(p.player2, score.get(p.player2) + 1);
    }
    if (opponents.has(p.player1)) opponents.get(p.player1).push(p.player2);
    if (opponents.has(p.player2)) opponents.get(p.player2).push(p.player1);
  }
  const standings = entries.map((e) => ({ id: e.id, score: score.get(e.id) || 0, opponents: opponents.get(e.id) || [] }));

  const scoreById = new Map(standings.map((s) => [s.id, s.score]));
  const resultsAgainst = new Map(standings.map((s) => [s.id, new Map()]));
  for (const p of completed) {
    if (p.player2 == null) continue;
    if (!resultsAgainst.has(p.player1) || !resultsAgainst.has(p.player2)) continue;
    if (p.winner === 'draw') {
      resultsAgainst.get(p.player1).set(p.player2, 'draw');
      resultsAgainst.get(p.player2).set(p.player1, 'draw');
    } else if (p.winner === p.player1) {
      resultsAgainst.get(p.player1).set(p.player2, 'win');
      resultsAgainst.get(p.player2).set(p.player1, 'loss');
    } else if (p.winner === p.player2) {
      resultsAgainst.get(p.player2).set(p.player1, 'win');
      resultsAgainst.get(p.player1).set(p.player2, 'loss');
    }
  }
  const tiebreaks = standings.map((s) => {
    let buchholz = 0, sonnebornBerger = 0;
    for (const [oppId, result] of resultsAgainst.get(s.id)) {
      const oppScore = scoreById.get(oppId) || 0;
      buchholz += oppScore;
      if (result === 'win') sonnebornBerger += oppScore;
      else if (result === 'draw') sonnebornBerger += oppScore / 2;
    }
    return { id: s.id, score: s.score, buchholz, sonnebornBerger };
  });

  const sorted = [...tiebreaks].sort((a, b) => b.score - a.score || b.buchholz - a.buchholz || b.sonnebornBerger - a.sonnebornBerger);
  const ranked = [];
  let rank = 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0) {
      const prev = sorted[i - 1], cur = sorted[i];
      const tied = prev.score === cur.score && prev.buchholz === cur.buchholz && prev.sonnebornBerger === cur.sonnebornBerger;
      if (!tied) rank = i + 1;
    }
    ranked.push({ ...sorted[i], rank });
  }
  return ranked;
}

// ── Cross Table (Round Robin only — TODO.md #64) ─────────────────────────
//
// Round Robin has every entry facing every other entry exactly once, so
// (unlike Swiss, whose opponents differ per player) a pairwise grid of real
// scores is more informative than a ranked list — this is the standard
// "cross table" display for round-robin events in chess/esports. Rank/
// tie-break math is untouched (computeStandings() below, Buchholz/SB is
// still correct per FIDE — see docs/todo/B63-*.md) — this only replaces how
// Round Robin RENDERS its standings; Swiss keeps the ranked-list table.

function fmtScore(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * entryId pair -> pairing, for pairings that involve exactly 2 real entries
 * (no byes). A void/replay (PairingLifecycle._createReplayPairing, Round
 * Robin/Swiss branch) creates a brand-new pairing between the same two
 * entries rather than reusing the old one, so more than one pairing can
 * exist for the same pair — keep the one with the latest `pairedAt`
 * explicitly (not whichever happens to be visited last in Map iteration
 * order, which depends on server sort order / live-patch insertion order
 * and isn't guaranteed to put the newest pairing last).
 */
function buildPairingLookup() {
  const lookup = new Map();
  for (const p of pairingsById.values()) {
    if (p.player2EntryId == null) continue; // bye — only one real player, no cell to fill
    const key = p.player1EntryId < p.player2EntryId
      ? `${p.player1EntryId}|${p.player2EntryId}`
      : `${p.player2EntryId}|${p.player1EntryId}`;
    const existing = lookup.get(key);
    if (!existing || p.pairedAt > existing.pairedAt) lookup.set(key, p);
  }
  return lookup;
}

function pairingBetween(lookup, entryIdA, entryIdB) {
  const key = entryIdA < entryIdB ? `${entryIdA}|${entryIdB}` : `${entryIdB}|${entryIdA}`;
  return lookup.get(key) || null;
}

/** Cell content for the pairing between rowEntryId and colEntryId, from rowEntryId's point of view. */
function crossTableCell(lookup, rowEntryId, colEntryId) {
  if (rowEntryId === colEntryId) return `<span class="cross-table__diag">—</span>`;

  const p = pairingBetween(lookup, rowEntryId, colEntryId);
  if (!p) return `<span class="cross-table__empty">–</span>`;
  if (p.state === 'InProgress') return `<span class="cross-table__live">${t('tdetail.cross_table_live')}</span>`;
  if (p.state !== 'Completed' && p.state !== 'Walkover') return `<span class="cross-table__empty">–</span>`;

  // Walkover has no real games played — no score to sum, show W/L instead
  // (same convention as the pairing-card state pill for walkover elsewhere).
  if (p.result && p.result.reason === 'walkover') {
    const won = p.result.winnerEntryId === rowEntryId;
    return won
      ? `<span class="cross-table__win">${t('tdetail.cross_table_walkover_win')}</span>`
      : `<span class="cross-table__loss">${t('tdetail.cross_table_walkover_loss')}</span>`;
  }

  if (p.seriesScore) {
    const mine = p.seriesScore[rowEntryId] || 0;
    const theirs = p.seriesScore[colEntryId] || 0;
    const cls = mine > theirs ? 'cross-table__win' : (mine < theirs ? 'cross-table__loss' : '');
    return `<span class="${cls}">${fmtScore(mine)}–${fmtScore(theirs)}</span>`;
  }

  // Defensive fallback (shouldn't happen — every non-bye Completed/Walkover
  // pairing has seriesScore, even single-game ones — see series.js).
  if (!p.result) return `<span class="cross-table__empty">–</span>`;
  if (p.result.winnerEntryId === null) return `<span>0.5–0.5</span>`;
  const won = p.result.winnerEntryId === rowEntryId;
  return `<span class="${won ? 'cross-table__win' : 'cross-table__loss'}">${won ? '1–0' : '0–1'}</span>`;
}

function renderCrossTable() {
  const me = myEntry();
  const ranked = computeStandings(); // rank/match-points/Buchholz/SB — unchanged, only its ORDER is now consumed for row/col layout
  const rankById = new Map(ranked.map((r) => [r.id, r]));
  const lookup = buildPairingLookup();
  // Row/col order follows current rank (leader first), not registration order —
  // both axes reuse the same `entries` array so the grid stays symmetric ([i,j]/[j,i]).
  const entriesByIdLocal = new Map(tournament.entries.map((e) => [e.entryId, e]));
  const entries = ranked.map((r) => entriesByIdLocal.get(r.id)).filter(Boolean);
  const partialNotice = tournament.status === 'cancelled'
    ? `<div class="dispute-notice"><i class="ph ph-warning" style="font-size:18px;"></i><span>${t('tdetail.standings_partial_notice')}</span></div>`
    : '';

  // Highlight Vô địch/Á quân only once the tournament is over (rank is still
  // provisional while `active`) — see TODO.md #75. Ties at rank 1 all count
  // as champions; runner-up is the first rank-2 row after any rank-1 ties.
  const isCompleted = tournament.status === 'completed';
  const championIds = isCompleted ? new Set(ranked.filter((r) => r.rank === 1).map((r) => r.id)) : new Set();
  const runnerUpIds = isCompleted ? new Set(ranked.filter((r) => r.rank === 2).map((r) => r.id)) : new Set();

  standingsContainer.innerHTML = `
    ${partialNotice}
    <div class="cross-table-wrap">
      <table class="cross-table">
        <thead>
          <tr>
            <th class="cross-table__name-col">${t('tdetail.th_player')}</th>
            ${entries.map((e) => `<th>${escapeHtml(entryName(e.entryId))}</th>`).join('')}
            <th class="cross-table__total">${t('tdetail.th_score')}</th>
            <th class="cross-table__total">#</th>
          </tr>
        </thead>
        <tbody>
          ${entries.map((rowEntry) => {
            const r = rankById.get(rowEntry.entryId);
            const isChampion = championIds.has(rowEntry.entryId);
            const isRunnerUp = !isChampion && runnerUpIds.has(rowEntry.entryId);
            const rowCls = [
              me && rowEntry.entryId === me.entryId ? 'is-me' : '',
              isChampion ? 'is-champion' : '',
              isRunnerUp ? 'is-runner-up' : '',
            ].filter(Boolean).join(' ');
            const trophyIcon = isChampion
              ? `<i class="ph ph-trophy cross-table__trophy cross-table__trophy--champion" title="${t('tdetail.cross_table_champion')}"></i>`
              : (isRunnerUp ? `<i class="ph ph-trophy cross-table__trophy cross-table__trophy--runner-up" title="${t('tdetail.cross_table_runner_up')}"></i>` : '');
            return `
              <tr class="${rowCls}">
                <th class="cross-table__name-col">${trophyIcon}${escapeHtml(entryName(rowEntry.entryId))}</th>
                ${entries.map((colEntry) => `<td>${crossTableCell(lookup, rowEntry.entryId, colEntry.entryId)}</td>`).join('')}
                <td class="cross-table__total">${r ? fmtScore(r.score) : '0'}</td>
                <td class="cross-table__total">${r ? r.rank : '—'}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderStandings() {
  if (tournament.format === 'double_elim') {
    standingsContainer.innerHTML = `
      <div class="empty-tournaments">
        <span class="room-list__empty-text">${t('tdetail.no_standings_bracket')}</span>
      </div>
    `;
    return;
  }

  if (tournament.format === 'round_robin') {
    renderCrossTable();
    return;
  }

  const me = myEntry();
  const ranked = computeStandings();
  const partialNotice = tournament.status === 'cancelled'
    ? `<div class="dispute-notice"><i class="ph ph-warning" style="font-size:18px;"></i><span>${t('tdetail.standings_partial_notice')}</span></div>`
    : '';
  standingsContainer.innerHTML = `
    ${partialNotice}
    <table class="standings-table">
      <thead>
        <tr>
          <th>#</th><th>${t('tdetail.th_player')}</th>
          <th style="text-align:right;">${t('tdetail.th_score')}</th>
          <th style="text-align:right;">${t('tdetail.th_buchholz')}</th>
          <th style="text-align:right;">${t('tdetail.th_sb')}</th>
        </tr>
      </thead>
      <tbody>
        ${ranked.map((row) => `
          <tr class="${me && row.id === me.entryId ? 'is-me' : ''}">
            <td class="rank-cell">${row.rank}</td>
            <td class="name-cell">${escapeHtml(entryName(row.id))}</td>
            <td class="num-cell">${row.score.toFixed(1)}</td>
            <td class="num-cell">${row.buchholz.toFixed(1)}</td>
            <td class="num-cell">${row.sonnebornBerger.toFixed(1)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ── Games History (TODO.md #78) ─────────────────────────────────────────

let gamesHistory = null; // cached last-fetched list, re-rendered on langchange without refetching
let gamesPagination = null; // cached last-fetched pagination, re-rendered on langchange without refetching
let currentGamesPage = 1;

const GAME_REASON_KEY = {
  normal: 'history.reason_normal',
  resign: 'game.btn_resign',
  timeout: 'history.reason_timeout',
  draw_agreement: 'history.reason_draw_agreement',
  board_full: 'history.reason_board_full',
};

function gameResultText(g) {
  const reason = GAME_REASON_KEY[g.reason] ? t(GAME_REASON_KEY[g.reason]) : (g.reason || '');
  if (!g.winner || g.winner === 'draw') {
    return reason ? `${t('history.result_draw')} — ${reason}` : t('history.result_draw');
  }
  const name = g.winner === 'BLACK' ? g.black_player_name : g.white_player_name;
  return reason ? `${t('history.x_won', { name })} — ${reason}` : t('history.x_won', { name });
}

function gameMatchLabel(g) {
  const pairing = pairingsById.get(g.pairing_id);
  if (!pairing) return '—';
  return tournament.format === 'double_elim'
    ? (pairing.bracketMatchId || '—')
    : (pairing.roundIndex != null ? `${t('tdetail.round_word')} ${pairing.roundIndex}` : '—');
}

async function loadGamesHistory(page = 1) {
  gamesContainer.innerHTML = `<div class="empty-tournaments"><span class="room-list__empty-text">${t('history.loading')}</span></div>`;
  try {
    const res = await fetch(`/api/tournaments/${encodeURIComponent(tournamentId)}/games?page=${page}&limit=20`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'load failed');
    currentGamesPage = page;
    gamesHistory = data.games;
    gamesPagination = data.pagination;
    renderGamesHistory();
  } catch (err) {
    gamesContainer.innerHTML = `<div class="empty-tournaments"><span class="room-list__empty-text">${t('tdetail.games_load_error')}</span></div>`;
  }
}

function renderGamesHistory() {
  if (!gamesHistory) return;
  if (gamesHistory.length === 0) {
    gamesContainer.innerHTML = `
      <div class="empty-tournaments">
        <span class="room-list__empty-text">${t('tdetail.games_empty')}</span>
      </div>
    `;
    return;
  }

  gamesContainer.innerHTML = `
    <table class="standings-table">
      <thead>
        <tr>
          <th>${t('tdetail.games_th_match')}</th>
          <th>${t('tdetail.games_th_players')}</th>
          <th>${t('tdetail.games_th_result')}</th>
          <th>${t('tdetail.games_th_ended')}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${gamesHistory.map((g) => `
          <tr>
            <td>${escapeHtml(gameMatchLabel(g))}</td>
            <td class="name-cell">${escapeHtml(g.black_player_name)} vs ${escapeHtml(g.white_player_name)}</td>
            <td>${escapeHtml(gameResultText(g))}</td>
            <td>${escapeHtml(formatDateTime(g.ended_at))}</td>
            <td><a class="btn-replay" href="history.html?id=${escapeAttr(g.id)}&source=tournament">${t('tdetail.games_btn_replay')}</a></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div class="pagination" id="games-pagination"></div>
  `;
  renderGamesPagination();
}

function renderGamesPagination() {
  const el = document.getElementById('games-pagination');
  if (!el || !gamesPagination) return;
  const p = gamesPagination;
  if (p.totalPages <= 1) { el.innerHTML = ''; return; }

  let html = `<button type="button" data-page="${p.page - 1}" ${p.page <= 1 ? 'disabled' : ''}>‹</button>`;
  for (let i = 1; i <= p.totalPages; i++) {
    if (p.totalPages > 7 && Math.abs(i - p.page) > 2 && i !== 1 && i !== p.totalPages) {
      if (i === 2 || i === p.totalPages - 1) html += '<button type="button" disabled>…</button>';
      continue;
    }
    html += `<button type="button" class="${i === p.page ? 'active' : ''}" data-page="${i}">${i}</button>`;
  }
  html += `<button type="button" data-page="${p.page + 1}" ${p.page >= p.totalPages ? 'disabled' : ''}>›</button>`;
  el.innerHTML = html;

  el.querySelectorAll('button[data-page]:not([disabled])').forEach((btn) => {
    btn.addEventListener('click', () => loadGamesHistory(parseInt(btn.dataset.page, 10)));
  });
}

// ── Render orchestration ─────────────────────────────────────────────────

function renderAll() {
  if (!tournament) return;
  renderHeader();
  renderActionBanner();
  renderPairings();
  renderStandings();
}

window.addEventListener('langchange', () => {
  renderAll();
  if (gamesHistory) renderGamesHistory();
});
