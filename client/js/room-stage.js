'use strict';

/**
 * room-stage.js — phone "live stage" under the board (#368, mockup features/room-mobile-panel, direction C).
 *
 * Phones (≤768px, active()): stage under the board, dock at the bottom, tabs in a bottom sheet.
 * #369 desktop (on() but not active()): the same stage overlays the board, the dock overlays the right column, the
 * Tỉ số hero lives in the left #scorecard; no sheet, no unread badge (the chat is always on screen).
 *   - A seated player's chat → speech bubble next to that player's seat card (fades after BUBBLE_MS, never takes taps).
 *   - A spectator's chat → pill rising from the bottom-left of the stage (max FLY_MAX).
 *   - Spectators leave the tabs: avatar stack in the dock (tap → popover with names, host can still kick).
 *   - 👏 floats up for everyone (socket room:react; the sender plays it locally, the server skips the sender).
 *   - The tabs (Chat · Tỉ số · Nước đi · Cài đặt) live in a bottom sheet opened from the dock; unread badge on it.
 * The full chat log stays in #chat-messages (sheet → Chat), so nothing is lost when a bubble fades.
 *
 * Reads: window.RoomState (roomData, myUser, myRole), window.RoomUI.avatarInner. Writes: DOM only + room:react.
 *   - Tỉ số tab: big score between the two seat-card faces, result dots and one row per game (room.gameLog).
 * Exports: window.RoomStage = { active (phone sheet mode), on (stage at any width), onChat, onReact, renderAudience,
 *   renderScores, setSheetOpen }
 */
