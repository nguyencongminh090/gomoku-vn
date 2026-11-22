/**
 * #436: engine.io < 6.6.10 is in GHSA-2gc4-cqfq-p2gv (Protocol Revision Mismatch DoS). Guards against a lockfile
 * regression, and keeps the browser bundle (socket.io/client-dist, served at /vendor/socket.io) on the same
 * version as socket.io-client (used by tests/labs) — the two must move together.
 */
const fs = require('fs');
const path = require('path');

const ver = (pkg) => require(`${pkg}/package.json`).version;
const cmp = (a, b) => {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};

describe('#436 socket.io stack versions', () => {
  test('cmp helper orders semver triples', () => {
    expect(cmp('6.6.10', '6.6.9')).toBeGreaterThan(0);
    expect(cmp('6.6.9', '6.6.10')).toBeLessThan(0);
    expect(cmp('6.6.10', '6.6.10')).toBe(0);
  });

  test('the engine.io that socket.io loads is outside the advisory range (>= 6.6.10)', () => {
    // resolve from socket.io's own dir (npm may nest engine.io); engine.io's `exports` hides package.json,
    // so walk up from its entry file to the package root.
    let dir = path.dirname(require.resolve('engine.io', { paths: [path.dirname(require.resolve('socket.io'))] }));
    while (!fs.existsSync(path.join(dir, 'package.json')) || JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).name !== 'engine.io') dir = path.dirname(dir);
    expect(cmp(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version, '6.6.10')).toBeGreaterThanOrEqual(0);
  });

  test('served client-dist bundle version equals socket.io-client version', () => {
    const dist = path.join(path.dirname(require.resolve('socket.io/package.json')), 'client-dist', 'socket.io.min.js');
    const m = /Socket\.IO v(\d+\.\d+\.\d+)/.exec(fs.readFileSync(dist, 'utf8').slice(0, 200));
    expect(m).not.toBeNull();
    expect(m[1]).toBe(ver('socket.io-client'));
    expect(ver('socket.io')).toBe(ver('socket.io-client'));
  });
});
