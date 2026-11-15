/**
 * Per-kind sound volume (move / tick / message) on AudioManager + the settings-panel slider rows.
 *
 * @jest-environment jsdom
 */
'use strict';

const fs = require('fs');
const path = require('path');
const src = (f) => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');

function fakeCtx() {
  const gains = [];
  const node = () => ({
    connect() {}, start() {}, stop() {}, buffer: null, type: '',
    frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
    gain: { setValueAtTime(v) { gains.push(v); }, linearRampToValueAtTime(v) { gains.push(v); }, exponentialRampToValueAtTime(v) { gains.push(v); } },
  });
  return {
    gains, state: 'running', currentTime: 0, sampleRate: 100, destination: {},
    createOscillator: node, createGain: node, createBiquadFilter: node, createBufferSource: node,
    createBuffer: () => ({ getChannelData: () => new Float32Array(2) }),
    resume: () => Promise.resolve(),
  };
}

function load() {
  localStorage.clear();
  window.eval(src('audio-manager.js'));
  const am = window.audioManager;
  am.ctx = fakeCtx();
  return am;
}

describe('AudioManager per-kind volume', () => {
  test('defaults to full, persists, clamps', () => {
    const am = load();
    expect(am.getChannelVolume('tick')).toBe(1);
    am.setChannelVolume('tick', 0.4);
    expect(localStorage.getItem('gomoku_vol_tick')).toBe('0.4');
    am.setChannelVolume('tick', 7);
    expect(am.getChannelVolume('tick')).toBe(1);
    am.setChannelVolume('tick', -3);
    expect(am.getChannelVolume('tick')).toBe(0);
    am.setChannelVolume('bogus', 0.2);
    expect(localStorage.getItem('gomoku_vol_bogus')).toBeNull();
  });

  test('a stored value is restored on construction', () => {
    localStorage.setItem('gomoku_vol_message', '0.25');
    window.eval(src('audio-manager.js'));
    expect(window.audioManager.getChannelVolume('message')).toBe(0.25);
  });

  test('each kind scales only its own sounds; 0 is silent (no ramp-to-zero throw)', () => {
    const am = load();
    am.setChannelVolume('tick', 0);
    am.playTimerTickSound();
    expect(am.ctx.gains).toEqual([]);
    am.playMessageSound();
    expect(am.ctx.gains.length).toBeGreaterThan(0);
    const full = Math.max(...am.ctx.gains);
    am.ctx.gains.length = 0;
    am.setChannelVolume('message', 0.5);
    am.playMessageSound();
    expect(Math.max(...am.ctx.gains)).toBeCloseTo(full / 2, 5);
    am.setChannelVolume('move', 0);
    am.ctx.gains.length = 0;
    am.playMoveSound(false); am.playWinSound(); am.playLoseSound(); am.playInvalidMoveSound();
    expect(am.ctx.gains).toEqual([]);
  });
});

describe('settings-panel volume rows', () => {
  test('slider writes the channel volume and shows the percentage', () => {
    const am = load();
    window.t = (k) => k;
    window.eval(src('settings-panel.js'));
    const wrap = window.GvnSettings.volumeSlider('move', 'Move');
    const input = wrap.querySelector('input');
    expect(input.value).toBe('100');
    input.value = '35';
    input.dispatchEvent(new Event('input'));
    expect(am.getChannelVolume('move')).toBeCloseTo(0.35, 5);
    expect(wrap.querySelector('output').textContent).toBe('35%');
    expect(window.GvnSettings.getVolume('move')).toBe(35);
  });
});
