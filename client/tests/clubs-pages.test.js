/**
 * TODO.md #178 — clubs list + club page: text-only rendering, role-based controls.
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/c/caro"}
 */

'use strict';

const fs = require('fs');
const path = require('path');

const body = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
  .match(/<body[^>]*>([\s\S]*)<\/body>/i)[1].replace(/<script[\s\S]*?<\/script>/g, '');

const CLUB = {
  slug: 'caro', name: '<i>Caro</i>', description: 'desc', joinPolicy: 'invite', members: 2, avgRating: 1500, myRole: null, category: 'freestyle',
  leaderboard: [
    { rank: 1, username: 'own', displayName: 'Own', role: 'owner', rating: 1600, games: 30 },
    { rank: 2, username: 'mem', displayName: 'Mem', role: 'member', rating: null, games: 0 },
  ],
};
const flush = () => new Promise((r) => setTimeout(r, 0));
const ok = (b) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(b) });

async function bootClub(club) {
  jest.resetModules();
  document.body.innerHTML = body('club.html');
  window.t = (k, v) => k + (v ? JSON.stringify(v) : '');
  global.fetch = jest.fn(() => ok(club));
  require('../js/platform-shell.js');
  require('../js/club.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await flush(); await flush();
}

describe('club page', () => {
  it('renders names as text; non-member sees Request (invite club) and no manage panel', async () => {
    await bootClub(CLUB);
    expect(global.fetch.mock.calls[0][0]).toContain('/api/clubs/caro?category=freestyle');
    expect(document.getElementById('cb-name').textContent).toBe('<i>Caro</i>');
    expect(document.querySelector('#cb-name i')).toBeNull();
    expect(document.getElementById('cb-join').hidden).toBe(false);
    expect(document.getElementById('cb-join').textContent).toBe('clubs.request');
    expect(document.getElementById('cb-manage').hidden).toBe(true);
    expect(document.querySelectorAll('#cb-body tr')).toHaveLength(2);
    expect(document.querySelectorAll('#cb-body tr')[1].children[3].textContent).toBe('—');
  });

  it('owner sees manage panel, delete, kick/transfer on others, but no leave', async () => {
    await bootClub({ ...CLUB, myRole: 'owner', pending: [{ username: 'p', displayName: 'P' }] });
    expect(document.getElementById('cb-manage').hidden).toBe(false);
    expect(document.getElementById('cb-delete').hidden).toBe(false);
    expect(document.getElementById('cb-leave').hidden).toBe(true);
    expect(document.getElementById('cb-join').hidden).toBe(true);
    const memRow = document.querySelectorAll('#cb-body tr')[1];
    expect(memRow.querySelectorAll('button')).toHaveLength(3); // kick, promote, transfer
    expect(document.querySelectorAll('#cb-body tr')[0].querySelectorAll('button')).toHaveLength(0);
    expect(document.querySelectorAll('#cb-pending button')).toHaveLength(2);
  });

  it('officer can kick members but cannot change roles', async () => {
    await bootClub({ ...CLUB, myRole: 'officer' });
    expect(document.getElementById('cb-delete').hidden).toBe(true);
    expect(document.querySelectorAll('#cb-body tr')[1].querySelectorAll('button')).toHaveLength(1);
  });

  it('pending requester can cancel', async () => {
    await bootClub({ ...CLUB, myRole: 'pending' });
    expect(document.getElementById('cb-leave').hidden).toBe(false);
    expect(document.getElementById('cb-leave').textContent).toBe('clubs.cancel_request');
  });
});
