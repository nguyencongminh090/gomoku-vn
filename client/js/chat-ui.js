'use strict';

/**
 * chat-ui.js — Chat and notification rendering.
 *
 * Reads from: window.RoomState (myUser, gameState)
 * Writes to:  DOM only
 *
 * Exports (on window):
 *   ChatUI.appendChatMessage(msg)
 *   ChatUI.appendSystemMessage(text)
 *   ChatUI.showFloatMessage(msg)
 *   window.showToast(message, type, duration)
 */

(function(global) {
  'use strict';

  const S = () => global.RoomState;

  // Server-sent chat text arrives with `<`/`>` escaped (ChatHandler.sanitize).
  // Decode immediately before writing it into a text node so the reader sees
  // what the sender typed rather than `&lt;b&gt;`. Safe because textContent
  // never parses its input as markup — see EscapeUtils.decodeChatText.
  const chatText = (txt) => global.EscapeUtils.decodeChatText(txt);

  // Server system-chat events carry a language-neutral `code` (+ `vars` for
  // interpolation) alongside the Vietnamese `text` (logs/back-compat) — same
  // convention as error payloads. Prefer translating via `code` so English
  // mode doesn't show these announcements in Vietnamese (TODO #45).
  // ROOM_SETTINGS_CHANGED carries `vars.changes` ([{k, v}]); name what changed (#286).
  const settingLabel = (k, v) => {
    const on = t(v ? 'sys.set_on' : 'sys.set_off');
    switch (k) {
      case 'boardSize':     return t('modal.board_size') + ': ' + v + '×' + v;
      case 'winningRule':   return t('rule.' + v);
      case 'ruleWall':      return t('modal.rule_wall') + ': ' + on;
      case 'rulePortal':    return t('modal.rule_portal') + ': ' + on;
      case 'ruleSwap2':     return 'Swap2: ' + on;
      case 'ranked':        return t('room.ranked') + ': ' + on;
      case 'timerMode':     return t('modal.timer_mode') + ': ' + t('room.timer_' + v);
      case 'timerSeconds':  return t('sys.set_timer_seconds') + ': ' + v + 's';
      case 'timerIncrementSeconds': return t('sys.set_increment') + ': +' + v + 's';
      default:              return null;
    }
  };
  const systemText = (msg) => {
    if (!msg.code) return msg.text;
    if (msg.code === 'ROOM_SETTINGS_CHANGED' && msg.vars && Array.isArray(msg.vars.changes)) {
      const detail = msg.vars.changes.map(c => settingLabel(c.k, c.v)).filter(Boolean).join(' · ');
      if (detail) return t('sys.room_settings_changed_detail', { detail });
    }
    return t('sys.' + msg.code.toLowerCase(), msg.vars);
  };

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const chatMessages   = document.getElementById('chat-messages');
  const floatContainer = document.getElementById('float-messages');

  // ── Chat messages ─────────────────────────────────────────────────────────

  function appendChatMessage(msg) {
    const div = document.createElement('div');

    if (msg.isSystem) {
      div.className = 'chat-msg chat-msg--system';
      div.textContent = systemText(msg);
    } else {
      // Compares displayName because that is what the server puts in
      // `msg.from` (ChatHandler.js: `from: user.displayName`). This used to
      // read `.username`, which never matched for anyone whose display name
      // differed from their login handle — so own messages rendered as
      // someone else's. The session identity introduced by TODO.md #68 has no
      // `username` field at all, which is what surfaced the mismatch.
      const isSelf = !!(S().myUser && msg.from === S().myUser.displayName);
      div.className = `chat-msg ${isSelf ? 'chat-msg--self' : 'chat-msg--other'}`;

      const bubble = document.createElement('div');
      bubble.className = 'chat-msg__bubble';

      // #368: who said it — avatar + "người chơi" tag. Rendered always, shown only in the phone sheet (CSS).
      const users = (S() && S().roomData && S().roomData.users) || [];
      const sender = msg.fromId ? users.find((u) => u.userId === msg.fromId) : null;
      const isPlayer = !!(sender && (sender.slot === 1 || sender.slot === 2));
      if (isPlayer) div.classList.add('chat-msg--player');
      if (!isSelf && global.RoomUI && typeof global.RoomUI.avatarInner === 'function') {
        const av = document.createElement('span');
        av.className = 'chat-msg__av';
        av.setAttribute('aria-hidden', 'true');
        av.innerHTML = global.RoomUI.avatarInner(sender || { displayName: msg.from }); // escaped / URL-checked there
        const img = av.querySelector('img');
        if (img) img.addEventListener('error', () => img.replaceWith(document.createTextNode(img.dataset.ini)), { once: true });
        div.appendChild(av);
      }

      if (!isSelf) {
        const nameSpan = document.createElement('div');
        nameSpan.className = 'chat-msg__name';
        nameSpan.textContent = msg.from;
        if (isPlayer) {
          const tag = document.createElement('span');
          tag.className = 'chat-msg__tag';
          tag.textContent = ' · ' + t('room.player_tag');
          nameSpan.appendChild(tag);
        }
        bubble.appendChild(nameSpan);
      }

      const textSpan = document.createElement('div');
      textSpan.className = 'chat-msg__text';
      textSpan.textContent = chatText(msg.text);
      bubble.appendChild(textSpan);

      div.appendChild(bubble);
    }

    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Also show as a float toast (non-system messages only) — always, not
    // just mid-game, so a message sent from the mobile quick chat bar while
    // the sheet is collapsed pre-game still surfaces to the sender/others.
    // #368 phones: the live stage shows it (bubble on the seat card / spectator pill) instead of the toast.
    if (!msg.isSystem && !(global.RoomStage && global.RoomStage.onChat(msg))) {
      showFloatMessage(msg);
    }
  }

  function appendSystemMessage(text) {
    appendChatMessage({ from: null, text, isSystem: true, timestamp: Date.now() });
    showToast(text, text.indexOf('⚠') !== -1 ? 'error' : 'info');
  }

  // ── Float messages (during game, overlaid on board) ───────────────────────

  function showFloatMessage(msg) {
    if (!floatContainer) return;

    const el = document.createElement('div');
    el.className = msg.isSystem ? 'float-msg float-msg--system' : 'float-msg';

    if (msg.isSystem) {
      el.textContent = systemText(msg);
    } else {
      const nameSpan = document.createElement('span');
      nameSpan.className = 'float-msg__name';
      nameSpan.textContent = msg.from + ':';
      el.appendChild(nameSpan);
      el.appendChild(document.createTextNode(' ' + chatText(msg.text)));
    }

    floatContainer.appendChild(el);

    const visibleCount = floatContainer.children.length;
    const duration = Math.max(3000, 10000 / visibleCount);
    el.style.animationDuration = `0.3s, ${duration}ms`;
    el.style.animationDelay = `0s, ${duration * 0.6}ms`;

    setTimeout(() => { if (el.parentNode) el.remove(); }, duration);

    while (floatContainer.children.length > 6) {
      floatContainer.removeChild(floatContainer.firstChild);
    }
  }

  // ── Toast notifications ───────────────────────────────────────────────────

  function showToast(message, type = 'info', duration = 4000) {
    let stack = document.getElementById('toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'toast-stack';
      stack.className = 'toast-stack';
      stack.setAttribute('aria-live', 'polite');
      document.body.appendChild(stack);
    }

    const el = document.createElement('div');
    el.className = 'toast toast--' + type;
    el.textContent = message;
    el.style.animationDelay = '0s, ' + Math.max(duration - 400, 0) + 'ms';
    stack.appendChild(el);

    setTimeout(() => { if (el.parentNode) el.remove(); }, duration);

    while (stack.children.length > 5) {
      stack.removeChild(stack.firstChild);
    }
  }

  // ── Exports ───────────────────────────────────────────────────────────────
  global.ChatUI = { appendChatMessage, appendSystemMessage, showFloatMessage };
  global.showToast = showToast; // kept on window for backward-compat onclick handlers

})(window);
