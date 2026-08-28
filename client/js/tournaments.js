'use strict';

/**
 * tournaments.js — "Giải đấu" (Tournaments) tab controller.
 *
 * Responsibilities:
 *   - Section tab switching (Bàn chơi / Giải đấu), reusing lobby.js's markup
 *   - Render the live tournament list (tournament:list / tournament:list_patch)
 *   - Create-tournament modal → tournament:create
 *   - Register / Unregister → tournament:register / tournament:unregister
 *   - Organizer "Start" button → tournament:start
 *
 * Reuses the SAME SocketClient instance as lobby.js (imported, not a second
 * connection — see lobby.js's `client` export comment).
 *
 * Scope decision (Phase 5, TODO.md #48 / instruction.md B48): this wires up
 * exactly what the approved mockup (client/tables-tournaments-mockup.html)
 * shows — the lobby-level tab + card list + create/register flow. It does
 * NOT include a tournament detail/bracket/standings page, or the pairing-
 * scheduling UI (report/confirm/dispute match time, ready check-in) or a
 * match-play board for `tmatch:*` events — none of that was ever mocked, so
 * building it now would be un-reviewed UI design, not "wiring the mockup
 * in". That's tracked as follow-up work rather than half-built here.
 *
 * Manual test checklist:
 *   [ ] Tab switch shows/hides the right panel, updates aria-selected
 *   [ ] Tournament list renders from tournament:list, updates on tournament:list_patch
 *   [ ] Status/format filters narrow the visible cards
 *   [ ] Create-tournament modal opens/closes; tournament:create emits the right payload
 *   [ ] Register/Unregister buttons emit the right events and reflect entryUserIds
 *   [ ] Organizer sees a Start button once playerCount >= 2, while status is draft
 *   [ ] tournament:error shows an alert
 *   [ ] Live matches panel (TODO.md #60) shows/hides with the live-matches
 *       list, updates on live_matches:list, row click navigates to the match
 */

import { client, setHeroTab, setHeroTournamentCount } from './lobby.js?v=167';

// ---------------------------------------------------------------------------
// Element refs
// ---------------------------------------------------------------------------
const tabTables        = document.getElementById('tab-tables');
const tabTournaments    = document.getElementById('tab-tournaments');
const panelTables       = document.getElementById('panel-tables');
const panelTournaments  = document.getElementById('panel-tournaments');
const tournamentListEl  = document.getElementById('tournament-list');
const btnCreateTournament = document.getElementById('btn-create-tournament');
const modalOverlay  = document.getElementById('modal-create-tournament');
const modalClose    = document.getElementById('modal-tournament-close');
const modalCancel   = document.getElementById('modal-tournament-cancel');
const modalConfirm  = document.getElementById('modal-tournament-confirm');
const formatFilterSelect = document.getElementById('tournament-format-filter');
const liveMatchesPanelEl = document.getElementById('live-matches-panel');
const liveMatchesListEl  = document.getElementById('live-matches-list');

const escapeAttr = (str) => globalThis.EscapeUtils.escapeAttr(str);

// Live view of the session identity (TODO.md #68).
//
// Deliberately an object of getters rather than a snapshot: identity now
// arrives from the server as `session:me` shortly AFTER this module runs, so
// a value captured here would be null on the first load following the
// migration and would never update. Every `currentUser.userId` / `.displayName`
// read below therefore stays live, with no re-assignment plumbing. Use
// `currentUser.signedIn` where the old code tested the snapshot for truthiness —
// this object itself is always truthy.
const currentUser = {
  get signedIn()    { return !!window.GvnSession.getUser(); },
  get userId()      { const u = window.GvnSession.getUser(); return u ? u.userId : null; },
  get displayName() { const u = window.GvnSession.getUser(); return u ? u.displayName : ''; },
  get isGuest()     { const u = window.GvnSession.getUser(); return !!(u && u.isGuest); },
};

let tournamentMap = new Map(); // tournamentId → summary (see TournamentManager.listTournaments)
let activeStatusFilter = 'all'; // 'all' | 'draft' | 'active' | 'completed'
let activeFormatFilter = '';    // '' | 'swiss' | 'round_robin' | 'double_elim'

// ---------------------------------------------------------------------------
// Tab switching
// ---------------------------------------------------------------------------

