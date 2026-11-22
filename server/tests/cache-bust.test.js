'use strict';

/** #265 — scripts/cache-bust.js: per-file content-hash `?v=`, Merkle order, cycles hashed as a unit. */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { computeAll, resolveRef, run, filePathOf, MOUNTS } = require('../../scripts/cache-bust');

/** Runs computeAll over an in-memory tree; returns the rewritten tree (unchanged files kept). */
function rewrite(tree) {
  const sources = Object.keys(tree).filter((f) => /\.(html|js|css)$/.test(f) && !f.endsWith('.svg'));
  const { out, hashes, errors } = computeAll(sources, (f) => (f in tree ? tree[f] : null));
  return { tree: { ...tree, ...Object.fromEntries(out) }, hashes, errors };
}
const vOf = (s, ref) => s.match(new RegExp(ref.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '\\?v=([0-9a-f]+)'))[1];

const BASE = {
  'index.html': '<script type="module" src="js/entry.js?v=1"></script><link href="css/a.css?v=1"><use href="assets/s.svg?v=1#x">',
  'js/entry.js': "import './a.js?v=1';\nimport './b.js?v=1';\nconst S = '/assets/s.svg?v=1';",
  'js/a.js': 'export const a = 1;',
  'js/b.js': "import './a.js?v=1';",
  'css/a.css': 'body{}',
  'assets/s.svg': '<svg/>',
};

describe('resolveRef', () => {
  it('resolves ./ and ../ against the module, everything else against client/', () => {
    expect(resolveRef('js/diag/x.js', '../i18n.js')).toBe('js/i18n.js');
    expect(resolveRef('js/x.js', './y.js')).toBe('js/y.js');
    expect(resolveRef('js/x.js', 'assets/s.svg')).toBe('assets/s.svg');
    expect(resolveRef('js/x.js', '/js/p.js')).toBe('js/p.js');
    expect(resolveRef('index.html', 'js/x.js')).toBe('js/x.js');
  });
});

describe('computeAll', () => {
  it('gives every reference to one file the same 8-hex hash, and is idempotent', () => {
    const once = rewrite(BASE);
    expect(once.errors).toEqual([]);
    const ha = once.hashes.get('js/a.js');
    expect(ha).toMatch(/^[0-9a-f]{8}$/);
    expect(vOf(once.tree['js/entry.js'], './a.js')).toBe(ha);
    expect(vOf(once.tree['js/b.js'], './a.js')).toBe(ha);
    expect(vOf(once.tree['index.html'], 'assets/s.svg')).toBe(vOf(once.tree['js/entry.js'], '/assets/s.svg'));
    expect(rewrite(once.tree).tree).toEqual(once.tree);
  });

  it('a leaf change re-versions that file and its importers only', () => {
    const before = rewrite(BASE).hashes;
    const after = rewrite({ ...BASE, 'js/a.js': 'export const a = 2;' }).hashes;
    const changed = [...after.keys()].filter((f) => after.get(f) !== before.get(f)).sort();
    expect(changed).toEqual(['index.html', 'js/a.js', 'js/b.js', 'js/entry.js']);
    expect(after.get('css/a.css')).toBe(before.get('css/a.css'));
  });

  it('hashes an import cycle as one unit and stays idempotent', () => {
    const tree = { ...BASE, 'js/a.js': "import './b.js?v=1';", 'js/b.js': "import './a.js?v=1';" };
    const once = rewrite(tree);
    expect(once.errors).toEqual([]);
    expect(once.hashes.get('js/a.js')).toBe(once.hashes.get('js/b.js'));
    expect(vOf(once.tree['js/a.js'], './b.js')).toBe(once.hashes.get('js/b.js'));
    expect(rewrite(once.tree).tree).toEqual(once.tree);
    const edited = rewrite({ ...once.tree, 'js/a.js': once.tree['js/a.js'] + '\n// edit' });
    expect(edited.hashes.get('js/b.js')).not.toBe(once.hashes.get('js/b.js'));
  });

  it('fails on an unresolvable ref and leaves templates/prose alone', () => {
    expect(rewrite({ 'x.html': '<script src="js/missing.js?v=1">' }).errors).toHaveLength(1);
    const t = { 'x.html': 'a `?v=` b ?v=N c sprite.svg?v=${ASSET_VERSION}' };
    expect(rewrite(t).tree).toEqual(t);
  });
});

describe('#437 mounted refs (/vendor/socket.io → node_modules)', () => {
  it('maps vendor/socket.io/* to socket.io client-dist, everything else to client/', () => {
    const dist = path.join(path.dirname(require.resolve('socket.io/package.json')), 'client-dist');
    expect(filePathOf('/c', 'vendor/socket.io/socket.io.min.js')).toBe(path.join(dist, 'socket.io.min.js'));
    expect(filePathOf('/c', 'vendor/fonts/nunito/style.css')).toBe(path.join('/c', 'vendor/fonts/nunito/style.css'));
    expect(MOUNTS['vendor/socket.io/']).toBe(dist);
  });

  it('a bundle bump (new bytes in the mounted dir) makes verify fail and --write re-hash the ref', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cb437-'));
    const client = path.join(tmp, 'client'), pkg = path.join(tmp, 'dist');
    fs.mkdirSync(client); fs.mkdirSync(pkg);
    const mounts = { 'vendor/socket.io/': pkg };
    const page = path.join(client, 'index.html');
    fs.writeFileSync(path.join(pkg, 'socket.io.min.js'), '/*! Socket.IO v4.8.3 */');
    fs.writeFileSync(page, '<script src="/vendor/socket.io/socket.io.min.js?v=0"></script>');
    try {
      expect(run(client, true, mounts).errors).toEqual([]);
      const v1 = /\?v=([0-9a-f]+)/.exec(fs.readFileSync(page, 'utf8'))[1];
      expect(run(client, false, mounts).ok).toBe(true);
      fs.writeFileSync(path.join(pkg, 'socket.io.min.js'), '/*! Socket.IO v4.8.4 */');
      const stale = run(client, false, mounts);
      expect(stale.ok).toBe(false);
      expect(stale.stale).toEqual(['index.html']);
      run(client, true, mounts);
      const v2 = /\?v=([0-9a-f]+)/.exec(fs.readFileSync(page, 'utf8'))[1];
      expect(v2).toMatch(/^[0-9a-f]{8}$/);
      expect(v2).not.toBe(v1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('the real client/ tree', () => {
  it('is up to date (run `node scripts/cache-bust.js --write` after editing client/)', () => {
    const r = run(path.join(__dirname, '..', '..', 'client'), false);
    expect(r.errors).toEqual([]);
    expect(r.stale).toEqual([]);
  });
});
