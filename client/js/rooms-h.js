'use strict';

/**
 * rooms-h.js — the Phòng screen, direction H (#440, features/rooms-redesign-v4/h-hai-cot.html).
 *
 *   sticky stats bar (online, playing, "Xem người online" on phones, "Mở bàn")
 *   desktop: online roster rail (rank in the selected rule, search, groups, "Tải thêm"), collapsible to faces
 *   rule tabs Luật 1 / Luật 2 / Tiêu chuẩn / Renju (+ table counts) and "Luật chơi" (RoomRulesGuide)
 *   sort → compact table cards (card v3)
 *
 * Data (#439): `lobby:subscribe {rule}` mirrors one page of that rule's tables (snapshot + patches, stats on
 * every message); `lobby:rooms_query` pages / sorts on the server (one-off copies: held cards are
 * still updated in place by patches); `lobby:online_query {rule, q, offset}` = roster in rank order.
 * The subscribe itself lives in lobby-home.js (screen visibility); a tab switch fires `rooms:rule` on window.
 *
 * Window API: RoomsH.create({ root, client, t, avatar, icon, me, joinRoom, openCreate, storage })
 *   avatar(url, name, cls) / icon(name) → HTML string; me() → { userId, isGuest }; joinRoom(roomId);
 *   openCreate(rule).
 * Returns { rule(), setOnline(total), refreshRoster(), render() }.
 */