function activateTab(name) {
  const isTables = name === 'tables';
  tabTables.classList.toggle('is-active', isTables);
  tabTables.setAttribute('aria-selected', String(isTables));
  tabTournaments.classList.toggle('is-active', !isTables);
  tabTournaments.setAttribute('aria-selected', String(!isTables));
  panelTables.classList.toggle('is-active', isTables);
  panelTournaments.classList.toggle('is-active', !isTables);
  // The hero sentence above the tabs is shared by both panels — lobby.js owns
  // it and swaps the copy when the tab changes (Zen Minimal layout).
  setHeroTab(isTables ? 'tables' : 'tournaments');
}

tabTables.addEventListener('click', () => activateTab('tables'));
tabTournaments.addEventListener('click', () => activateTab('tournaments'));

// Honor `?tab=tournaments` so links back from the tournament detail page
// (tournament.html's "Quay lại danh sách giải đấu") land on the right tab
// instead of always falling back to the markup's default "Bàn chơi" tab.
const requestedTab = new URLSearchParams(location.search).get('tab');
if (requestedTab === 'tournaments') {
  activateTab('tournaments');
  history.replaceState(null, '', location.pathname);
}

// ---------------------------------------------------------------------------
// Subscribe to the tournament list (unconditionally on load, same as
// lobby.js's own lobby:subscribe — the list is a lightweight summary array,
// not worth gating behind first tab click).
// ---------------------------------------------------------------------------
client.emit('tournament:subscribe');

client.on('tournament:list', (data) => {
  tournamentMap = new Map((data.tournaments || []).map((t) => [t.tournamentId, t]));
  renderTournamentList();
});

client.on('tournament:list_patch', (data) => {
  for (const tournamentId of data.removed || []) tournamentMap.delete(tournamentId);
  for (const t of data.upserts || []) tournamentMap.set(t.tournamentId, t);
  renderTournamentList();
});

client.on('tournament:error', (data) => {
  alert(data.code ? t('err.' + data.code.toLowerCase()) : data.message);
});

// ---------------------------------------------------------------------------
// Live matches browser (TODO.md #60) — cross-tournament "what's live right
// now" discovery list, so a visitor doesn't have to already be on one
// specific tournament's detail page to find a match to watch. Subscribed
// unconditionally on load, same rationale as tournament:subscribe above.
// ---------------------------------------------------------------------------
client.emit('live_matches:subscribe');

client.on('live_matches:list', (data) => {
  renderLiveMatches(data.matches || []);
});

function renderLiveMatches(matches) {
  if (matches.length === 0) {
    liveMatchesPanelEl.style.display = 'none';
    liveMatchesListEl.innerHTML = '';
    return;
  }
  liveMatchesPanelEl.style.display = '';
  liveMatchesListEl.innerHTML = matches.map(renderLiveMatchRow).join('');
  liveMatchesListEl.querySelectorAll('[data-live-match]').forEach((row) => {
    row.addEventListener('click', () => {
      const { tournamentId, pairingId } = row.dataset;
      // Same navigation as tournament-detail.js's goToMatch(pairingId) — not
      // imported directly, since that module is scoped to tournament.html's
      // single-tournament page (reads its own module-level `tournamentId`,
      // nothing exported), and importing it here would run page-specific
      // code expecting tournament.html's DOM (docs/instruction/B60-*.md).
      window.location.href = `tournament-match.html?tournamentId=${encodeURIComponent(tournamentId)}&pairingId=${encodeURIComponent(pairingId)}`;
    });
  });
}

