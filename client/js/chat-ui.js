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

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const chatMessages   = document.getElementById('chat-messages');
  const floatContainer = document.getElementById('float-messages');

  // ── Chat messages ─────────────────────────────────────────────────────────

  function appendChatMessage(msg) {
    const div = document.createElement('div');

    if (msg.isSystem) {
      div.className = 'chat-msg chat-msg--system';
      div.textContent = msg.text;
    } else {
      const isSelf = msg.from === (S().myUser ? S().myUser.username : '');
      div.className = `chat-msg ${isSelf ? 'chat-msg--self' : 'chat-msg--other'}`;

      const bubble = document.createElement('div');
      bubble.className = 'chat-msg__bubble';

      if (!isSelf) {
        const nameSpan = document.createElement('div');
        nameSpan.className = 'chat-msg__name';
        nameSpan.textContent = msg.from;
        bubble.appendChild(nameSpan);
      }

      const textSpan = document.createElement('div');
      textSpan.className = 'chat-msg__text';
      textSpan.textContent = msg.text;
      bubble.appendChild(textSpan);

      div.appendChild(bubble);
    }

    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Also show as float message during a game (non-system messages only)
    if (S().gameState && !msg.isSystem) {
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
      el.textContent = msg.text;
    } else {
      const nameSpan = document.createElement('span');
      nameSpan.className = 'float-msg__name';
      nameSpan.textContent = msg.from + ':';
      el.appendChild(nameSpan);
      el.appendChild(document.createTextNode(' ' + msg.text));
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
