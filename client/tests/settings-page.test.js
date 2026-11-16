/**
 * #199 — settings page: prefill from /api/profile, save payload, country list, text-only rendering.
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/settings.html"}
 */

'use strict';

const fs = require('fs');
const path = require('path');

const BODY_HTML = fs.readFileSync(path.join(__dirname, '..', 'settings.html'), 'utf8')
  .match(/<body[^>]*>([\s\S]*)<\/body>/i)[1].replace(/<script[\s\S]*?<\/script>/g, '');

const PROFILE = {
  username: 'alice', displayName: '<img src=x onerror=alert(1)>', avatarUrl: null, bio: 'hi <b>there</b>', isSelf: true,
  privacy: { hideHistory: true, hideBio: false, hideOnline: true, country: 'VN', city: 'Hà Nội', whoCanDm: 'friends', whoCanChallenge: 'nobody', whoCanFriend: 'everyone' },
};
const flush = () => new Promise((r) => setTimeout(r, 0));
const $ = (id) => document.getElementById(id);

async function boot({ me = { username: 'alice' }, meStatus = 200, putOk = true, user } = {}) {
  jest.resetModules();
  document.body.innerHTML = BODY_HTML;
  window.t = (k) => k;
  window.GvnSession = { getUser: () => user };
  global.fetch = jest.fn((url, opts) => {
    if (url === '/api/rankings/me') return Promise.resolve({ ok: meStatus === 200, status: meStatus, json: () => Promise.resolve(me) });
    if (opts && opts.method === 'PUT') return Promise.resolve({ ok: putOk, status: putOk ? 200 : 400, json: () => Promise.resolve({ ok: true }) });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(PROFILE) });
  });
  require('../js/platform-shell.js');
  require('../js/countries.js');
  require('../js/settings.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await flush(); await flush(); await flush();
}

// Audience choices are radio groups (SB bento): value = the checked radio, options = the radios.
const aud = (id) => (document.querySelector('#' + id + ' input:checked') || {}).value;
const audOptions = (id) => [...document.querySelectorAll('#' + id + ' input')].map((r) => r.value);
const pick = (id, v) => { document.querySelector('#' + id + ' input[value="' + v + '"]').checked = true; };