function renderLiveMatchRow(match) {
  const p1 = match.player1 ? escapeHtml(match.player1.displayName) : '—';
  const p2 = match.player2 ? escapeHtml(match.player2.displayName) : '—';
  const gameIndexLabel = (match.series && match.series.seriesMode !== 'single')
    ? `<span><svg class="icon"><use href="assets/icons/phosphor-sprite.svg?v=167#ph-regular-repeat"></use></svg>${t('live_matches.game_index', { n: match.series.gameIndex + 1 })}</span>`
    : '';
  return `
    <div class="live-match-row" data-live-match data-tournament-id="${escapeAttr(match.tournamentId)}" data-pairing-id="${escapeAttr(match.pairingId)}">
      <div class="live-match-row__tournament">${escapeHtml(match.tournamentName)}</div>
      <div class="live-match-row__players">${p1} <span class="live-match-row__vs">vs</span> ${p2}</div>
      <div class="live-match-row__meta">
        ${gameIndexLabel}
        <span><svg class="icon"><use href="assets/icons/phosphor-sprite.svg?v=167#ph-regular-eye"></use></svg>${t('live_matches.spectators', { n: match.spectatorCount })}</span>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

document.querySelectorAll('#panel-tournaments .filter-pill').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#panel-tournaments .filter-pill').forEach((b) => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    activeStatusFilter = btn.dataset.filter;
    renderTournamentList();
  });
});

if (formatFilterSelect) {
  formatFilterSelect.addEventListener('change', () => {
    activeFormatFilter = formatFilterSelect.value;
    renderTournamentList();
  });
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function formatLabel(format) {
  if (format === 'swiss') return t('tournaments.format_swiss');
  if (format === 'round_robin') return t('tournaments.format_round_robin');
  if (format === 'double_elim') return t('tournaments.format_double_elim_short');
  return format;
}

function statusBadge(status) {
  if (status === 'active') return { cls: 'badge--live', label: t('tournaments.filter_active') };
  if (status === 'completed') return { cls: 'badge--done', label: t('tournaments.filter_done') };
  if (status === 'cancelled') return { cls: 'badge--done', label: t('tournaments.status_cancelled') };
  return { cls: 'badge--upcoming', label: t('tournaments.filter_upcoming') };
}

function renderTournamentList() {
  let tournaments = Array.from(tournamentMap.values());
  if (activeStatusFilter !== 'all') tournaments = tournaments.filter((t) => t.status === activeStatusFilter);
  if (activeFormatFilter) tournaments = tournaments.filter((t) => t.format === activeFormatFilter);

  // The old #tournament-count pill is gone with the Zen header — the total
  // now reads in the shared hero sentence instead. Counted before the
  // filters are applied, so the sentence describes the tab, not the filter.
  setHeroTournamentCount(tournamentMap.size);

  if (tournaments.length === 0) {
    tournamentListEl.innerHTML = `
      <div class="empty-tournaments">
        <span class="room-list__empty-text">${t('tournaments.no_tournaments')}</span>
        <span class="room-list__empty-sub">${t('tournaments.no_tournaments_sub')}</span>
      </div>
    `;
    return;
  }

  let html = '';
  let i = 0;
  for (const tournament of tournaments) {
    html += renderCard(tournament, i);
    i++;
  }
  tournamentListEl.innerHTML = html;

  tournamentListEl.querySelectorAll('[data-action="register"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      client.emit('tournament:register', { tournamentId: btn.dataset.tournamentId });
    });
  });
  tournamentListEl.querySelectorAll('[data-action="unregister"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      client.emit('tournament:unregister', { tournamentId: btn.dataset.tournamentId });
    });
  });
  tournamentListEl.querySelectorAll('[data-action="start"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      client.emit('tournament:start', { tournamentId: btn.dataset.tournamentId });
    });
  });
  tournamentListEl.querySelectorAll('[data-action="cancel_tournament"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm(t('tournaments.confirm_cancel'))) return;
      client.emit('tournament:cancel', { tournamentId: btn.dataset.tournamentId });
    });
  });

  // Whole-card click/Enter opens the detail page (Phase 6) — action buttons
  // above already stopPropagation() so this never double-fires on them.
  tournamentListEl.querySelectorAll('[data-open-detail]').forEach((card) => {
    const open = () => { window.location.href = `tournament.html?id=${encodeURIComponent(card.dataset.openDetail)}`; };
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });
}

function renderCard(tournament, index) {
  const isOrganizer = currentUser.signedIn && tournament.organizerId === currentUser.userId;
  const isRegistered = currentUser.signedIn && (tournament.entryUserIds || []).includes(currentUser.userId);
  const badge = statusBadge(tournament.status);
  const animDelay = (index * 0.05).toFixed(2);

  // Your own relationship to this tournament — the one segment worth setting
  // apart from the rest of the meta line, so it keeps its own span.
  let statusLine;
  if (isOrganizer) {
    statusLine = `<span class="tournament-card__status tournament-card__status--registered"><svg class="icon"><use href="assets/icons/phosphor-sprite.svg?v=167#ph-regular-crown-simple"></use></svg>${t('tournaments.status_organizer')}</span>`;
  } else if (isRegistered) {
    statusLine = `<span class="tournament-card__status tournament-card__status--registered"><svg class="icon"><use href="assets/icons/phosphor-sprite.svg?v=167#ph-regular-check-circle"></use></svg>${t('tournaments.status_registered')}</span>`;
  } else if (tournament.status === 'draft') {
    statusLine = `<span class="tournament-card__status tournament-card__status--waiting"><svg class="icon"><use href="assets/icons/phosphor-sprite.svg?v=167#ph-regular-user-plus"></use></svg>${t('tournaments.status_open')}</span>`;
  } else {
    statusLine = '';
  }

  let actionButtons = '';
  if (tournament.status === 'draft') {
    if (isOrganizer) {
      if (tournament.playerCount >= 2) {
        actionButtons += `<button class="btn btn-confirm" type="button" data-action="start" data-tournament-id="${escapeAttr(tournament.tournamentId)}">${t('tournaments.btn_start')}</button>`;
      }
    } else if (isRegistered) {
      actionButtons += `<button class="btn-secondary" type="button" data-action="unregister" data-tournament-id="${escapeAttr(tournament.tournamentId)}">${t('tournaments.btn_unregister')}</button>`;
    } else {
      actionButtons += `<button class="btn btn-confirm" type="button" data-action="register" data-tournament-id="${escapeAttr(tournament.tournamentId)}">${t('tournaments.btn_register')}</button>`;
    }
  }
  // Cancel is its own, broader gate than Start's ('draft' only) — an
  // organizer can cancel at any point before natural completion, i.e. also
  // while 'active' (TODO.md #59).
  if (isOrganizer && (tournament.status === 'draft' || tournament.status === 'active')) {
    actionButtons += `<button class="btn-secondary btn-secondary--danger" type="button" data-action="cancel_tournament" data-tournament-id="${escapeAttr(tournament.tournamentId)}">${t('tournaments.btn_cancel')}</button>`;
  }
  const actions = actionButtons ? `<div class="tournament-card__actions">${actionButtons}</div>` : '';

  // One row, one meta line — the same shape the room list uses, so the two
  // tabs read as one screen. Every field the stacked card carried is still
  // here, middot-joined instead of stacked (each segment escaped on its own).
  const meta = [
    formatLabel(tournament.format),
    badge.label,
    `${tournament.playerCount} ${t('tournaments.players_suffix')}`,
    t('tournaments.organized_by', { name: escapeHtml(tournament.organizerName || '—') }),
  ].join(' · ');

  return `
    <div class="tournament-card animate-fade-up" style="animation-delay: ${animDelay}s" data-tournament-id="${escapeAttr(tournament.tournamentId)}" data-open-detail="${escapeAttr(tournament.tournamentId)}" tabindex="0" role="link" aria-label="${escapeAttr(tournament.name)}">
      <div class="tournament-card__top">
        <span class="tournament-card__name">${escapeHtml(tournament.name)}</span>
        ${actions}
      </div>
      <div class="tournament-card__meta">${meta}${statusLine ? ` · ${statusLine}` : ''}</div>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

window.addEventListener('langchange', renderTournamentList);

// ---------------------------------------------------------------------------
// Create Tournament Modal
// ---------------------------------------------------------------------------

function openCreateModal() {
  modalOverlay.classList.add('visible');
}
function closeCreateModal() {
  modalOverlay.classList.remove('visible');
}

btnCreateTournament.addEventListener('click', openCreateModal);
modalClose.addEventListener('click', closeCreateModal);
modalCancel.addEventListener('click', closeCreateModal);
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeCreateModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalOverlay.classList.contains('visible')) closeCreateModal();
});

