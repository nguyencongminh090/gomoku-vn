/**
 * #286: the "room settings changed" chat notice names what changed.
 * @jest-environment jsdom
 */
'use strict';
const fs = require('fs');
const path = require('path');
const load = (f) => window.eval(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'));

beforeAll(() => {
  document.body.innerHTML = '<div id="chat-messages"></div><div id="float-messages"></div>';
  window.EscapeUtils = { decodeChatText: (s) => s };
  window.RoomState = { myUser: null, gameState: null };
  load('i18n.js');
  load('chat-ui.js');
});

const notice = (changes) => {
  const box = document.getElementById('chat-messages');
  box.innerHTML = '';
  window.ChatUI.appendChatMessage({ isSystem: true, code: 'ROOM_SETTINGS_CHANGED', text: 'x', vars: { changes } });
  return box.textContent;
};

test('names each changed setting', () => {
  const txt = notice([{ k: 'boardSize', v: 19 }, { k: 'ranked', v: false }]);
  expect(txt).toContain('19×19');
  expect(txt).toContain('Tính điểm xếp hạng');
  expect(txt).toContain('tắt');
  expect(txt).not.toContain('{detail}');
});

test('falls back to the generic line without changes', () => {
  expect(notice([])).toBe('Cài đặt phòng đã được thay đổi.');
});
