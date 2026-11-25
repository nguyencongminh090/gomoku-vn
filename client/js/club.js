/**
 * club.js — /c/<slug> club page, "Hội quán" shell (#446; was tabs, #178/#200/#235/#250):
 * rail of my clubs, channel pane, centre (chat stream or a channel page), members pane.
 * Permissions are enforced server-side; the UI just hides what the caller can't do.
 * User-supplied text only via textContent.
 */

'use strict';

(function () {
  const t = (key, vars) => (typeof window.t === 'function' ? window.t(key, vars) : key);
  const $ = (id) => document.getElementById(id);
  const slug = decodeURIComponent(location.pathname.replace(/^\/c\//, '').replace(/\/$/, ''));
  const CATEGORIES = ['freestyle', 'standard', 'caro', 'renju'];
  const COLORS = ['blue', 'green', 'red', 'orange', 'purple', 'teal', 'pink', 'gray'];
  const state = {
    category: CATEGORIES[0], weekly: false, color: 'blue', club: null, mine: undefined, ch: null,
    chat: { loaded: false, firstId: 0, lastId: 0, busy: false },
    peekId: 0, latestOther: 0, hints: [], hint: 0, // B447: unread-dot poll cursor, newest message by others; command hints
  };
  const CHAT_POLL_MS = 8000;
  const CHAT_PAGE = 50;
  const MEMBERS_PANE_MAX = 50;

  /** Public channels, then staff-only ones (the old Quản lý panel split in three). */
  const CHANNELS = ['chat', 'events', 'tournaments', 'board', 'members'];
  const STAFF_CHANNELS = ['requests', 'settings', 'log'];
  const ALL_CHANNELS = [...CHANNELS, ...STAFF_CHANNELS];
  const CH_ICON = {
    chat: 'chat-circle', events: 'calendar', tournaments: 'flag-checkered', board: 'ranking',
    members: 'users-three', requests: 'user-plus', settings: 'gear-six', log: 'list-dashes',
  };
  /** Old `#tab=` links keep working (bookmarks from the tab layout). */
  const TAB_ALIAS = { overview: null, manage: 'requests', chat: 'chat', members: 'members', tournaments: 'tournaments', board: 'board' }; // manage → its actionable part (join-request notifications)

  function el(tag, text, cls) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }

  const icon = (name) => window.PlatformShell.icon('ph-regular-' + name);

  function errMsg(body) {
    const k = 'clubs.err_' + (body && body.code);
    const v = t(k);
    return v && v !== k ? v : (body && body.error) || t('clubs.error');
  }

  const base = () => '/api/clubs/' + encodeURIComponent(slug);

  async function act(method, path, body, confirmKey) {
    if (confirmKey && !window.confirm(t(confirmKey))) return;
    const res = await fetch(base() + path, {
      method, credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) { location.href = '/login.html'; return; }
    const data = await res.json().catch(() => null);
    $('cb-msg').textContent = res.ok ? '' : errMsg(data);
    return res.ok ? (data || {}) : null;
  }

  // Invite autocomplete: the invite endpoint needs the exact username, so suggest players by username / display name.
  let suggSeq = 0;
  let suggTimer = null;
  function suggestInvitees() {
    clearTimeout(suggTimer);
    suggTimer = setTimeout(async () => {
      const box = $('cb-invite-sugg');
      const q = $('cb-invite-name').value.trim();
      const seq = ++suggSeq;
      if (q.length < 2) { box.hidden = true; return; }
      try {
        const res = await fetch('/api/friends/search?q=' + encodeURIComponent(q), { credentials: 'same-origin' });
        if (!res.ok || seq !== suggSeq) return;
        const { results } = await res.json();
        if (seq !== suggSeq) return;
        box.replaceChildren(...results.map((p) => {
          const b = el('button', p.displayName + ' (@' + p.username + ')', 'prow pbtn--ghost cb-sugg__item');
          b.type = 'button';
          b.addEventListener('click', () => {
            $('cb-invite-name').value = p.username;
            box.hidden = true;
            $('cb-invite-name').focus();
          });
          return b;
        }));
        box.hidden = !results.length;
      } catch (_) { box.hidden = true; }
    }, 250);
  }

  // Avatar + banner (#250): crop in avatar-crop.js, then POST the blob; the server re-encodes and enforces the size.
  const IMAGES = {
    avatar: { aspect: 1, outWidth: 512 },
    banner: { aspect: 4, outWidth: 1920 },
  };

  async function pickImage(kind, file) {
    const { aspect, outWidth } = IMAGES[kind];
    let blob = file;
    if (window.AvatarCrop) {
      blob = await window.AvatarCrop.open(file, {
        aspect, outWidth, titleKey: 'clubs.' + kind + '_crop_title', onError: (m) => { $('cb-msg').textContent = m; },
      });
    }
    if (!blob) return;
    const res = await fetch(base() + '/' + kind, {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': blob.type || 'application/octet-stream' }, body: blob,
    });
    if (res.status === 401) { location.href = '/login.html'; return; }
    if (res.ok) { $('cb-msg').textContent = ''; load(); } else $('cb-msg').textContent = errMsg(await res.json().catch(() => null));
  }

  function renderImages(c) {
    const rows = Object.keys(IMAGES).map((kind) => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp'; input.hidden = true; input.id = 'cb-' + kind + '-file';
      input.onchange = () => { const f = input.files[0]; input.value = ''; if (f) pickImage(kind, f); };
      const url = c[kind + 'Url'];
      const pick = el('button', t('clubs.' + kind + '_change'), 'pbtn pbtn--sm');
      pick.type = 'button';
      pick.id = 'cb-' + kind + '-pick';
      pick.onclick = () => input.click();
      const row = el('div', undefined, 'cb-images__row');
      row.append(el('span', t('clubs.' + kind), 'pform__label'), pick, input);
      if (url) row.append(mini(t('clubs.image_remove'), async () => { if (await act('DELETE', '/' + kind)) load(); }));
      return row;
    });
    $('cb-images').replaceChildren(...rows, el('p', t('clubs.image_hint'), 'pnote'));
  }

  function mini(label, fn) {
    const b = el('button', label, 'pbtn pbtn--sm');
    b.type = 'button';
    b.onclick = async () => { if (await fn()) load(); };
    return b;
  }

  /** Round icon button (members pane approve/reject, chat delete): the label lives in aria-label + title. */
  function iconBtn(iconName, label, fn, cls) {
    const b = el('button', undefined, 'cl-ib' + (cls ? ' ' + cls : ''));
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.title = label;
    b.append(icon(iconName));
    b.onclick = async () => { if (await fn()) load(); };
    return b;
  }

  function userRow(username, displayName, avatarUrl, meta) {
    const a = el('a', undefined, 'prow');
    a.href = '/u/' + encodeURIComponent(username);
    const body = el('div', undefined, 'prow__body');
    body.append(el('div', displayName, 'prow__t'));
    if (meta) body.append(window.PlatformShell.meta(meta));
    a.append(window.PlatformShell.avatar(avatarUrl, displayName, 'pav--sm'), body);
    return a;
  }

  // --- roles ---
  const isMember = () => !!state.club && window.ClubPolicy.isMember(state.club.myRole);
  const isStaff = () => !!state.club && window.ClubPolicy.isStaff(state.club.myRole);

  // --- channels ---
  /** Channel from `#ch=<name>` (or a legacy `#tab=`); staff channels for staff only; default trò-chuyện. */
  function currentChannel() {
    const m = /(?:^|[#&])(ch|tab)=([a-z]+)/.exec(location.hash);
    let name = m ? (m[1] === 'tab' ? (TAB_ALIAS[m[2]] === undefined ? m[2] : TAB_ALIAS[m[2]]) : m[2]) : null;
    if (STAFF_CHANNELS.includes(name) && !isStaff()) name = null;
    return ALL_CHANNELS.includes(name) ? name : CHANNELS[0];
  }

  const visibleChannels = () => ALL_CHANNELS.filter((ch) => !$('cb-ch-' + ch).hidden);

  function showChannel(name, { updateHash = false } = {}) {
    state.ch = name;
    $('cb-app').dataset.ch = name; // phone CSS shows my row (leave) with thành-viên only
    for (const ch of ALL_CHANNELS) {
      $('cb-panel-' + ch).hidden = ch !== name;
      const btn = $('cb-ch-' + ch);
      if (ch === name) btn.setAttribute('aria-current', 'true'); else btn.removeAttribute('aria-current');
      btn.classList.toggle('is-on', ch === name);
    }
    $('cb-head-icon').replaceChildren(icon(CH_ICON[name]));
    $('cb-head-title').textContent = t('clubs.ch_' + name);
    $('cb-head-sub').textContent = t('clubs.chsub_' + name);
    $('cb-msg').textContent = '';
    if (updateHash && currentChannel() !== name) history.replaceState(null, '', location.pathname + location.search + '#ch=' + name); // <base href="/"> would resolve a bare '#x' to "/#x" (#451)
    if (name === 'chat') openChat();
    syncUnread();
  }

  // --- club chat: REST polling only (a socket here would evict the lobby socket) ---
  const decode = (txt) => (window.EscapeUtils ? window.EscapeUtils.decodeChatText(txt) : txt);
  const lang = () => document.documentElement.lang || undefined;
  const dayKey = (iso) => { const d = new Date(iso); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); };

  function fmtWhen(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString(lang(), { hour: '2-digit', minute: '2-digit' }) + ', ' + d.toLocaleDateString(lang(), { day: '2-digit', month: '2-digit' });
  }

  function dayLabel(iso) {
    const d = new Date(iso);
    const today = new Date();
    const y = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    if (dayKey(iso) === dayKey(today.toISOString())) return t('clubs.day_today');
    if (dayKey(iso) === dayKey(y.toISOString())) return t('clubs.day_yesterday');
    const tm = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1); // B450: sự-kiện looks ahead
    if (dayKey(iso) === dayKey(tm.toISOString())) return t('clubs.day_tomorrow');
    return d.toLocaleDateString(lang(), { weekday: 'long', day: '2-digit', month: '2-digit' });
  }

  /** Role of a chat author from the club payload (owner/officer get a coloured label). */
  function roleOf(username) {
    const m = state.club && state.club.leaderboard.find((x) => x.username === username);
    return m ? m.role : null;
  }

  const myUsername = () => {
    const me = state.club && state.club.leaderboard.find((x) => x.mine);
    return me ? me.username.toLowerCase() : null;
  };

  /**
   * Decoded text as nodes; @username of a club member is highlighted (mine gets is-me). @all / @tatca only
   * when the server would have notified for it (staff author, notifyAll on). Never innerHTML.
   */
  function textWithMentions(raw, author) {
    const allCounts = !!chatSet().notifyAll && ['owner', 'officer'].includes(roleOf(author));
    const box = el('div', undefined, 'cb-chat__text');
    const text = decode(raw);
    const members = new Set((state.club ? state.club.leaderboard : []).map((x) => x.username.toLowerCase()));
    const me = myUsername();
    let at = 0;
    let mentionsMe = false;
    for (const m of text.matchAll(/(^|[^A-Za-z0-9_@])@([A-Za-z0-9_]{3,20})(?![A-Za-z0-9_])/g)) {
      const name = m[2].toLowerCase();
      const all = name === 'all' || name === 'tatca';
      if (all ? !allCounts : !members.has(name)) continue;
      const startAt = m.index + m[1].length;
      if (startAt > at) box.append(text.slice(at, startAt));
      const isMe = all || name === me;
      mentionsMe = mentionsMe || isMe;
      box.append(el('b', '@' + m[2], 'cb-chat__at' + (isMe ? ' is-me' : '')));
      at = startAt + 1 + m[2].length;
    }
    if (at < text.length) box.append(text.slice(at));
    return { box, mentionsMe };
  }

  /** /ghim and /giaohuu rows: icon tile + one-line title, then the pinned text or the terms as pills. */
  function systemBody(m) {
    const meta = m.meta || {};
    const body = el('div', undefined, 'cb-chat__body');
    if (m.kind === 'pin') {
      body.append(el('div', t('clubs.sys_pin', { name: m.displayName }), 'cb-chat__sys-t'), el('div', decode(m.text), 'cb-chat__text'));
    } else {
      const to = meta.to ? meta.to.displayName : '';
      const terms = el('div', undefined, 'cb-chat__terms');
      terms.append(el('span', t('rule.' + meta.rule), 'cl-count'), el('span', meta.time || '', 'cl-count'), el('span', t('clubs.sys_unrated'), 'cl-count'));
      body.append(el('div', t('clubs.sys_challenge', { name: m.displayName, to }), 'cb-chat__sys-t'), terms);
    }
    return body;
  }

  // --- polls (B449): tallies come from the server only; open cards refresh on the 8 s chat tick ---
  const pollCards = () => [...$('cb-chat-log').querySelectorAll('.cb-poll[data-open="1"]')];
  /** Bumped before every vote/close POST, so a chat tick sent earlier can't repaint the card with older state. */
  const bumpPoll = (card) => { card.dataset.v = String((Number(card.dataset.v) || 0) + 1); };

  /** Fill (or refill) a poll card from server state `p`. Options are buttons; tapping my own option takes the vote back. */
  function renderPoll(card, p) {
    const id = card.dataset.id;
    card.dataset.open = p.closed ? '0' : '1';
    const opts = el('div', undefined, 'cb-poll__opts');
    p.options.forEach((text, i) => {
      const n = p.counts[i] || 0;
      const pct = p.total ? Math.round((n / p.total) * 100) : 0;
      const b = el('button', undefined, 'cb-poll__opt' + (p.myOption === i ? ' is-mine' : ''));
      b.type = 'button';
      b.disabled = p.closed;
      b.setAttribute('aria-pressed', String(p.myOption === i));
      b.style.setProperty('--pct', pct + '%');
      const label = el('span', undefined, 'cb-poll__label');
      if (p.myOption === i) label.append(icon('check-circle'));
      label.append(decode(text));
      b.append(label, el('span', t('clubs.poll_votes', { n }), 'cb-poll__n'));
      b.setAttribute('aria-label', decode(text) + ', ' + t('clubs.poll_votes', { n }));
      b.onclick = async () => {
        bumpPoll(card);
        const res = await act('POST', '/messages/' + id + '/vote', { option: p.myOption === i ? null : i });
        if (res && res.poll) { renderPoll(card, res.poll); if (card.querySelector('.cb-poll__who')) showVoters(card); }
      };
      opts.append(b);
    });
    const foot = el('div', undefined, 'cb-poll__foot');
    foot.append(el('span', t('clubs.poll_total', { n: p.total }), 'cl-count'),
      el('span', p.closed ? t('clubs.poll_closed') : t('clubs.poll_until', { when: fmtWhen(p.closesAt) }), 'cl-count' + (p.closed ? '' : ' cb-poll__open')));
    if (p.total) {
      const who = el('button', t('clubs.poll_voters'), 'cb-poll__link');
      who.type = 'button';
      who.setAttribute('aria-expanded', String(!!card.querySelector('.cb-poll__who')));
      who.onclick = () => { if (card.querySelector('.cb-poll__who')) { card.querySelector('.cb-poll__who').remove(); who.setAttribute('aria-expanded', 'false'); } else showVoters(card); };
      foot.append(who);
    }
    if (p.canClose) {
      const end = el('button', t('clubs.poll_close'), 'cb-poll__link');
      end.type = 'button';
      end.onclick = async () => {
        bumpPoll(card);
        const res = await act('POST', '/messages/' + id + '/close', null, 'clubs.confirm_poll_close');
        if (res && res.poll) renderPoll(card, res.poll);
      };
      foot.append(end);
    }
    const voters = card.querySelector('.cb-poll__who');
    card.replaceChildren(opts, foot);
    if (voters) card.append(voters);
  }

  /** Named votes (decided 2026-11-24): fetched on demand, never part of the 8 s poll. */
  async function showVoters(card) {
    const res = await fetch(base() + '/messages/' + card.dataset.id + '/voters', { credentials: 'same-origin' });
    if (!res.ok) return;
    const { voters } = await res.json();
    const box = el('div', undefined, 'cb-poll__who');
    [...card.querySelectorAll('.cb-poll__opt')].forEach((b, i) => {
      const list = voters[i] || [];
      if (!list.length) return;
      const row = el('div', undefined, 'cb-poll__whorow');
      row.append(el('b', b.querySelector('.cb-poll__label').textContent));
      const names = el('span', undefined, 'cb-poll__names');
      list.forEach((v, j) => {
        const a = el('a', v.displayName, 'cl-nm');
        a.href = '/u/' + encodeURIComponent(v.username);
        names.append(a);
        if (j < list.length - 1) names.append(', ');
      });
      row.append(names);
      box.append(row);
    });
    const old = card.querySelector('.cb-poll__who');
    if (old) old.replaceWith(box); else card.append(box);
    const btn = [...card.querySelectorAll('.cb-poll__link')].find((x) => x.hasAttribute('aria-expanded'));
    if (btn) btn.setAttribute('aria-expanded', 'true');
  }

  function pollBody(m) {
    const body = el('div', undefined, 'cb-chat__body');
    const card = el('div', undefined, 'cb-poll');
    card.dataset.id = String(m.id);
    body.append(el('div', t('clubs.sys_poll', { name: m.displayName }), 'cb-chat__sys-t'), el('div', decode(m.text), 'cb-chat__text cb-poll__q'), card);
    if (m.poll) renderPoll(card, m.poll);
    return body;
  }

  function chatRow(m) {
    const sys = m.kind === 'pin' || m.kind === 'challenge' || m.kind === 'poll';
    const row = el('div', undefined, 'cb-chat__msg' + (sys ? ' cb-chat__msg--sys' : ''));
    row.dataset.id = String(m.id);
    row.dataset.day = dayKey(m.createdAt);
    row.dataset.at = m.createdAt;
    const time = el('time', new Date(m.createdAt).toLocaleTimeString(lang(), { hour: '2-digit', minute: '2-digit' }), 'cb-chat__time');
    time.dateTime = m.createdAt;
    time.title = fmtWhen(m.createdAt);
    let body;
    if (sys) {
      const tile = el('span', undefined, 'cb-chat__tile');
      tile.append(icon({ pin: 'megaphone', challenge: 'handshake', poll: 'check-square' }[m.kind]));
      body = m.kind === 'poll' ? pollBody(m) : systemBody(m);
      body.firstChild.append(time);
      row.append(tile, body);
    } else {
      body = el('div', undefined, 'cb-chat__body');
      const who = el('div', undefined, 'cb-chat__who');
      const name = el(m.username ? 'a' : 'b', m.displayName, 'cl-nm cb-chat__name');
      if (m.username) name.href = '/u/' + encodeURIComponent(m.username);
      who.append(name);
      const role = roleOf(m.username);
      if (role === 'owner' || role === 'officer') who.append(el('span', t('clubs.role_' + role), 'cl-role'));
      who.append(time);
      const { box, mentionsMe } = textWithMentions(m.text, m.username);
      if (mentionsMe && !m.mine) row.classList.add('is-mentioned');
      body.append(who, box);
      row.append(window.PlatformShell.avatar(m.avatarUrl, m.displayName, 'cl-av40'), body);
    }
    if (isStaff()) {
      row.append(iconBtn('trash', t('clubs.delete_message'), async () => {
        const ok = await act('DELETE', '/messages/' + m.id, null, 'clubs.confirm_delete_message');
        if (ok) { resetChat(); openChat(); }
        return false;
      }, 'cb-chat__del'));
    }
    return row;
  }

  // --- unread dot (B447): last-seen id per club on this device; REST only ---
  const SEEN_KEY = 'gvn_club_seen_' + slug;
  const chatSet = () => (state.club && state.club.chat) || {};
  function seenId() {
    try { return Number(localStorage.getItem(SEEN_KEY)) || 0; } catch (_) { return 0; }
  }
  function setSeen(id) {
    try { if (id > seenId()) localStorage.setItem(SEEN_KEY, String(id)); } catch (_) { /* private mode: dot just stays off-by-one */ }
  }
  /** Note messages we now know of: advances the peek cursor and the newest-by-others id. */
  function noteMessages(list) {
    for (const m of list) {
      if (m.id > state.peekId) state.peekId = m.id;
      if (!m.mine && m.id > state.latestOther) state.latestOther = m.id;
    }
  }
  function syncUnread() {
    const reading = state.ch === 'chat' && state.chat.loaded && !document.hidden;
    if (reading) setSeen(Math.max(state.chat.lastId, state.latestOther));
    $('cb-chat-unread').hidden = !(isMember() && chatSet().unreadDot && !reading && state.latestOther > seenId());
  }
  /** Away from trò-chuyện: ask only for messages after the cursor (usually none). */
  async function peekUnread() {
    try {
      const res = await fetch(base() + '/messages?after=' + state.peekId, { credentials: 'same-origin' });
      if (!res.ok) return;
      noteMessages((await res.json()).messages || []);
      syncUnread();
    } catch (_) { /* next poll retries */ }
  }

  /** Day separators: one before the first message of each local day; rebuilt after every insert. */
  function markDays() {
    const log = $('cb-chat-log');
    log.querySelectorAll('.cl-day').forEach((n) => n.remove());
    let prev = null;
    for (const row of [...log.children]) {
      if (row.dataset.day !== prev) {
        const sep = el('div', dayLabel(row.dataset.at), 'cl-day');
        sep.setAttribute('role', 'separator');
        log.insertBefore(sep, row);
        prev = row.dataset.day;
      }
    }
  }

  function resetChat() {
    state.chat = { loaded: false, firstId: 0, lastId: 0, busy: false };
    $('cb-chat-log').replaceChildren();
  }

  function syncChatChrome(pageFull) {
    const n = $('cb-chat-log').querySelectorAll('.cb-chat__msg').length;
    $('cb-chat-empty').hidden = n > 0;
    if (pageFull !== undefined) $('cb-chat-older').hidden = !pageFull;
  }

  /** @param {'newest'|'older'|'newer'} mode */
  async function fetchChat(mode) {
    const c = state.chat;
    if (c.busy || !isMember()) return;
    c.busy = true;
    try {
      let q = mode === 'older' ? '?before=' + c.firstId : mode === 'newer' ? '?after=' + c.lastId : '';
      const open = mode === 'newer' ? pollCards().slice(-20) : [];
      if (mode === 'newer') {
        const visible = [...$('cb-chat-log').querySelectorAll('.cb-chat__msg')].map((n) => n.dataset.id);
        if (visible.length) q += '&visible=' + visible.slice(0, 200).join(',');
      }
      const sentV = open.map((n) => n.dataset.v);
      if (open.length) q += '&polls=' + open.map((n) => n.dataset.id).join(',');
      const res = await fetch(base() + '/messages' + q, { credentials: 'same-origin' });
      if (!res.ok) return;
      const { messages, polls, removed } = await res.json();
      if (removed?.length) {
        const stale = new Set(removed.map(String));
        for (const row of $('cb-chat-log').querySelectorAll('.cb-chat__msg')) if (stale.has(row.dataset.id)) row.remove();
        markDays();
      }
      if (polls) open.forEach((card, i) => { if (polls[card.dataset.id] && card.dataset.v === sentV[i]) renderPoll(card, polls[card.dataset.id]); });
      const log = $('cb-chat-log');
      const scroller = $('cb-stream');
      const stick = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 40;
      const fromBottom = scroller.scrollHeight - scroller.scrollTop;
      if (messages.length) {
        const rows = messages.map(chatRow);
        if (mode === 'older') log.prepend(...rows); else log.append(...rows);
        if (mode !== 'newer' || !c.firstId) c.firstId = messages[0].id;
        if (mode !== 'older') c.lastId = messages[messages.length - 1].id;
        noteMessages(messages);
        markDays();
      }
      if (mode === 'newest') { c.loaded = true; scroller.scrollTop = scroller.scrollHeight; }
      else if (mode === 'newer' && stick) scroller.scrollTop = scroller.scrollHeight;
      else if (mode === 'older') scroller.scrollTop = scroller.scrollHeight - fromBottom; // keep the reading position
      syncChatChrome(mode === 'newer' ? undefined : messages.length >= CHAT_PAGE);
      syncUnread();
    } catch (_) { /* next poll retries */ } finally { c.busy = false; }
  }

  function openChat() {
    if (!isMember()) return;
    if (!state.chat.loaded) fetchChat('newest');
    else if (state.latestOther > state.chat.lastId) fetchChat('newer'); // the unread dot saw these: show them now, not on the next poll
  }

  // --- sự-kiện channel (B450): grouped by the viewer's local day, RSVP "tham gia" for reminders ---
  const options = () => [...$('cb-options').querySelectorAll('input')];
  function previewPoll() {
    const fields = options();
    fields.forEach((field, index) => {
      field.placeholder = t('clubs.option') + ' ' + (index + 1);
      field.setAttribute('aria-label', field.placeholder);
      field.nextElementSibling.disabled = fields.length <= 2;
    });
    $('cb-add-option').disabled = fields.length >= 6;
    $('cb-poll-preview').textContent = [t('clubs.preview'), $('cb-question').value, ...fields.map((f) => f.value)].filter(Boolean).join(' · ');
  }

  function addOption(value) {
    const row = el('div', undefined, 'pform__row');
    const field = el('input');
    field.required = true;
    field.maxLength = 50;
    field.value = value;
    const remove = mini(t('clubs.remove_option'), () => { row.remove(); previewPoll(); });
    row.append(field, remove);
    $('cb-options').append(row);
    previewPoll();
    return field;
  }

  function openPoll(arg) {
    const [question, ...values] = arg.split('|').map((v) => v.trim());
    $('cb-question').value = question;
    $('cb-options').replaceChildren();
    while (values.length < 2) values.push('');
    values.slice(0, 6).forEach(addOption);
    $('cb-poll-error').textContent = '';
    $('cb-poll-editor').showModal();
    $('cb-question').focus();
  }

  function previewEvent() {
    const when = $('cb-event-when').value;
    $('cb-event-preview').textContent = [t('clubs.preview'), $('cb-event-title').value, when && fmtWhen(when)].filter(Boolean).join(' · ');
  }

  function eventRow(e, staff) {
    const row = el('div', undefined, 'prow cl-event' + (e.mine ? ' is-going' : ''));
    row.dataset.event = e.id;
    const body = el('div', undefined, 'prow__body');
    body.append(el('div', e.title, 'prow__t'),
      window.PlatformShell.meta(new Date(e.startsAt).toLocaleTimeString(lang(), { hour: '2-digit', minute: '2-digit' })),
      el('div', e.going ? t('clubs.event_going_n', { n: e.going }) : t('clubs.event_going_none'), 'prow__m cl-event__going'));
    row.append(window.PlatformShell.icon('ph-regular-calendar'), body);
    if (isMember()) {
      const b = el('button', t(e.mine ? 'clubs.event_going' : 'clubs.event_join'), 'pbtn pbtn--sm' + (e.mine ? ' pbtn--primary' : ''));
      b.type = 'button';
      b.setAttribute('aria-pressed', String(!!e.mine));
      b.title = t('clubs.event_join_hint');
      b.onclick = async () => {
        b.disabled = true;
        const r = await act(e.mine ? 'DELETE' : 'POST', '/events/' + encodeURIComponent(e.id) + '/rsvp');
        if (r) {
          Object.assign(e, { going: r.going, mine: r.mine });
          const fresh = eventRow(e, staff);
          row.replaceWith(fresh);
          fresh.querySelector('button').focus();
        } else b.disabled = false;
      };
      row.append(b);
    }
    if (staff) row.append(mini(t('clubs.delete_event'), () => act('DELETE', '/events/' + encodeURIComponent(e.id), null, 'clubs.confirm_delete_event')));
    return row;
  }

  function renderEvents(events, staff) {
    if (!events.length) { $('cb-events').replaceChildren(el('p', t('clubs.no_events'), 'pnote')); return; }
    const out = [];
    let last = '';
    for (const e of events) {
      if (dayKey(e.startsAt) !== last) { last = dayKey(e.startsAt); out.push(el('h3', dayLabel(e.startsAt), 'cl-evday')); }
      out.push(eventRow(e, staff));
    }
    $('cb-events').replaceChildren(...out);
  }

  // --- composer command hints (B447): only commands this club enabled and this member may use ---
  function commandHints(prefix = '') {
    return window.ClubPolicy.available(state.club.myRole, chatSet()).flatMap(({ kind, words }) => {
      const word = words.find((w) => w.startsWith(prefix));
      if (!word) return [];
      const calendar = kind === 'calendar';
      const args = kind === 'help' || (calendar && !isStaff()) ? '' : t('clubs.cmd_' + kind + '_args');
      const desc = t('clubs.cmd_' + (calendar && isStaff() ? 'calendar_staff' : kind));
      return [{ cmd: '/' + word, args, desc, aliases: words.filter((w) => w !== word), bare: calendar || kind === 'poll' || kind === 'help' }];
    });
  }

  function hideHints() {
    state.hints = [];
    $('cb-chat-hints').hidden = true;
    $('cb-chat-input').setAttribute('aria-expanded', 'false');
    $('cb-chat-input').removeAttribute('aria-activedescendant');
  }

  /** While the input is just "/word" (no space yet), list the matching commands. */
  function renderHints() {
    const m = /^\/([A-Za-z]*)$/.exec($('cb-chat-input').value);
    const list = m ? commandHints(m[1].toLowerCase()) : [];
    if (!list.length) { hideHints(); return; }
    state.hints = list;
    state.hint = Math.min(state.hint, list.length - 1);
    $('cb-chat-hints').replaceChildren(...list.map((h, i) => {
      const li = el('li', undefined, 'cl-hint');
      li.id = 'cb-hint-' + i;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(i === state.hint));
      li.append(el('b', h.cmd), el('span', h.args, 'cl-hint__args'), el('span', h.desc, 'cl-hint__desc'));
      if (h.aliases.length) li.append(el('small', h.aliases.map((w) => '/' + w).join(' · ')));
      li.addEventListener('mousedown', (ev) => { ev.preventDefault(); pickHint(i); });
      return li;
    }));
    $('cb-chat-hints').hidden = false;
    $('cb-chat-input').setAttribute('aria-expanded', 'true');
    $('cb-chat-input').setAttribute('aria-activedescendant', 'cb-hint-' + state.hint);
  }

  function pickHint(i) {
    const h = state.hints[i];
    if (!h) return;
    $('cb-chat-input').value = h.cmd + ' ';
    hideHints();
    $('cb-chat-input').focus();
  }

  function hintKeys(ev) {
    if (!state.hints.length || ev.isComposing || ev.keyCode === 229) return; // IME (Telex/VNI) composing: its Enter is not ours
    const n = state.hints.length;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      state.hint = (state.hint + (ev.key === 'ArrowDown' ? 1 : -1) + n) % n;
      renderHints();
    } else if (ev.key === 'Enter' && state.hints[state.hint].bare && $('cb-chat-input').value.toLowerCase() === state.hints[state.hint].cmd) {
      hideHints(); // B450: "/lich" is complete on its own — Enter sends it instead of only filling it in
      return;
    } else if (ev.key === 'Enter' || ev.key === 'Tab') {
      pickHint(state.hint);
    } else if (ev.key === 'Escape') {
      hideHints();
    } else return;
    ev.preventDefault();
  }

  function renderSwatches() {
    $('cb-colors').replaceChildren(...COLORS.map((key) => {
      const b = el('button', undefined, 'pswatch pav--c-' + key);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(key === state.color));
      b.setAttribute('aria-label', t('clubs.color_' + key));
      b.title = t('clubs.color_' + key);
      b.onclick = () => { state.color = key; renderSwatches(); };
      return b;
    }));
  }

  function historyRow(e) {
    const who = (u) => (u ? u.displayName : '');
    const row = el('div', undefined, 'prow');
    const body = el('div', undefined, 'prow__body');
    body.append(el('div', t('clubs.log_' + e.type, { actor: who(e.actor), target: who(e.target), role: e.type === 'role' ? t('clubs.role_' + e.detail) : '' }), 'prow__t'),
      window.PlatformShell.meta(fmtWhen(e.at)));
    row.append(body);
    return row;
  }

  /** Board channel: rating categories or "this week" (wins in 7 days, from the same payload). */
  function renderBoardMode() {
    const week = state.weekly;
    const rows = state.club.weekly || [];
    $('cb-board-wrap').hidden = week;
    $('cb-weekly-wrap').hidden = !week || !rows.length;
    $('cb-weekly-empty').hidden = !week || rows.length > 0;
    $('cb-weekly-body').replaceChildren(...rows.map((m) => {
      const tr = document.createElement('tr');
      const name = document.createElement('td');
      const link = el('a', m.displayName);
      link.href = '/u/' + encodeURIComponent(m.username);
      name.append(window.PlatformShell.avatar(m.avatarUrl, m.displayName, 'pav--sm'), link);
      tr.append(el('td', String(m.rank)), name, el('td', String(m.wins), 'num'), el('td', String(m.played), 'num'));
      return tr;
    }));
    [...$('cb-tabs').children].forEach((b, i) => b.setAttribute('aria-selected', String(i === CATEGORIES.length ? week : !week && CATEGORIES[i] === state.category)));
  }

  function renderRail() {
    const c = state.club;
    window.ClubKit.renderRail($('cb-rail'), {
      mine: state.mine || null, active: c ? c.slug : slug,
      current: c ? { slug: c.slug, name: c.name, color: c.color, tag: c.tag, avatarUrl: c.avatarUrl } : null,
    });
  }

  function renderBanner(c) {
    const img = $('cb-banner');
    const gen = $('cb-banner-gen');
    img.hidden = !c.bannerUrl;
    img.style.backgroundImage = c.bannerUrl ? 'url("' + c.bannerUrl + '")' : '';
    gen.hidden = !!c.bannerUrl;
    gen.replaceChildren(...(c.bannerUrl ? [] : [window.ClubKit.genBanner(c.slug, c.color)]));
    $('cb-name').textContent = c.name;
    $('cb-count').textContent = t('clubs.members', { n: c.members });
  }

  /** Visitor / invited / pending: crest, name, description, three numbers and the one primary. */
  function renderGate(c) {
    const role = c.myRole;
    $('cb-avatar').replaceWith(Object.assign(window.ClubKit.crest(c, 'cl-crest--xl'), { id: 'cb-avatar' }));
    $('cb-gate-name').textContent = c.name;
    $('cb-desc').textContent = c.description;
    $('cb-desc').hidden = !c.description;
    $('cb-policy-badge').textContent = t(c.joinPolicy === 'open' ? 'clubs.policy_open_short' : 'clubs.policy_invite_short');
    const stats = $('cb-stats');
    stats.replaceChildren();
    for (const [label, v] of [['clubs.members_stat', String(c.members)], ['clubs.avg_stat', c.avgRating ? String(c.avgRating) : '—'], ['clubs.rank_stat', c.rank ? '#' + c.rank : '—']]) {
      const d = document.createElement('div');
      d.append(el('dd', v), el('dt', t(label)));
      stats.appendChild(d);
    }
    $('cb-join').hidden = !!role;
    $('cb-join').textContent = t(c.invited ? 'clubs.accept_invite' : c.joinPolicy === 'open' ? 'clubs.join' : 'clubs.request');
    $('cb-pending-note').hidden = $('cb-cancel').hidden = role !== 'pending';
  }

  /** My row at the bottom of the channel pane: who I am here + leave (never for the owner). */
  function renderMe(c) {
    const me = c.leaderboard.find((m) => m.mine);
    $('cb-me').hidden = !isMember() || !me;
    $('cb-leave').hidden = !isMember() || c.myRole === 'owner';
    if (!me) return;
    $('cb-me-av').replaceChildren(window.PlatformShell.avatar(me.avatarUrl, me.displayName, 'cl-av36'));
    $('cb-me-name').textContent = me.displayName;
    $('cb-me-sub').textContent = me.rating == null ? t('clubs.role_' + me.role) : t('clubs.my_rank', { n: me.rank });
  }

  function paneRow(m, sub, extra) {
    const row = el('div', undefined, 'cl-u');
    const a = el('a', undefined, 'cl-u__link');
    a.href = '/u/' + encodeURIComponent(m.username);
    const x = el('span', undefined, 'cl-u__x');
    x.append(el('b', m.displayName, 'cl-nm'));
    if (sub) x.append(el('small', sub, 'cl-nm'));
    a.append(window.PlatformShell.avatar(m.avatarUrl || null, m.displayName, 'cl-av36'), x);
    row.append(a, ...(extra || []));
    return row;
  }

  /** Members pane (no presence API yet, #446 decision): Chờ duyệt (staff), Ban quản trị, Thành viên. */
  function renderMembersPane(c) {
    const pending = isStaff() ? (c.pending || []) : [];
    $('cb-mem-pending').hidden = !pending.length;
    $('cb-mem-pending-n').textContent = String(pending.length);
    $('cb-mem-pending-list').replaceChildren(...pending.map((p) => {
      const enc = encodeURIComponent(p.username);
      return paneRow(p, null, [
        iconBtn('check', t('clubs.approve'), () => act('POST', '/members/' + enc + '/approve'), 'cl-ib--ring'),
        iconBtn('x', t('clubs.reject'), () => act('DELETE', '/members/' + enc), 'cl-ib--ring'),
      ]);
    }));
    const staff = c.leaderboard.filter((m) => m.role !== 'member');
    const plain = c.leaderboard.filter((m) => m.role === 'member');
    const ratingSub = (m) => (m.rating == null ? t('clubs.unrated') : t('clubs.rating_n', { n: m.rating }));
    $('cb-staff-n').textContent = String(staff.length);
    $('cb-staff').replaceChildren(...staff.map((m) => paneRow(m, t('clubs.role_' + m.role))));
    $('cb-plain-n').textContent = String(plain.length);
    $('cb-plain').replaceChildren(...plain.slice(0, MEMBERS_PANE_MAX).map((m) => paneRow(m, ratingSub(m))));
    const more = $('cb-mem-more');
    more.hidden = plain.length <= MEMBERS_PANE_MAX;
    more.textContent = t('clubs.members_all', { n: plain.length });
  }

  function renderHistory() {
    const query = $('cb-log-search').value.trim().toLocaleLowerCase('vi');
    const rows = (state.club.history || []).filter((entry) => [entry.type, entry.actor?.username,
      entry.target?.username, historyRow(entry).textContent].join(' ').toLocaleLowerCase('vi').includes(query));
    $('cb-history').replaceChildren(...(rows.length ? rows.map(historyRow) : [el('p', t('clubs.history_none'), 'pnote')]));
  }

  function renderRoster() {
    const c = state.club;
    const role = c.myRole;
    const staff = isStaff();
    const query = $('cb-member-search').value.trim().toLocaleLowerCase('vi');
    const filter = $('cb-role-filter').value;
    const members = c.leaderboard.filter((m) => (!filter || filter === m.role)
      && (m.username + ' ' + m.displayName).toLocaleLowerCase('vi').includes(query));
    if ($('cb-member-sort').value === 'name') members.sort((a, b) => a.displayName.localeCompare(b.displayName, 'vi'));
    $('cb-bulk').hidden = !staff;
    $('cb-sanctions').replaceChildren(...(staff ? (c.sanctions || []) : []).map((s) => {
      const row = el('div', undefined, 'prow');
      row.append(el('span', s.username + ' · ' + (s.kind === 'ban' ? 'Bị cấm' : 'Tắt tiếng đến ' + fmtWhen(s.untilAt))),
        mini('Gỡ hạn chế', () => act('POST', '/moderation', { usernames: [s.username], action: 'un' + s.kind })));
      return row;
    }));
    const actions = staff || isMember();
    $('cb-actions-th').hidden = !actions;
    $('cb-members-body').replaceChildren(...members.map((m) => {
      const tr = document.createElement('tr');
      const name = document.createElement('td');
      const link = el('a', m.displayName);
      link.href = '/u/' + encodeURIComponent(m.username);
      if (staff && window.ClubPolicy.canModerate(role, m.role)) {
        const check = el('input');
        check.type = 'checkbox';
        check.value = m.username;
        check.setAttribute('aria-label', m.displayName);
        name.append(check);
      }
      name.append(window.PlatformShell.avatar(m.avatarUrl, m.displayName, 'pav--sm'), link);
      tr.append(name, el('td', t('clubs.role_' + m.role)));
      if (actions) {
        const td = document.createElement('td');
        td.className = 'num';
        const enc = encodeURIComponent(m.username);
        if (isMember() && !m.mine && window.ChallengeModal) {
          const ch = el('button', t('clubs.challenge'), 'pbtn pbtn--sm');
          ch.type = 'button';
          ch.onclick = () => window.ChallengeModal.open({ to: { username: m.username, displayName: m.displayName, avatarUrl: m.avatarUrl } });
          td.append(ch, ' ');
        }
        if (staff) {
          // Officers can't act on staff; nobody removes the owner (the server enforces the same).
          const canKick = window.ClubPolicy.canModerate(role, m.role);
          if (canKick) td.append(mini(t('clubs.kick'), () => act('DELETE', '/members/' + enc, null, 'clubs.confirm_kick')));
          if (role === 'owner' && m.role !== 'owner') {
            td.append(' ', mini(t(m.role === 'officer' ? 'clubs.demote' : 'clubs.promote'),
              () => act('PUT', '/members/' + enc + '/role', { role: m.role === 'officer' ? 'member' : 'officer' })));
            td.append(' ', mini(t('clubs.transfer'), () => act('PUT', '/members/' + enc + '/role', { role: 'owner' }, 'clubs.confirm_transfer')));
          }
        }
        tr.append(td);
      }
      return tr;
    }));
  }

  function render(c) {
    state.club = c;
    if (c.lastMessageId !== undefined) {
      // First visit on this device: history is not "unread". Written even when 0 (empty chat), else
      // the next load would count as a first visit again and swallow what arrived in between.
      try { if (localStorage.getItem(SEEN_KEY) === null) localStorage.setItem(SEEN_KEY, String(c.lastMessageId)); } catch (_) { /* no storage */ }
      state.latestOther = Math.max(state.latestOther, c.lastMessageId);
      state.peekId = Math.max(state.peekId, c.lastMessageId);
    }
    document.title = 'Play3CR — ' + c.name;
    $('cb-app').style.setProperty('--cc', 'var(--club-' + window.ClubKit.colorKey(c.color) + ')');
    renderBanner(c);
    renderGate(c);
    renderRail();

    const role = c.myRole;
    const staff = window.ClubPolicy.isStaff(role);
    for (const ch of STAFF_CHANNELS) $('cb-ch-' + ch).hidden = !staff;
    $('cb-staff-grp').hidden = !staff;
    const pendingN = staff ? (c.pending || []).length : 0;
    $('cb-pending-count').hidden = !pendingN;
    $('cb-pending-count').textContent = String(pendingN);
    $('cb-pending-count').setAttribute('aria-label', t('clubs.pending_n', { n: pendingN }));
    $('cb-delete').hidden = $('cb-danger').hidden = role !== 'owner';
    renderMe(c);

    // Chat channel: members get the stream; everyone else the gate over a skeleton (never real messages).
    $('cb-gate').hidden = isMember();
    $('cb-chat').hidden = !isMember();
    $('cb-announce').hidden = !c.announcement;
    $('cb-announce-text').textContent = c.announcement;

    $('cb-events-count').hidden = !c.events.length;
    $('cb-events-count').textContent = String(c.events.length);
    renderEvents(c.events, staff);
    $('cb-poll-new').hidden = !isMember() || !chatSet().cmdPoll;
    $('cb-event-box').hidden = !staff;

    $('cb-tournaments').replaceChildren(...(c.tournaments.length ? c.tournaments.map((x) => {
      const a = el('a', undefined, 'prow');
      a.href = '/tournament.html?id=' + encodeURIComponent(x.id);
      const body = el('div', undefined, 'prow__body');
      body.append(el('div', x.name, 'prow__t'),
        window.PlatformShell.meta([t('clubs.tstatus_' + x.status), x.players + ' ' + t('clubs.tplayers'), new Date(x.startedAt || x.createdAt).toLocaleDateString(lang())]));
      a.append(body);
      return a;
    }) : [el('p', t('clubs.no_tournaments'), 'pnote')]));
    $('cb-tournament-new').hidden = !staff;

    $('cb-manage').hidden = !staff;
    if (staff) {
      renderImages(c);
      $('cb-desc-input').value = c.description;
      $('cb-announce-input').value = c.announcement;
      for (const box of document.querySelectorAll('#cb-chatset input[data-chat]')) box.checked = !!chatSet()[box.dataset.chat];
      $('cb-tag-input').value = c.tag;
      state.color = c.color;
      renderSwatches();
      $('cb-invites').replaceChildren(...(c.invites || []).map((p) => {
        const row = userRow(p.username, p.displayName, null);
        row.append(mini(t('clubs.revoke'), () => act('DELETE', '/invites/' + encodeURIComponent(p.username))));
        return row;
      }));
      renderHistory();
      $('cb-policy').value = c.joinPolicy;
      $('cb-policy').hidden = $('cb-policy-label').hidden = role !== 'owner';
      const pending = c.pending || [];
      $('cb-pending').replaceChildren(...(pending.length ? pending.map((p) => {
        const row = userRow(p.username, p.displayName, null);
        row.append(
          mini(t('clubs.approve'), () => act('POST', '/members/' + encodeURIComponent(p.username) + '/approve')),
          mini(t('clubs.reject'), () => act('DELETE', '/members/' + encodeURIComponent(p.username))));
        return row;
      }) : [el('p', t('clubs.no_pending'), 'pnote')]));
    }

    renderRoster();
    $('cb-body').replaceChildren(...c.leaderboard.map((m) => {
      const tr = document.createElement('tr');
      const name = document.createElement('td');
      const link = el('a', m.displayName);
      link.href = '/u/' + encodeURIComponent(m.username);
      name.append(window.PlatformShell.avatar(m.avatarUrl, m.displayName, 'pav--sm'), link);
      tr.append(el('td', String(m.rank)), name, el('td', m.rating == null ? '—' : String(m.rating), 'num'));
      return tr;
    }));

    const chips = CATEGORIES.map((cat) => {
      const b = el('button', t('rankings.cat_' + cat), 'pchip');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.onclick = () => { state.category = cat; state.weekly = false; load(); };
      return b;
    });
    const weekChip = el('button', t('clubs.board_week'), 'pchip');
    weekChip.type = 'button';
    weekChip.setAttribute('role', 'tab');
    weekChip.onclick = () => { state.weekly = true; renderBoardMode(); };
    $('cb-tabs').replaceChildren(...chips, weekChip);
    renderBoardMode();
    renderMembersPane(c);
    if (!isMember() && state.chat.loaded) resetChat();
    $('cb-content').hidden = false;
    showChannel(currentChannel());
  }

  async function load() {
    try {
      const res = await fetch(base() + '?category=' + state.category, { credentials: 'same-origin' });
      if (res.status === 404) { $('cb-status').textContent = t('clubs.not_found'); $('cb-content').hidden = true; return; }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      $('cb-status').textContent = '';
      render(await res.json());
    } catch (_) {
      $('cb-status').textContent = t('clubs.error');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.PlatformShell.build('clubs');
    renderRail();
    $('cb-join').onclick = async () => { if (await act('POST', '/join')) load(); };
    $('cb-leave').onclick = async () => { if (await act('POST', '/leave', null, 'clubs.confirm_leave')) load(); };
    $('cb-cancel').onclick = async () => { if (await act('POST', '/leave')) load(); };
    $('cb-delete').onclick = async () => { if (await act('DELETE', '', null, 'clubs.confirm_delete')) location.href = '/clubs.html'; };
    $('cb-form').onsubmit = async (ev) => {
      ev.preventDefault();
      const body = { description: $('cb-desc-input').value, announcement: $('cb-announce-input').value, tag: $('cb-tag-input').value, color: state.color };
      if (state.club.myRole === 'owner') body.joinPolicy = $('cb-policy').value;
      if (state.club.chat) {
        body.chatSettings = {};
        for (const box of document.querySelectorAll('#cb-chatset input[data-chat]')) body.chatSettings[box.dataset.chat] = box.checked;
      }
      if (await act('PUT', '', body)) load();
    };
    $('cb-invite-form').onsubmit = async (ev) => {
      ev.preventDefault();
      const name = $('cb-invite-name').value.trim();
      if (!name) return;
      const ok = await act('POST', '/invites/' + encodeURIComponent(name), {});
      $('cb-invite-msg').textContent = ok ? '' : $('cb-msg').textContent; // error beside the field
      if (!ok) $('cb-msg').textContent = '';
      if (ok) {
        $('cb-invite-form').reset();
        $('cb-invite-sugg').hidden = true;
        load();
      }
    };
    $('cb-invite-name').addEventListener('input', suggestInvitees);
    $('cb-copy').onclick = async () => {
      const url = location.origin + '/c/' + encodeURIComponent(slug);
      try { await navigator.clipboard.writeText(url); $('cb-msg').textContent = t('clubs.link_copied'); } catch (_) { $('cb-msg').textContent = url; }
    };
    $('cb-member-search').oninput = renderRoster;
    $('cb-role-filter').onchange = $('cb-member-sort').onchange = renderRoster;
    $('cb-log-search').oninput = renderHistory;
    $('cb-bulk-action').onchange = () => { $('cb-duration').hidden = $('cb-bulk-action').value !== 'mute'; };
    $('cb-bulk').onsubmit = async (ev) => {
      ev.preventDefault();
      const usernames = [...$('cb-members-body').querySelectorAll('input:checked')].map((n) => n.value);
      if (!usernames.length) { $('cb-msg').textContent = 'Chọn ít nhất một thành viên.'; return; }
      if (!window.confirm('Áp dụng tác vụ cho ' + usernames.join(', ') + '?')) return;
      if (await act('POST', '/moderation', { action: $('cb-bulk-action').value, usernames, minutes: Number($('cb-minutes').value) })) await load();
    };
    $('cb-poll-new').onclick = () => openPoll('');
    $('cb-poll-cancel').onclick = () => $('cb-poll-editor').close();
    $('cb-add-option').onclick = () => addOption('').focus();
    $('cb-poll-form').oninput = previewPoll;
    $('cb-poll-form').onsubmit = async (ev) => {
      ev.preventDefault();
      const submit = $('cb-poll-form').querySelector('[type="submit"]');
      if (submit.disabled) return;
      submit.disabled = true;
      try {
        const result = await act('POST', '/polls', { question: $('cb-question').value, options: options().map((f) => f.value) });
        if (!result) { $('cb-poll-error').textContent = $('cb-msg').textContent; return; }
        $('cb-poll-editor').close();
        $('cb-chat-input').value = '';
        await fetchChat('newer');
      } finally { submit.disabled = false; }
    };
    $('cb-event-form').oninput = previewEvent;
    $('cb-event-form').onsubmit = async (ev) => {
      ev.preventDefault();
      const when = new Date($('cb-event-when').value); // datetime-local = viewer's local time
      if (Number.isNaN(when.getTime())) return;
      if (await act('POST', '/events', { title: $('cb-event-title').value, startsAt: when.toISOString() })) {
        $('cb-event-form').reset();
        $('cb-event-preview').textContent = '';
        load();
      }
    };
    for (const ch of ALL_CHANNELS) {
      $('cb-ch-' + ch).addEventListener('click', () => showChannel(ch, { updateHash: true }));
    }
    // Up/Down (and Left/Right on the phone's horizontal strip) move focus between channels.
    $('cb-channels').addEventListener('keydown', (ev) => {
      const d = ev.key === 'ArrowDown' || ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowUp' || ev.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      const list = visibleChannels();
      const at = list.indexOf(document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.ch : state.ch);
      const next = list[(at + d + list.length) % list.length];
      $('cb-ch-' + next).focus();
      ev.preventDefault();
    });
    $('cb-mem-more').onclick = () => showChannel('members', { updateHash: true });
    // Hand the club to the tournament create modal (sessionStorage: lobby-home strips the query string).
    $('cb-tournament-new').onclick = () => {
      sessionStorage.setItem('gvn_club_tournament', slug);
      location.href = '/index.html#tournaments';
    };
    $('cb-chat-older').onclick = () => fetchChat('older');
    $('cb-chat-form').onsubmit = async (ev) => {
      ev.preventDefault();
      const text = $('cb-chat-input').value.trim();
      if (!text) return;
      hideHints();
      const match = /^\/([a-z]+)(?:\s+([\s\S]*))?$/i.exec(text);
      const kind = match && window.ClubPolicy.find(match[1])?.kind;
      const arg = match?.[2] || '';
      if (kind === 'poll' && chatSet().cmdPoll) { openPoll(arg); return; }
      if (kind === 'calendar' && isStaff() && chatSet().cmdCalendar) {
        const draft = window.ClubPolicy.parseEventArg(arg);
        $('cb-event-title').value = draft.title || arg;
        const at = draft.startsAt && new Date(draft.startsAt);
        $('cb-event-when').value = at ? new Date(+at - at.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
        showChannel('events', { updateHash: true });
        previewEvent();
        $('cb-event-title').focus();
        $('cb-chat-input').value = '';
        return;
      }
      const sent = await act('POST', '/messages', { text });
      if (sent) {
        $('cb-chat-input').value = '';
        if (sent.kind === 'moderated') await load();
        if (sent.kind === 'help') {
          $('cb-chat-input').value = '/';
          $('cb-chat-input').focus();
          renderHints();
          return;
        }
        if (sent.kind === 'pin') load(); // the pinned bar above the stream shows the new text
        if (sent.kind === 'calendar' || sent.kind === 'event') { // B450: /lich stores nothing in chat; show the events channel
          if (sent.kind === 'event') await load();
          else renderEvents(sent.events, isStaff()); // fresh list from the reply
          showChannel('events', { updateHash: true });
          return;
        }
        await fetchChat('newer');
        const s = $('cb-stream');
        s.scrollTop = s.scrollHeight;
      }
    };
    $('cb-chat-input').addEventListener('input', () => { state.hint = 0; renderHints(); });
    $('cb-chat-input').addEventListener('keydown', hintKeys);
    $('cb-chat-input').addEventListener('blur', () => setTimeout(hideHints, 150)); // let a click on a hint land first
    setInterval(() => {
      if (document.hidden) return;
      if (state.ch === 'chat' && state.chat.loaded) fetchChat('newer');
      else if (isMember() && chatSet().unreadDot) peekUnread();
    }, CHAT_POLL_MS);
    document.addEventListener('visibilitychange', syncUnread);
    window.addEventListener('hashchange', () => showChannel(currentChannel()));
    load();
    window.ClubKit.fetchMine().then((mine) => { state.mine = mine; renderRail(); });
  });
})();