function readTournamentFormat() {
  return document.querySelector('input[name="tFormat"]:checked').value;
}

function readTournamentRuleSet() {
  const boardSize = parseInt(document.querySelector('input[name="tBoardSize"]:checked').value, 10);
  const timerMode = document.querySelector('input[name="tTimerMode"]:checked').value;
  const timerSeconds = parseInt(document.getElementById('t-timer-seconds').value, 10) || 60;
  const timerIncrementSeconds = timerMode === 'blitz'
    ? (parseInt(document.getElementById('t-timer-increment').value, 10) || 0)
    : 0;
  const winningRule = (document.querySelector('input[name="tWinRule"]:checked') || {}).value || 'freestyle';
  const ruleSwap2   = (document.querySelector('input[name="tOpenRule"]:checked') || {}).value === 'swap2';
  let   ruleWall    = document.getElementById('t-rule-wall').checked;
  let   rulePortal  = document.getElementById('t-rule-portal').checked;
  if (ruleSwap2) { ruleWall = false; rulePortal = false; }
  const hours = parseInt(document.getElementById('t-scheduling-hours').value, 10) || 48;

  const seriesMode = (document.querySelector('input[name="tSeriesMode"]:checked') || {}).value || 'single';
  let seriesGameCount = null;
  let seriesTargetScore = null;
  let seriesMargin = null;
  if (seriesMode === 'fixedCount') {
    seriesGameCount = parseInt(document.getElementById('t-series-game-count').value, 10);
  } else if (seriesMode === 'raceToMargin') {
    seriesTargetScore = parseInt(document.getElementById('t-series-target').value, 10);
    seriesMargin = parseInt(document.getElementById('t-series-margin').value, 10);
  }

  return {
    boardSize, winningRule, ruleWall, rulePortal, ruleSwap2,
    timerMode, timerSeconds, timerIncrementSeconds,
    schedulingWindowMs: hours * 60 * 60 * 1000,
    seriesMode, seriesGameCount, seriesTargetScore, seriesMargin,
  };
}