(function (global) {
  const RULES = ['freestyle', 'caro', 'standard', 'renju']; // tab order = the create-room rule select
  const SORTS = ['state', 'rank', 'time'];
  const RULE_KEY = 'gvn_rooms_rule';
  const ROSTER_REFRESH_MS = 1500;  // online patches arrive debounced 1.5 s server-side
  const QUERY_DEBOUNCE_MS = 300;   // sort changes → one rooms_query (server throttles at 200 ms)
  const SEARCH_DEBOUNCE_MS = 250;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  /** 'live' (game running), 'open' (a seat to take), 'ready' (both seated, not started). */
  function cardKind(room) {
    if (room.state === 'playing') return 'live';
    return room.playerCount >= 2 ? 'ready' : 'open';
  }
  const watchersOf = (room) => Math.max(0, (room.userCount || 0) - (room.playerCount || 0));
  const codeOf = (room) => { const id = String(room.roomId || ''); return id.startsWith('#') ? id : '#' + id; };

  /** "5 phút + 5 giây", "1 phút/nước", "90 giây/nước", "3 phút". */
  function timeText(room, t) {
    const s = Number(room.timerSeconds);
    if (!Number.isFinite(s)) return '';
    const amount = (x) => (x % 60 === 0 ? t('rooms.min', { n: x / 60 }) : t('rooms.sec', { n: x }));
    if (room.timerMode === 'per_move') return t('rooms.per_move', { t: amount(s) });
    const inc = room.timerMode === 'blitz' ? Number(room.timerIncrementSeconds) || 0 : 0;
    return inc ? t('rooms.plus', { a: amount(s), b: t('rooms.sec', { n: inc }) }) : amount(s);
  }

  /** Seat Elo in the table's rule (card v3): "1890", "1203?", "Mới" (member, no rated game), "Khách". */
  function eloChip(p, t) {
    if (p.isGuest) return `<span class="ve ve--none">${esc(t('rooms.guest'))}</span>`;
    if (!Number.isFinite(p.rating)) return `<span class="ve ve--none" title="${esc(t('rooms.elo_new_tip'))}">${esc(t('rooms.elo_new'))}</span>`;
    return p.provisional
      ? `<span class="ve ve--prov" title="${esc(t('rooms.prov_tip'))}">${p.rating}?</span>`
      : `<span class="ve">${p.rating}</span>`;
  }

  /** Roster standing in a rule from the #439 wire shape `ratings: { rule: [rating, rank|null, provisional] }`. */
  function standingOf(u, rule) {
    if (!u || u.isGuest || !u.ratings) return null;
    const s = u.ratings[rule];
    return Array.isArray(s) ? { rating: s[0], rank: s[1], prov: !!s[2] } : null;
  }
  /** Group as the server orders the roster (_rosterCmp): ranked → no rank here → guests. */
  function groupOf(u, rule) {
    if (u.isGuest) return 'g';
    const s = standingOf(u, rule);
    return s && s.rank != null ? 'r' : 'n';
  }

  function create(opts) {
    const { root, client, t } = opts;
    const avatar = opts.avatar || (() => '');
    const icon = opts.icon || (() => '');
    const me = opts.me || (() => ({}));
    const storage = opts.storage || (() => { try { return global.localStorage; } catch (e) { return null; } })();
    const $ = (id) => root.querySelector('#' + id);

    let rule = (() => { try { const r = storage && storage.getItem(RULE_KEY); return RULES.includes(r) ? r : 'freestyle'; } catch (e) { return 'freestyle'; } })();
    let tab = rule;                       // a rule id, or 'rules'
    let sort = 'state';
    let stats = null;                     // last stats of this rule's channel ({rooms, open, live, watch, playing, byRule})
    let rooms = new Map();                // what the grid shows, in order
    let matched = null;                   // sorted mode: how many tables match on the server
    let querySeq = 0;
    let queryTimer = null;
    let moreBusy = false;
    let awaiting = false;                 // a tab / sort change is waiting for its first answer: draw no "empty" yet
    let rosterStale = false;              // presence changed while no roster was on screen (phone, sheet closed)
    let onlineTotal = 0;
    const roster = { users: [], total: 0, matched: 0, q: '', seq: 0, busy: false, extra: false };
    let rosterTimer = null;
    let searchTimer = null;
    let sheetReturn = null;

    const sorted = () => sort !== 'state';  // a non-default order is asked from the server
    const ruleLabel = (r = rule) => t('rule.' + r);

    // ── Counts ────────────────────────────────────────────────────────────
    const setText = (el, s) => { if (el && el.textContent !== String(s)) el.textContent = String(s); };
    function renderCounts() {
      setText($('rooms-n-online'), onlineTotal);
      setText($('rooms-n-playing'), stats && Number.isFinite(stats.playing) ? stats.playing : 0);
      for (const r of RULES) {
        const n = stats && stats.byRule && stats.byRule[r] ? stats.byRule[r].total : 0;
        const badge = root.querySelector(`.vtab[data-tab="${r}"] .vtab__n`);
        if (badge) { setText(badge, n); badge.setAttribute('aria-label', t('rooms.tab_count', { n })); }
      }
      renderMore();
    }

    // ── Tabs ──────────────────────────────────────────────────────────────
    function renderTabs() {
      const el = $('rooms-tabs');
      el.innerHTML = RULES.map((r) => {
        const on = tab === r;
        return `<button type="button" class="vtab" role="tab" id="rtab-${r}" data-tab="${r}" aria-selected="${on}" aria-controls="rooms-main" tabindex="${on ? 0 : -1}">`
          + `${esc(ruleLabel(r))}<span class="vtab__n">0</span></button>`;
      }).join('')
        + `<button type="button" class="vtab vtab--guide" role="tab" id="rtab-rules" data-tab="rules" aria-selected="${tab === 'rules'}" aria-controls="rooms-rules" tabindex="${tab === 'rules' ? 0 : -1}">${icon('ph-regular-scales')}${esc(t('lobby.rh_rules'))}</button>`;
      renderCounts();
    }
    function selectTab(id, { focus = false } = {}) {
      const rulesTab = id === 'rules';
      const ruleChanged = !rulesTab && id !== rule;
      tab = id;
      if (ruleChanged) {
        rule = id;
        try { if (storage) storage.setItem(RULE_KEY, rule); } catch (e) { /* private mode */ }
        rooms = new Map(); matched = null; querySeq++; awaiting = true;
        roster.users = []; roster.extra = false; roster.seq++;
      }
      renderTabs();
      $('rooms-main').hidden = rulesTab;
      $('rooms-rules').hidden = !rulesTab;
      if (rulesTab) renderGuide();
      else renderGrid();
      renderRail();
      if (focus) { const b = root.querySelector(`.vtab[data-tab="${id}"]`); if (b) b.focus(); }
      // lobby-home.js re-subscribes to the new rule's channel; its snapshot repaints the grid and roster.
      if (ruleChanged) global.dispatchEvent(new CustomEvent('rooms:rule', { detail: { rule } }));
    }
    function renderGuide() {
      if (global.RoomRulesGuide) global.RoomRulesGuide.render($('rooms-rules'), { t, active: [rule], badgeKey: 'guide.selected' });
    }

    // ── Sort ──────────────────────────────────────────────────────────────
    function renderSort() {
      $('rooms-sort').innerHTML = SORTS.map((s) => `<option value="${s}"${s === sort ? ' selected' : ''}>${esc(t('rooms.sort_' + s))}</option>`).join('');
    }
    /** Sort changed: a non-default order asks the server; back to default waits for a fresh snapshot. */
    function refetch() {
      rooms = new Map(); matched = null; querySeq++; awaiting = true;
      renderGrid();
      clearTimeout(queryTimer);
      queryTimer = setTimeout(() => queryRooms(0), QUERY_DEBOUNCE_MS);
    }
    function queryPayload(offset) {
      const p = { rule, offset };
      if (sort !== 'state') p.sort = sort;
      return p;
    }
    /** One page of the rule's tables from `offset`; offset 0 replaces the grid, later pages append. */
    function queryRooms(offset, retry = true) {
      const seq = ++querySeq;
      const want = rule;
      if (offset > 0) { moreBusy = true; renderMore(); }
      client.emitAck('lobby:rooms_query', queryPayload(offset), 5000, (err, res) => {
        if (seq !== querySeq || want !== rule) return; // a later tab / filter change owns the grid now
        moreBusy = false;
        if (!err && res && res.error === 'RATE_LIMITED' && retry) { setTimeout(() => { if (seq === querySeq) queryRooms(offset, false); }, 300); return; }
        if (err || !res || !Array.isArray(res.rooms)) { renderMore(); return; }
        if (res.stats) stats = res.stats;
        if (sorted()) matched = Number.isFinite(res.matched) ? res.matched : null;
        if (offset === 0) { rooms = new Map(); awaiting = false; }
        const fresh = res.rooms.filter((r) => r.winningRule === rule && !rooms.has(r.roomId));
        for (const r of fresh) rooms.set(r.roomId, r);
        if (offset === 0) renderGrid(); else appendCards(fresh);
        renderCounts();
      });
    }

    // ── Cards (card v3) ───────────────────────────────────────────────────
    function seatHtml(p) {
      if (!p) return `<li class="h-seat h-seat--empty"><span class="h-seat__hole" aria-hidden="true"></span><span class="h-seat__n">${esc(t('lobby.seat_empty'))}</span></li>`;
      return `<li class="h-seat">${avatar(p.avatarUrl, p.displayName, 'pav--xs')}<span class="h-seat__n">${esc(p.displayName)}</span>${eloChip(p, t)}</li>`;
    }
    function cardInner(room) {
      const kind = cardKind(room);
      const code = codeOf(room);
      const w = watchersOf(room);
      const eye = w ? `<span class="h-card__eye" title="${esc(t('lobby.card_watchers', { n: w }))}">${icon('ph-regular-eye')}<span>${w}</span><span class="sr-only"> ${esc(t('rooms.viewers'))}</span></span>` : '';
      const seats = Array.isArray(room.players) ? room.players : [null, null];
      const time = timeText(room, t);
      const spec = (time ? `<span class="h-spec__i h-spec__time">${icon('ph-regular-timer')}<span>${esc(time)}</span></span><span class="sr-only">, </span>` : '')
        + `<span class="h-spec__i">${esc(t(room.ranked === false ? 'rooms.mode_friendly' : 'rooms.mode_rated'))}</span>`;
      return `<header class="h-card__top"><span class="vcode">${esc(code)}</span><span class="vstate is-${kind}">${esc(t('rooms.st_' + kind))}</span>${eye}`
        + `<button type="button" class="vbtn ${kind === 'open' ? 'vbtn--primary' : 'vbtn--ghost'}" data-action="joinRoom" data-arg="${esc(room.roomId)}" aria-label="${esc(t('rooms.enter_aria', { code }))}">${esc(t('lobby.btn_join'))}</button></header>`
        + `<ul class="h-card__seats">${seatHtml(seats[0])}${seatHtml(seats[1])}</ul>`
        + `<footer class="h-card__foot">${spec}</footer>`;
    }
    const cardClass = (room) => `room-row h-card h-card--${cardKind(room)}`;
    function cardHtml(room) {
      return `<article class="${cardClass(room)}" data-room-id="${esc(room.roomId)}" aria-label="${esc(t('rooms.card_aria', { code: codeOf(room) }))}">${cardInner(room)}</article>`;
    }
    /** In place: no node swap, so hover and keyboard focus survive the 2.5 s patches of live games. */
    function updateCard(node, room) {
      const cls = cardClass(room);
      if (node.className !== cls) node.className = cls;
      const html = cardInner(room);
      if (node._html === html) return;
      const focused = node.contains(document.activeElement) && document.activeElement.matches('[data-action]');
      node.innerHTML = html;
      node._html = html;
      if (focused) { const b = node.querySelector('[data-action]'); if (b) b.focus({ preventScroll: true }); }
    }

    function emptyHtml() {
      return `<div class="vempty">${icon('ph-regular-checkerboard')}<b>${esc(t('rooms.empty', { rule: ruleLabel() }))}</b>`
        + `<span>${esc(t('rooms.empty_sub'))}</span>`
        + `<button type="button" class="vbtn vbtn--primary vbtn--lg" data-create-rule="${rule}">${icon('ph-regular-plus-circle')}${esc(t('rooms.create_rule', { rule: ruleLabel() }))}</button></div>`;
    }
    function renderGrid() {
      const grid = $('room-list');
      if (!rooms.size) {
        // Before the first answer for this tab/filter there is nothing to say yet (no false "no tables").
        grid.innerHTML = !awaiting && (stats || matched != null) ? emptyHtml() : '';
      } else {
        let html = '';
        for (const room of rooms.values()) html += cardHtml(room);
        grid.innerHTML = html;
      }
      renderMore();
    }
    function appendCards(list) {
      const grid = $('room-list');
      if (grid.querySelector('.vempty')) { renderGrid(); return; }
      grid.insertAdjacentHTML('beforeend', list.map(cardHtml).join(''));
    }
    /** "Xem thêm N bàn": tables of this rule (or filter) the server holds beyond the grid. */
    function renderMore() {
      const btn = $('rooms-more');
      if (!btn) return;
      const total = sorted() ? matched : stats && Number.isFinite(stats.rooms) ? stats.rooms : null;
      const rest = total == null ? 0 : total - rooms.size;
      btn.hidden = rest <= 0 || tab === 'rules';
      btn.disabled = moreBusy;
      if (rest > 0) setText(btn, t('lobby.rooms_more', { n: rest }));
    }

    // ── Live data ─────────────────────────────────────────────────────────
    function onSnapshot(data) {
      if (data && data.stats) stats = data.stats;
      if (sorted()) { clearTimeout(queryTimer); queryRooms(0); }
      else {
        awaiting = false;
        rooms = new Map(((data && data.rooms) || []).filter((r) => r.winningRule === rule).map((r) => [r.roomId, r]));
        if (tab !== 'rules') renderGrid();
      }
      renderCounts();
      if (rosterShown()) loadRoster(0); else rosterStale = true;
    }
    /** Incremental (B117): only changed cards are touched. Filtered mode updates held cards, adds none. */
    function onPatch(data) {
      if (!data) return;
      if (data.stats) stats = data.stats;
      const grid = $('room-list');
      const nodes = new Map();
      for (const n of grid.children) if (n.dataset && n.dataset.roomId) nodes.set(n.dataset.roomId, n);
      const wasEmpty = rooms.size === 0;
      for (const id of data.removed || []) {
        if (!rooms.delete(id)) continue;
        const n = nodes.get(id); if (n) n.remove();
        if (matched != null) matched = Math.max(0, matched - 1);
      }
      const added = [];
      for (const room of data.upserts || []) {
        if (room.winningRule !== rule) continue; // a late patch from the previous tab's channel
        if (rooms.has(room.roomId)) {
          rooms.set(room.roomId, room);
          const n = nodes.get(room.roomId); if (n) updateCard(n, room);
        } else if (!sorted()) {
          rooms.set(room.roomId, room); added.push(room);
        }
      }
      if (tab !== 'rules') {
        if (wasEmpty !== (rooms.size === 0)) renderGrid();
        else if (added.length) appendCards(added);
      }
      renderCounts();
    }
    client.on('lobby:update', onSnapshot);
    client.on('lobby:patch', onPatch);

    // ── Roster (rail + phone sheet) ───────────────────────────────────────
    function loadRoster(offset, retry = true) {
      const seq = ++roster.seq;
      const want = rule;
      roster.busy = true;
      const q = roster.q;
      client.emitAck('lobby:online_query', { rule, q, offset }, 5000, (err, res) => {
        if (seq !== roster.seq || want !== rule) return;
        roster.busy = false;
        if (!err && res && res.error === 'RATE_LIMITED' && retry) { setTimeout(() => { if (seq === roster.seq) loadRoster(offset, false); }, 300); return; }
        if (err || !res || !Array.isArray(res.users)) { renderRail(); return; }
        roster.users = offset ? roster.users.concat(res.users.filter((u) => !roster.users.some((x) => x.userId === u.userId))) : res.users;
        roster.extra = offset > 0;
        roster.total = res.total || 0;
        roster.matched = Number.isFinite(res.matched) ? res.matched : roster.users.length;
        if (!q && roster.total > onlineTotal) { onlineTotal = roster.total; renderCounts(); }
        renderRail();
      });
    }
    function rosterHtml() {
      const myId = (me() || {}).userId;
      let html = '';
      let last = 'r';
      for (const u of roster.users) {
        const g = groupOf(u, rule);
        if (g !== last) html += `<li class="vgroup" role="presentation">${esc(g === 'n' ? t('rooms.group_none', { rule: ruleLabel() }) : t('rooms.group_guest'))}</li>`;
        last = g;
        const s = standingOf(u, rule);
        let chip;
        if (g === 'g') chip = `<span class="vr vr--none">${esc(t('rooms.guest'))}</span>`;
        else if (g === 'n') chip = `<span class="vr vr--none">${esc(t('rooms.no_rank'))}</span>`;
        else if (s.prov) chip = `<span class="vr vr--prov" title="${esc(t('rooms.prov_tip'))}">#${s.rank}?</span>`;
        else chip = `<span class="vr${s.rank <= 3 ? ' vr--top' + s.rank : ''}">#${s.rank}</span>`;
        const elo = s ? `<span class="velo">${s.rating}${s.prov ? '?' : ''}</span>` : '';
        const mine = u.userId === myId;
        const name = `<span class="vrow__n">${esc(u.displayName)}${mine ? `<span class="vrow__you"> ${esc(t('rooms.you'))}</span>` : ''}</span>`;
        // Others: the #159 control (profile card / PM) via private-chat.js's [data-online-roster] delegate.
        const act = mine ? '' : ` role="button" tabindex="0" data-user-id="${esc(u.userId)}" aria-label="${esc(u.displayName)}"`;
        html += `<li class="vrow${mine ? ' vrow--me' : ''}" title="${esc(u.displayName)}"${act}>${avatar(u.avatarUrl, u.displayName, 'pav--sm')}${name}${elo}${chip}</li>`;
      }
      if (!roster.users.length && !roster.busy) html = `<li class="vrow vrow--empty">${esc(t(roster.q ? 'rooms.search_none' : 'lobby.no_one_online'))}</li>`;
      const rest = roster.matched - roster.users.length;
      if (rest > 0) html += `<li role="presentation"><button type="button" class="vmore" data-roster-more>${esc(t('rooms.roster_more', { n: Math.min(50, rest) }))}</button></li>`;
      return html;
    }
    function renderRail() {
      const sub = t('rooms.rail_sub', { n: onlineTotal, rule: ruleLabel() });
      setText($('rooms-rail-sub'), sub);
      const html = rosterHtml();
      $('rooms-roster').innerHTML = html;
      const sheet = $('rooms-sheet');
      if (sheet && !sheet.hidden) {
        setText($('rooms-sheet-h'), t('rooms.sheet_title', { n: onlineTotal }));
        setText($('rooms-sheet-sub'), t('rooms.sheet_sub', { rule: ruleLabel() }));
        $('rooms-sheet-list').innerHTML = html;
      }
    }
    /** Presence changed (online events reach lobby subscribers only): refresh the first page, not while
        the player has paged further or is searching. */
    function refreshRoster() {
      if (roster.extra || roster.q) return;
      clearTimeout(rosterTimer);
      rosterTimer = setTimeout(() => { if (rosterShown()) loadRoster(0); else rosterStale = true; }, ROSTER_REFRESH_MS);
    }
    /** A roster is on screen: the desktop rail, or the phone sheet. Otherwise presence changes only mark it stale. */
    function rosterShown() {
      const sheet = $('rooms-sheet');
      if (sheet && !sheet.hidden) return true;
      const rail = $('rooms-rail');
      return !!rail && global.getComputedStyle(rail).display !== 'none';
    }
    function onSearch(value) {
      roster.q = String(value || '').trim().slice(0, 40);
      for (const id of ['rooms-q', 'rooms-sheet-q']) { const el = $(id); if (el && el.value !== value) el.value = value; }
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => loadRoster(0), SEARCH_DEBOUNCE_MS);
    }

    function openSheet() {
      const sheet = $('rooms-sheet');
      sheetReturn = document.activeElement;
      sheet.hidden = false;
      document.body.classList.add('rooms-sheet-open');
      renderRail();
      if (rosterStale || (!roster.users.length && !roster.busy)) { rosterStale = false; loadRoster(0); }
      const close = sheet.querySelector('[data-sheet-close]');
      if (close && close.focus) close.focus();
    }
    function closeSheet() {
      const sheet = $('rooms-sheet');
      if (!sheet || sheet.hidden) return;
      sheet.hidden = true;
      document.body.classList.remove('rooms-sheet-open');
      if (sheetReturn && sheetReturn.focus) sheetReturn.focus();
    }

    // ── Wiring ────────────────────────────────────────────────────────────
    root.addEventListener('click', (e) => {
      const tg = e.target.closest ? e.target : null;
      if (!tg) return;
      const tabBtn = tg.closest('.vtab[data-tab]');
      if (tabBtn) { selectTab(tabBtn.dataset.tab); return; }
      const cr = tg.closest('[data-create-rule]');
      if (cr) { if (opts.openCreate) opts.openCreate(cr.dataset.createRule); return; }
      if (tg.closest('#rooms-more')) { if (!moreBusy) queryRooms(rooms.size); return; }
      if (tg.closest('[data-roster-more]')) { loadRoster(roster.users.length); return; }
      if (tg.closest('#rooms-people')) { openSheet(); return; }
      if (tg.closest('[data-sheet-close]')) { closeSheet(); return; }
      if (tg.closest('#rooms-rail-toggle')) {
        const b = $('rooms-rail-toggle');
        const open = b.getAttribute('aria-expanded') !== 'true';
        b.setAttribute('aria-expanded', String(open));
        b.setAttribute('aria-label', t(open ? 'rooms.rail_collapse' : 'rooms.rail_expand'));
        $('rooms-cols').classList.toggle('is-rail-min', !open);
      }
    });
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('rooms-sheet').hidden) { e.preventDefault(); closeSheet(); return; }
      const tabBtn = e.target.closest && e.target.closest('.vtab[data-tab]');
      if (!tabBtn) return;
      const ids = [...RULES, 'rules'];
      const i = ids.indexOf(tabBtn.dataset.tab);
      let next;
      if (e.key === 'ArrowRight') next = ids[(i + 1) % ids.length];
      else if (e.key === 'ArrowLeft') next = ids[(i - 1 + ids.length) % ids.length];
      else if (e.key === 'Home') next = ids[0];
      else if (e.key === 'End') next = ids[ids.length - 1];
      else return;
      e.preventDefault();
      selectTab(next, { focus: true });
    });
    $('rooms-sort').addEventListener('change', (e) => { sort = SORTS.includes(e.target.value) ? e.target.value : 'state'; refetch(); });
    for (const id of ['rooms-q', 'rooms-sheet-q']) { const el = $(id); if (el) el.addEventListener('input', (e) => onSearch(e.target.value)); }

    function render() {
      renderTabs();
      const rulesTab = tab === 'rules';
      $('rooms-main').hidden = rulesTab;
      $('rooms-rules').hidden = !rulesTab;
      if (rulesTab) renderGuide(); else { renderSort(); renderGrid(); }
      const b = $('rooms-rail-toggle');
      if (b) b.setAttribute('aria-label', t(b.getAttribute('aria-expanded') === 'true' ? 'rooms.rail_collapse' : 'rooms.rail_expand'));
      renderRail();
    }
    global.addEventListener('langchange', render);
    // The sheet must not outlive its screen (Back to Home) or its breakpoint: it holds body's scroll lock.
    global.addEventListener('hashchange', closeSheet);
    if (global.matchMedia) {
      const wide = global.matchMedia('(min-width: 861px)');
      const onWide = () => { if (wide.matches) closeSheet(); };
      if (wide.addEventListener) wide.addEventListener('change', onWide); else if (wide.addListener) wide.addListener(onWide);
    }
    render();

    return {
      rule: () => rule,
      setOnline(total) { onlineTotal = Math.max(0, Number(total) || 0); renderCounts(); setText($('rooms-rail-sub'), t('rooms.rail_sub', { n: onlineTotal, rule: ruleLabel() })); refreshRoster(); },
      refreshRoster,
      render,
    };
  }

  global.RoomsH = { create, RULES, SORTS, timeText, eloChip, cardKind, standingOf, groupOf };
})(typeof window !== 'undefined' ? window : globalThis);
