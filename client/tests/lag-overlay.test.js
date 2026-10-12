/** @jest-environment jsdom */
describe('lag overlay (session.js)', () => {
  let resolveFetch;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetModules();
    document.body.innerHTML = '';
    window.fetch = jest.fn(() => new Promise((r) => { resolveFetch = r; }));
    window.t = (k) => k;
    require('../js/session.js');
    window.dispatchEvent(new CustomEvent('gvn:conn', { detail: 'connected' })); // end the initial-load phase
  });
  afterEach(() => jest.useRealTimers());
  test('initial socket connecting shows overlay after 400ms', () => {
    jest.resetModules(); document.body.innerHTML = '';
    require('../js/session.js');
    window.dispatchEvent(new CustomEvent('gvn:conn', { detail: 'connecting' }));
    jest.advanceTimersByTime(450);
    expect(overlay().hidden).toBe(false);
    window.dispatchEvent(new CustomEvent('gvn:conn', { detail: 'connected' }));
    jest.advanceTimersByTime(600);
    expect(overlay().hidden).toBe(true);
  });

  const overlay = () => document.querySelector('.gvn-lag');

  test('slow fetch shows overlay after 1.5s and hides when done', async () => {
    const p = window.fetch('/x');
    jest.advanceTimersByTime(1000);
    expect(overlay()).toBeNull();
    jest.advanceTimersByTime(600);
    expect(overlay().hidden).toBe(false);
    resolveFetch({}); await p;
    jest.advanceTimersByTime(600);
    expect(overlay().hidden).toBe(true);
  });

  test('fast fetch never shows overlay', async () => {
    const p = window.fetch('/x');
    resolveFetch({}); await p;
    jest.advanceTimersByTime(3000);
    expect(overlay()).toBeNull();
  });

  test('socket disconnect shows, connected hides', () => {
    window.dispatchEvent(new CustomEvent('gvn:conn', { detail: 'reconnecting' }));
    jest.advanceTimersByTime(1600);
    expect(overlay().hidden).toBe(false);
    window.dispatchEvent(new CustomEvent('gvn:conn', { detail: 'connected' }));
    jest.advanceTimersByTime(600);
    expect(overlay().hidden).toBe(true);
  });
});