modalConfirm.addEventListener('click', () => {
  const name = document.getElementById('tournament-name').value.trim();
  const ruleSet = readTournamentRuleSet();

  // Client-side validation (backend already falls back to 'single' safely on
  // bad input — this just stops the organizer from silently getting 'single'
  // when they meant to configure a series, per docs/todo/B53-*.md).
  if (ruleSet.seriesMode === 'fixedCount'
      && !(Number.isInteger(ruleSet.seriesGameCount) && ruleSet.seriesGameCount >= 2)) {
    alert(t('tournaments.series_validation_count'));
    return;
  }
  if (ruleSet.seriesMode === 'raceToMargin'
      && !(ruleSet.seriesTargetScore > 0 && ruleSet.seriesMargin > 0)) {
    alert(t('tournaments.series_validation_race'));
    return;
  }

  client.emit('tournament:create', {
    name: name || undefined,
    format: readTournamentFormat(),
    ruleSet,
  });
  closeCreateModal();
});

// Swap2 (opening rule) is played on a plain board → disable & clear board setup.
// Mirrors lobby.js's identical interlock for the room-create modal.
(function () {
  const sync = () => {
    const swap2 = document.getElementById('tor-swap2');
    const disabled = !!(swap2 && swap2.checked);
    ['t-rule-wall', 't-rule-portal'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (disabled) el.checked = false;
      el.disabled = disabled;
      const trow = el.closest('.toggle-row');
      if (trow) trow.style.opacity = disabled ? '0.45' : '';
    });
  };
  document.querySelectorAll('input[name="tOpenRule"]').forEach((r) => r.addEventListener('change', sync));
  sync();
})();

// Timer increment only takes effect in Blitz mode — disable & gray it out otherwise.
(function () {
  const sync = () => {
    const blitz = document.getElementById('ttm-blitz');
    const active = !!(blitz && blitz.checked);
    const el = document.getElementById('t-timer-increment');
    if (!el) return;
    if (!active) el.value = 0;
    el.disabled = !active;
    const row = document.getElementById('t-timer-increment-row');
    if (row) row.style.opacity = active ? '' : '0.45';
  };
  document.querySelectorAll('input[name="tTimerMode"]').forEach((r) => r.addEventListener('change', sync));
  sync();
})();

// Series mode (TODO.md #53) — show the game-count input only in "fixedCount",
// the target/margin inputs only in "raceToMargin".
(function () {
  const rowCount  = document.getElementById('t-series-count-row');
  const rowRace   = document.getElementById('t-series-race-row');
  const rowMargin = document.getElementById('t-series-margin-row');
  const sync = () => {
    const mode = (document.querySelector('input[name="tSeriesMode"]:checked') || {}).value || 'single';
    rowCount.style.display = mode === 'fixedCount' ? '' : 'none';
    rowRace.style.display = mode === 'raceToMargin' ? '' : 'none';
    rowMargin.style.display = mode === 'raceToMargin' ? '' : 'none';
  };
  document.querySelectorAll('input[name="tSeriesMode"]').forEach((r) => r.addEventListener('change', sync));
  sync();
})();