describe('settings page', () => {
  it('prefills every control from the profile and renders user text as text', async () => {
    await boot();
    expect($('st-content').hidden).toBe(false);
    expect($('st-bio').value).toBe('hi <b>there</b>');
    expect($('st-country').value).toBe('VN');
    expect($('st-city').value).toBe('Hà Nội');
    expect($('st-hide-history').checked).toBe(true);
    expect($('st-hide-bio').checked).toBe(false);
    expect($('st-hide-online').checked).toBe(true);
    expect([aud('st-dm'), aud('st-challenge'), aud('st-friend')]).toEqual(['friends', 'nobody', 'everyone']);
    expect(document.querySelector('#st-content img[src="x"]')).toBeNull();
    expect($('st-profile-link').getAttribute('href')).toBe('/u/alice');
  });

  it('friend-request audience has no "friends only" option (it can never hold for a stranger)', async () => {
    await boot();
    expect(audOptions('st-friend')).toEqual(['everyone', 'nobody']);
    expect(audOptions('st-dm')).toEqual(['everyone', 'friends', 'nobody']);
  });

  it('audience groups are labelled radio groups and the bio counter follows typing', async () => {
    await boot();
    for (const id of ['st-dm', 'st-challenge', 'st-friend']) {
      expect($(id).getAttribute('role')).toBe('radiogroup');
      expect($(id).getAttribute('aria-labelledby')).toBe(id + '-lab');
      expect(document.querySelectorAll('#' + id + ' input:checked')).toHaveLength(1);
    }
    $('st-bio').value = 'abc';
    $('st-bio').dispatchEvent(new Event('input'));
    expect($('st-bio-count').textContent).toBe('3/280');
  });

  it('country select = none + the ISO list, all alpha-2', async () => {
    await boot();
    const values = [...$('st-country').options].map((o) => o.value);
    expect(values[0]).toBe('');
    expect(values.slice(1).every((c) => /^[A-Z]{2}$/.test(c))).toBe(true);
    expect(values).toEqual(expect.arrayContaining(['VN', 'US', 'JP']));
    expect(new Set(values).size).toBe(values.length);
  });

  it('save sends the whole form as one PUT', async () => {
    await boot();
    $('st-country').value = 'JP';
    $('st-city').value = 'Tokyo';
    $('st-hide-online').checked = false;
    pick('st-dm', 'nobody');
    $('st-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    const put = global.fetch.mock.calls.find((c) => c[1] && c[1].method === 'PUT');
    expect(put[0]).toBe('/api/profile');
    expect(JSON.parse(put[1].body)).toEqual({
      bio: 'hi <b>there</b>', country: 'JP', city: 'Tokyo', hideHistory: true, hideBio: false, hideOnline: false,
      whoCanDm: 'nobody', whoCanChallenge: 'nobody', whoCanFriend: 'everyone',
    });
    expect($('st-saved').textContent).toBe('profile.saved');
  });

  it('a failed save says so; cancel restores the stored values', async () => {
    await boot({ putOk: false });
    $('st-city').value = 'changed';
    $('st-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect($('st-saved').textContent).toBe('profile.error');
    $('st-cancel').click();
    expect($('st-city').value).toBe('Hà Nội');
  });

  it('a guest / signed-out visitor gets no form', async () => {
    await boot({ me: {}, meStatus: 200 });
    expect($('st-content').hidden).toBe(true);
    expect($('st-status').textContent).toBe('settings.members_only');
  });

  it('a guest session never calls the profile API (B211: guests only use the other tabs)', async () => {
    await boot({ user: { userId: 'g', isGuest: true, displayName: 'G' } });
    expect(global.fetch).not.toHaveBeenCalled();
    expect($('st-content').hidden).toBe(true);
  });

  it('avatar upload goes through the crop editor: the cropped blob is what gets POSTed; cancel uploads nothing', async () => {
    await boot();
    const blob = { type: 'image/webp', size: 10 };
    window.AvatarCrop = { open: jest.fn(() => Promise.resolve(blob)) };
    const chip = jest.spyOn(window.PlatformShell, 'setMyAvatar');
    const input = $('st-file');
    Object.defineProperty(input, 'files', { configurable: true, value: [{ name: 'big.png', type: 'image/png' }] });
    global.fetch.mockClear();
    input.dispatchEvent(new Event('change'));
    await flush(); await flush();
    const post = global.fetch.mock.calls.find((c) => c[0] === '/api/profile/avatar');
    expect(post[1].method).toBe('POST');
    expect(post[1].body).toBe(blob);
    expect(post[1].headers['Content-Type']).toBe('image/webp');
    expect(chip).toHaveBeenCalled(); // nav chip follows without a reload

    window.AvatarCrop.open.mockResolvedValue(null); // (stale DOMContentLoaded handlers from earlier boots all fire, so not "Once")
    global.fetch.mockClear();
    input.dispatchEvent(new Event('change'));
    await flush(); await flush();
    expect(global.fetch.mock.calls.find((c) => c[0] === '/api/profile/avatar')).toBeUndefined();
  });
});

describe('settings bento CSS', () => {
  const css = require('fs').readFileSync(require('path').join(__dirname, '..', 'css', 'platform.css'), 'utf8');
  it('the upload <label> primary button keeps white-on-brand text (label rule would otherwise paint it ink)', () => {
    expect(css).toMatch(/\.pset \.pform label\.pbtn--primary \{ color: var\(--c-on-brand\); \}/);
  });
  it('segment groups are equal-width grid columns so options line up across rows', () => {
    expect(css).toMatch(/\.paudseg \{ display: grid; grid-auto-flow: column; grid-auto-columns: minmax\(0, 1fr\)/);
    expect(css).toMatch(/\.pset \.pform \.paudseg label:not\(\.pcheck\):not\(:first-child\)/);   // options 2-3 must not inherit the 12px stacking margin
    expect(css).toMatch(/\.pset \.pseg \{ display: inline-grid; grid-auto-flow: column; grid-auto-columns: minmax\(44px, 1fr\)/);
  });
  it('bento fills are opaque: no transparent/rgba background in the tile rules', () => {
    const block = css.slice(css.indexOf('Settings › Hồ sơ: bento tiles'));
    const fills = block.match(/background(-color)?:[^;]+;/g) || [];
    expect(fills.length).toBeGreaterThan(10);
    for (const f of fills) expect(f).not.toMatch(/transparent|rgba|var\(--c-fill\)|var\(--c-hover\)/);
  });
});
