/**
 * Room score table is ordered by points (win 1, draw ½), then wins, then fewer losses.
 * @jest-environment jsdom
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'room-ui.js'), 'utf8');

function names(scoreTable) {
  delete window.RoomUI;
  document.body.innerHTML = '<div id="score-panel"></div><table><tbody id="score-body"></tbody></table>';
  window.t = (k) => k;
  window.EscapeUtils = { escapeAttr: (s) => s, escapeHtml: (s) => s };
  window.eval(SRC);
  window.RoomState = { roomData: { users: [], scoreTable } };
  window.RoomUI.renderScoreTable();
  return Array.from(document.querySelectorAll('#score-body tr td:first-child')).map((td) => td.textContent);
}

test('highest points first', () => {
  expect(names({
    a: { name: 'A', win: 0, loss: 3, draw: 0 },
    b: { name: 'B', win: 3, loss: 0, draw: 0 },
    c: { name: 'C', win: 1, loss: 0, draw: 0 },
  })).toEqual(['B', 'C', 'A']);
});

test('draws count half; ties broken by wins then fewer losses', () => {
  expect(names({
    a: { name: 'A', win: 0, loss: 0, draw: 2 }, // 1 pt, 0 wins
    b: { name: 'B', win: 1, loss: 5, draw: 0 }, // 1 pt, 1 win, 5 losses
    c: { name: 'C', win: 1, loss: 1, draw: 0 }, // 1 pt, 1 win, 1 loss
  })).toEqual(['C', 'B', 'A']);
});
