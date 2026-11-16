/**
 * Room nav: click the table code to copy it; QR button shows a join-link QR.
 * @jest-environment jsdom
 */
'use strict';
const fs = require('fs');
const path = require('path');
const JS = (n) => fs.readFileSync(path.join(__dirname, '..', 'js', n), 'utf8');

function setup() {
  document.body.innerHTML = `<span id="room-id-nav"></span><button id="btn-room-qr"></button>
    <span id="room-mode-badge" hidden></span>`;
  window.t = (k) => k;
  window.EscapeUtils = require('../js/escape-utils.js');
  window.RoomClient = { on() { return this; }, emit() {}, emitAck() {} };
  window.RoomState = { get: () => ({ roomData: null }) };
  window.showToast = jest.fn();
  window.qrcode = require('../js/qrcode-generator.js');
  const writeText = jest.fn().mockResolvedValue();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  window.eval(JS('room-ui.js'));
  return writeText;
}

test('click on the code copies it and toasts', async () => {
  const writeText = setup();
  const nav = document.getElementById('room-id-nav');
  nav.dataset.code = '#A3F';
  nav.click();
  await Promise.resolve(); await Promise.resolve();
  expect(writeText).toHaveBeenCalledWith('#A3F');
  expect(window.showToast).toHaveBeenCalled();
});

test('QR button opens a modal with an svg QR and closes', () => {
  setup();
  document.getElementById('room-id-nav').dataset.code = '#A3F';
  document.getElementById('btn-room-qr').click();
  const ov = document.querySelector('.modal-overlay');
  expect(ov.querySelector('svg')).toBeTruthy();
  ov.querySelector('[data-qr="close"]').click();
  expect(document.querySelector('.modal-overlay')).toBeNull();
});