(function (global) {
  const S = () => global.RoomState;
  const PHONE_MQ = '(max-width: 768px)';
  const BUBBLE_MS = 4000;
  const FLY_MS = 8000;
  const FLY_MAX = 3;       // room for three pills under the tiles on a tall phone
  const FLY_MAX_SHORT = 1; // stage squeezed (SE-class): one pill overlapping the tiles, taps pass through
  const REACT_MAX = 25; // five bursts
  const REACT_EMOJI = { clap: '👏', heart: '❤️', fire: '🔥', wow: '😮' };
  // One tap = a small burst (mockup C): the tapped kind leads, three companions follow, staggered.
  const BURST = [[0, 0], ['fire', 150], ['heart', 300], [0, 500], ['wow', 700]];
  const DOTS_MAX = 10;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => (global.EscapeUtils && global.EscapeUtils.escapeHtml ? global.EscapeUtils.escapeHtml(s) : String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const chatText = (txt) => (global.EscapeUtils && global.EscapeUtils.decodeChatText ? global.EscapeUtils.decodeChatText(txt) : txt);
  const mq = global.matchMedia ? global.matchMedia(PHONE_MQ) : null;

  let unread = 0;

  function on() {
    return !!(document.body.classList.contains('arena-room') && $('stage'));
  }
  // Phone sheet mode (bottom sheet, unread badge, Tỉ số tab).
  function active() {
    return !!(mq && mq.matches && on());
  }

  // ── Chat input lives in the dock at every width (#369: the desktop dock sits under the right column) ──
  // Moving the node keeps its listeners (room.js binds #chat-input / #btn-send by id).
  function placeChatInput() {
    const wrap = $('chat-input-wrapper');
    const dock = $('rdock');
    if (!wrap || !dock || !on()) return;
    const input = $('chat-input');
    const t = global.t || ((k) => k);
    const anchor = $('btn-react');
    if (wrap.parentNode !== dock) dock.insertBefore(wrap, anchor || null);
    // mockup C: "Bình luận…" in the dock. The i18n key moves too, or the next applyTranslations() puts it back.
    if (input) { input.dataset.i18nPlaceholder = 'room.ph_comment'; input.placeholder = t('room.ph_comment'); }
  }

  // ── #369 score: hero in the left #scorecard on desktop, in the Tỉ số tab on phones ──
  function placeScores() {
    const hero = $('score-hero');
    const card = $('scorecard');
    const tab = $('tab-users');
    if (!hero || !card || !tab) return;
    if (active()) {
      if (hero.parentNode !== tab) tab.insertBefore(hero, $('score-panel') || tab.firstChild);
      return;
    }
    const empty = card.querySelector('.scorecard__empty');
    if (hero.parentNode !== card) card.insertBefore(hero, empty || null);
    // The Tỉ số tab is hidden on desktop: never leave it as the open tab (the column would be blank).
    if (document.querySelector('#tab-users.tab-content--active') && global.RoomTabs && global.RoomTabs.activate) {
      global.RoomTabs.activate('tab-chat');
    }
  }

  function layout() {
    placeChatInput();
    placeScores();
    setSheetOpen(false);
  }

  // ── Bottom sheet ───────────────────────────────────────────────────────────
  function setSheetOpen(open) {
    const btn = $('btn-sheet');
    const sheet = $('rsheet');
    const scrim = $('rsheet-scrim');
    if (!sheet) return;
    const isOpen = !!open && active();
    document.body.classList.toggle('stage-sheet-open', isOpen);
    if (btn) btn.setAttribute('aria-expanded', String(isOpen));
    if (scrim) scrim.hidden = !isOpen;
    if (active()) {
      if (isOpen) sheet.removeAttribute('inert'); else sheet.setAttribute('inert', '');
    } else {
      sheet.removeAttribute('inert');
    }
    if (isOpen) {
      renderScores();
      if (unread > 0 && global.RoomTabs && global.RoomTabs.activate) global.RoomTabs.activate('tab-chat');
      if (document.querySelector('#tab-chat.tab-content--active')) setUnread(0);
      const log = $('chat-messages');
      if (log) log.scrollTop = log.scrollHeight;
    }
  }

  function setUnread(n) {
    unread = n;
    const badge = $('sheet-badge');
    if (!badge) return;
    badge.hidden = n <= 0;
    badge.textContent = n > 9 ? '9+' : String(n);
  }

  function chatTabVisible() {
    return document.body.classList.contains('stage-sheet-open') && !!document.querySelector('#tab-chat.tab-content--active');
  }

  // ── Chat routing ───────────────────────────────────────────────────────────
  // Returns true when the stage showed the message (ChatUI then skips its float toast).
  function onChat(msg) {
    if (!on() || !msg || msg.isSystem) return false;
    if (active() && !chatTabVisible()) setUnread(unread + 1);
    const st = S();
    const users = (st && st.roomData && st.roomData.users) || [];
    const sender = msg.fromId ? users.find((u) => u.userId === msg.fromId) : null;
    if (sender && (sender.slot === 1 || sender.slot === 2)) return showBubble(sender.slot, msg);
    return showFly(sender, msg);
  }

  function showBubble(slot, msg) {
    const card = document.querySelector(`.seatcard[data-slot="${slot}"]`);
    const layer = $('speech-layer');
    if (!card || !layer) return false;
    const top = card.classList.contains('seatcard--top');
    const old = layer.querySelector(`.speech[data-slot="${slot}"]`);
    if (old) old.remove();
    const el = document.createElement('div');
    el.dataset.slot = String(slot);
    el.textContent = chatText(msg.text);
    const r = card.getBoundingClientRect();
    if (!active()) {
      // #369 desktop: left column → beside the card, pointing at the board; top-row layout (<1100px) → under the card.
      const shell = $('board-area-shell');
      const b = shell ? shell.getBoundingClientRect() : null;
      const side = !!(b && b.width && r.right <= b.left + 1);
      el.className = 'speech ' + (side ? 'speech--side' : 'speech--top') + (top ? '' : ' speech--mine');
      if (side) {
        el.style.top = Math.round(r.top + 14) + 'px';
        el.style.left = Math.round(r.right - 24) + 'px';
      } else {
        el.style.top = Math.round(r.bottom + 8) + 'px';
        el.style.left = Math.round(r.left + 12) + 'px';
      }
    } else if (top) {
      el.className = 'speech speech--top';
      el.style.top = Math.round(r.bottom + 8) + 'px';
      el.style.left = Math.round(r.left + 12) + 'px';
    } else {
      el.className = 'speech speech--bottom';
      el.style.bottom = Math.round(global.innerHeight - r.top + 8) + 'px';
      el.style.right = Math.round(global.innerWidth - r.right + 12) + 'px';
    }
    layer.appendChild(el);
    setTimeout(() => el.classList.add('speech--out'), BUBBLE_MS);
    setTimeout(() => el.remove(), BUBBLE_MS + 400);
    return true;
  }

  function showFly(sender, msg) {
    const fly = $('stage-fly');
    const stage = $('stage');
    if (!fly || !stage) return false;
    // The pills overlay the area just above the dock (pointer-events:none). Where the stage is squeezed to nothing
    // (short phones) only the newest one shows, so the action tiles are covered as little as possible.
    const max = !active() || stage.clientHeight >= 110 ? FLY_MAX : FLY_MAX_SHORT;
    const el = document.createElement('div');
    el.className = 'fly';
    const av = document.createElement('span');
    av.className = 'fly__av';
    av.innerHTML = sender ? avatar(sender) : esc(initialsOf(msg.from));
    const body = document.createElement('span');
    body.className = 'fly__text';
    const name = document.createElement('b');
    name.textContent = msg.from || '';
    body.append(name, document.createTextNode(' ' + chatText(msg.text)));
    el.append(av, body);
    fly.appendChild(el);
    while (fly.children.length > max) fly.removeChild(fly.firstChild);
    setTimeout(() => el.remove(), FLY_MS);
    return true;
  }

  // ── Reactions ──────────────────────────────────────────────────────────────
  function onReact(data) {
    if (!on() || !data || !REACT_EMOJI[data.kind]) return;
    burst(data.kind);
  }

  function burst(kind) {
    BURST.forEach(([k, delay], i) => floatReaction(k || kind, delay, i));
  }

  function floatReaction(kind, delay = 0, i = 0) {
    const box = $('stage-reacts');
    if (!box) return;
    const el = document.createElement('span');
    el.className = 'react';
    el.textContent = REACT_EMOJI[kind];
    el.style.animationDelay = delay + 'ms';
    el.style.left = [0, 20, 8, 28, 4][i % 5] + Math.round(Math.random() * 6) + 'px';
    el.style.setProperty('--drift', Math.round(Math.random() * 24 - 12) + 'px');
    box.appendChild(el);
    while (box.children.length > REACT_MAX) box.removeChild(box.firstChild);
    el.addEventListener('animationend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 2400 + delay);
  }

  let lastReactAt = 0;
  function sendReaction() {
    const now = Date.now();
    if (now - lastReactAt < 250) return; // the server allows 8 per 3 s; this just stops a stuck finger
    lastReactAt = now;
    burst('clap');
    if (global.RoomClient) global.RoomClient.emit('room:react', { kind: 'clap' });
  }

  // ── Tỉ số tab (mockup C) ───────────────────────────────────────────────────
  // Left = the top seat card's player, right = the bottom one (you, when seated) — the same sides as on screen.
  // Big numbers = scoreTable wins (cumulative); dots + rows = room.gameLog (last games, server-capped).
  function fmtDuration(ms) {
    if (typeof ms !== 'number' || !isFinite(ms)) return '—';
    const sec = Math.round(ms / 1000);
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  }

  function renderScores() {
    const box = $('score-hero');
    if (!box) return;
    const st = S();
    const rd = (st && st.roomData) || {};
    const users = rd.users || [];
    const log = Array.isArray(rd.gameLog) ? rd.gameLog : [];
    const t = global.t || ((k) => k);
    const slotOf = (sel, dflt) => { const el = document.querySelector(sel); return el && el.dataset.slot ? Number(el.dataset.slot) : dflt; };
    const last = log[log.length - 1];
    const side = (slot, idx) => users.find((u) => u.slot === slot)
      || (last && last.players[idx] ? { userId: last.players[idx].userId, displayName: last.players[idx].name, avatarUrl: null } : null);
    const left = side(slotOf('.seatcard--top', 2), 1);
    const right = side(slotOf('.seatcard--bottom', 1), 0);
    const gs = st && st.gameState;
    const playing = !!(gs && gs.status === 'ongoing');
    if (!left || !right || (!log.length && !playing)) { box.innerHTML = ''; return; }
    const wins = (u) => ((rd.scoreTable || {})[u.userId] || {}).win || 0;
    const pair = log.filter((g) => g.players.some((p) => p.userId === left.userId) && g.players.some((p) => p.userId === right.userId));
    const dots = pair.slice(-DOTS_MAX).map((g) => {
      const cls = g.winnerId === 'draw' ? 'd' : g.winnerId === right.userId ? 'r' : 'l';
      return `<span class="score-dot score-dot--${cls}"></span>`;
    });
    const future = rd.matchMax ? Math.max(0, rd.matchMax - pair.length) : 0;
    for (let i = 0; i < future; i++) dots.push('<span class="score-dot"></span>');
    const nameOf = (id, g) => { const p = g.players.find((x) => x.userId === id); return p ? p.name : '?'; };
    const rows = pair.map((g) => `<tr><td>${esc(t('room.game_n', { n: g.n }))}</td>` +
      (g.winnerId === 'draw' ? `<td>${esc(t('room.game_draw'))}</td>` : `<td class="score-games__w">${esc(t('room.game_won', { name: nameOf(g.winnerId, g) }))}</td>`) +
      `<td>${esc(t('room.game_moves', { n: g.moves }))}</td><td>${fmtDuration(g.durationMs)}</td></tr>`).join('');
    const now = playing
      ? `<tr class="score-games__now"><td>${esc(t('room.game_n', { n: last ? last.n + 1 : 1 }))}</td><td>${esc(t('room.game_playing'))}</td><td>${esc(t('room.game_moves', { n: (gs.moveHistory || []).length }))}</td><td>—</td></tr>`
      : '';
    box.innerHTML = `<div class="score-hero__top">
        <div class="score-hero__p"><span class="score-hero__av">${avatar(left)}</span><span class="score-hero__name">${esc(left.displayName)}</span></div>
        <span class="score-hero__num">${wins(left)}–${wins(right)}</span>
        <div class="score-hero__p"><span class="score-hero__av">${avatar(right)}</span><span class="score-hero__name">${esc(right.displayName)}</span></div>
      </div>
      ${dots.length ? `<div class="score-dots">${dots.join('')}</div>` : ''}
      <table class="score-games"><tbody>${rows}${now}</tbody></table>`;
    bindImgFallback(box);
  }

  // ── Audience (spectators) ──────────────────────────────────────────────────
  function initialsOf(name) {
    const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
    const a = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] || '?').slice(0, 2);
    return a.toUpperCase();
  }

  // Same avatar source as the seat cards (RoomUI.avatarInner), so a face looks the same everywhere (rule 9).
  function avatar(user) {
    if (global.RoomUI && global.RoomUI.avatarInner) return global.RoomUI.avatarInner(user);
    return esc(initialsOf(user.displayName));
  }

  function bindImgFallback(root) {
    root.querySelectorAll('img.seatcard__img').forEach((img) => {
      img.addEventListener('error', () => img.replaceWith(document.createTextNode(img.dataset.ini)), { once: true });
    });
  }

  function renderAudience(guests) {
    const btn = $('aud-stack');
    const pop = $('aud-pop');
    if (!btn || !pop) return;
    const list = Array.isArray(guests) ? guests : [];
    const t = global.t || ((k) => k);
    btn.hidden = list.length === 0;
    if (!list.length) { setAudOpen(false); pop.innerHTML = ''; btn.innerHTML = ''; return; }
    const shown = list.slice(0, 3).map((g) => `<span class="aud__av">${avatar(g)}</span>`).join('');
    const more = list.length > 3 ? `<span class="aud__more">+${list.length - 3}</span>` : '';
    const label = t('room.audience_count', { n: list.length });
    // #369 desktop shows the count next to the faces (CSS hides it on phones)
    btn.innerHTML = `<span class="aud__live" aria-hidden="true"></span>${shown}${more}<span class="aud__label" aria-hidden="true">${esc(label)}</span>`;
    btn.setAttribute('aria-label', label);
    btn.title = label;
    const st = S();
    const canKick = st && st.myRole === 'host' && st.roomData && st.roomData.state !== 'playing';
    pop.innerHTML = `<div class="aud-pop__title"><svg class="icon" aria-hidden="true"><use href="assets/icons/phosphor-sprite.svg?v=cd66da24#ph-regular-eye"></use></svg>${esc(label)}</div><ul class="aud-pop__list">${list.map((g) => {
      const kick = canKick && st.myUser && g.userId !== st.myUser.userId
        ? `<button class="btn-kick" type="button" data-action="kickUser" data-arg="${esc(g.userId)}">${esc(t('room.kick'))}</button>` : '';
      return `<li><span class="aud__av">${avatar(g)}</span><span class="aud-pop__name">${esc(g.displayName)}</span>${kick}</li>`;
    }).join('')}</ul>`;
    bindImgFallback(btn);
    bindImgFallback(pop);
  }

  function setAudOpen(open) {
    const btn = $('aud-stack');
    const pop = $('aud-pop');
    if (!btn || !pop) return;
    pop.hidden = !open;
    btn.setAttribute('aria-expanded', String(!!open));
  }

  // ── Wiring ─────────────────────────────────────────────────────────────────
  function init() {
    if (document.body.dataset.roomStageBound) return;
    document.body.dataset.roomStageBound = '1';
    layout();
    if (mq) {
      if (mq.addEventListener) mq.addEventListener('change', layout); else if (mq.addListener) mq.addListener(layout);
    }
    // #369: the desktop score card is always on screen, so its "Ván N · đang chơi · X nước" row follows the moves.
    const grid = $('moves-grid');
    if (grid && global.MutationObserver) new global.MutationObserver(() => { if (!active()) renderScores(); }).observe(grid, { childList: true });
    const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
    on('btn-sheet', () => setSheetOpen(!document.body.classList.contains('stage-sheet-open')));
    on('rsheet-grab', () => setSheetOpen(false));
    on('rsheet-scrim', () => setSheetOpen(false));
    on('btn-react', sendReaction);
    on('stage-handle', () => setSheetOpen(true));
    // Swipe up on the stage (mockup C's handle: "vuốt lên: lịch sử") opens the sheet.
    const stage = $('stage');
    if (stage) {
      let y0 = null;
      stage.addEventListener('pointerdown', (e) => { y0 = e.clientY; });
      stage.addEventListener('pointerup', (e) => { if (y0 !== null && y0 - e.clientY > 30) setSheetOpen(true); y0 = null; });
      stage.addEventListener('pointercancel', () => { y0 = null; });
    }
    on('aud-stack', (e) => { e.stopPropagation(); setAudOpen($('aud-pop').hidden); });
    document.addEventListener('pointerdown', (e) => {
      const pop = $('aud-pop');
      if (pop && !pop.hidden && !e.target.closest('#aud-pop, #aud-stack')) setAudOpen(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      setAudOpen(false);
      if (document.body.classList.contains('stage-sheet-open')) setSheetOpen(false);
    });
    // Picking the Chat tab inside the open sheet clears the badge.
    document.querySelectorAll('.tab-btn').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.tab === 'tab-chat' && document.body.classList.contains('stage-sheet-open')) setUnread(0);
    }));
  }

  global.RoomStage = { active, on, onChat, onReact, renderAudience, renderScores, setSheetOpen, init, _setUnread: setUnread };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);
