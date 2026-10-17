'use strict';

/** #265 — scripts/cache-bust.js: per-file content-hash `?v=`, Merkle order, cycles hashed as a unit. */

const path = require('path');
const { computeAll, resolveRef, run } = require('../../scripts/cache-bust');

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

describe('the real client/ tree', () => {
  it('is up to date (run `node scripts/cache-bust.js --write` after editing client/)', () => {
    const r = run(path.join(__dirname, '..', '..', 'client'), false);
    expect(r.errors).toEqual([]);
    expect(r.stale).toEqual([]);
  });
});
