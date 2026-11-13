/**
 * #372 review — the shell's HTTP presence beat: coalesced edges, sent only when active/away flips.
 * A burst of focus/blur/visibility events must not burn the per-member rate limit (429 = shown offline).
 *
 * @jest-environment jsdom
 */

'use strict';

const MEMBER = { userId: 'u', isGuest: false, displayName: 'Zed' };
const beats = () => global.fetch.mock.calls.filter(([url]) => url === '/api/presence').map(([, o]) => JSON.parse(o.body).presence);

let focused = true;
function boot() {
  jest.resetModules();
  jest.useFakeTimers();
  document.body.innerHTML = '<div id="pl-shell"></div>';
  window.t = (k) => k;
  window.GvnSession = { getUser: () => MEMBER };
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
  jest.spyOn(document, 'hasFocus').mockImplementation(() => focused);
  require('../js/platform-shell.js');
  window.PlatformShell.build('clubs');
}
const fire = (target, type) => target.dispatchEvent(new Event(type));

afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); focused = true; });

describe('shell presence beat (#372)', () => {
  it('first beat after 3 s, active heartbeat every 20 s; edges coalesced and sent only on a flip', () => {
    boot();
    jest.advanceTimersByTime(2999);
    expect(beats()).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(beats()).toEqual(['active']);
    jest.advanceTimersByTime(40000);
    expect(beats()).toEqual(['active', 'active', 'active']);
    global.fetch.mockClear();

    // One boot per file: the shell's window/document listeners outlive jest.resetModules.
    // blur + visibilitychange burst → ONE away report; repeated edges without a flip send nothing.
    focused = false;
    fire(window, 'blur'); fire(document, 'visibilitychange'); fire(window, 'blur');
    jest.advanceTimersByTime(300);
    expect(beats()).toEqual(['away']);
    fire(window, 'blur'); fire(document, 'visibilitychange');
    jest.advanceTimersByTime(300);
    jest.advanceTimersByTime(40000); // away: the 20 s tick stays quiet too
    expect(beats()).toEqual(['away']);
    focused = true;
    fire(window, 'focus');
    jest.advanceTimersByTime(300);
    expect(beats()).toEqual(['away', 'active']);
  });
});
