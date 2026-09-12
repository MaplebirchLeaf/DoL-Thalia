import { expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm, writeFile, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { dependencyFingerprint, ensureYarnDependencies, fingerprintTree, hasYarnDependencies, readBuildDependencies } from '../src/core/build-cache';

test('source cache follows contents and local edits while ignoring generated outputs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'thalia-build-cache-'));
  try {
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'src/main.ts'), 'export const value = 1;');
    await writeFile(join(root, 'yarn.lock'), 'lock-a');
    const before = await fingerprintTree(root, true);
    await utimes(join(root, 'src/main.ts'), new Date(), new Date());
    await mkdir(join(root, 'dist'));
    await writeFile(join(root, 'dist/main.js'), 'compiled');
    await writeFile(join(root, 'example.mod.zip'), 'generated');
    expect(await fingerprintTree(root, true)).toBe(before);
    const outputBefore = await fingerprintTree(join(root, 'dist'));
    await writeFile(join(root, 'dist/main.js'), 'corrupted');
    expect(await fingerprintTree(join(root, 'dist'))).not.toBe(outputBefore);
    await writeFile(join(root, 'src/main.ts'), 'export const value = 2;');
    expect(await fingerprintTree(root, true)).not.toBe(before);
    const edited = await fingerprintTree(root, true);
    await writeFile(join(root, 'yarn.lock'), 'lock-b');
    expect(await fingerprintTree(root, true)).not.toBe(edited);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('dependency changes invalidate dependents, tolerate cycles, and preserve unrelated caches', () => {
  const sources = new Map([
    ['gui', 'a'],
    ['core', 'b'],
    ['bsa', 'c'],
    ['other', 'd']
  ]);
  const graph = new Map([
    ['bsa', ['gui']],
    ['gui', ['core']],
    ['core', ['gui']]
  ]);
  const before = dependencyFingerprint('bsa', sources, graph);
  const unrelated = dependencyFingerprint('other', sources, graph);
  sources.set('core', 'changed');
  expect(dependencyFingerprint('bsa', sources, graph)).not.toBe(before);
  expect(dependencyFingerprint('other', sources, graph)).toBe(unrelated);
});

test('cross-mod type imports, re-exports and require invalidate consumers without runtime boot dependencies', async () => {
  const root = await mkdtemp(join(tmpdir(), 'thalia-import-cache-'));
  try {
    const targets = ['gui', 'sub-ui', 'linker', 'consumer', 'other'].map(name => ({ name, directory: join(root, name) }));
    for (const target of targets) await mkdir(join(target.directory, 'src'), { recursive: true });
    await writeFile(
      join(root, 'gui/src/main.ts'),
      `
      import type {
        /* A build-time interface from an optional runtime peer. */
        Interface
      } from '../../sub-ui/dist-ts/interface';
      const pretend = "import '../../other/dist/fake'";
      // import type { NotAnImport } from '../../other/dist/fake';
    `
    );
    await writeFile(join(root, 'sub-ui/src/main.ts'), `export type { Link } from '../../linker/dist/types';`);
    await writeFile(
      join(root, 'consumer/src/main.js'),
      `
      const link = require('../../linker/dist/main');
      const ui = import('../../sub-ui/dist/main');
    `
    );
    // Generated declarations must not invent reverse dependencies or hide missing generated files.
    await mkdir(join(root, 'linker/dist'));
    await writeFile(join(root, 'linker/dist/generated.d.ts'), `import type { GUI } from '../../gui/dist/type';`);
    const graph = await readBuildDependencies(targets);
    expect(graph.get('gui')).toEqual(['sub-ui']);
    expect(graph.get('sub-ui')).toEqual(['linker']);
    expect(graph.get('consumer')).toEqual(['linker', 'sub-ui']);
    expect(graph.get('linker')).toEqual([]);
    const sources = new Map(await Promise.all(targets.map(async target => [target.name, await fingerprintTree(target.directory, true)] as const)));
    const before = dependencyFingerprint('gui', sources, graph);
    const unrelated = dependencyFingerprint('other', sources, graph);
    await writeFile(join(root, 'linker/src/type.ts'), 'export interface Link { changed: true }');
    sources.set('linker', await fingerprintTree(join(root, 'linker'), true));
    expect(dependencyFingerprint('gui', sources, graph)).not.toBe(before);
    expect(dependencyFingerprint('other', sources, graph)).toBe(unrelated);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('missing dependency installation prevents reuse, while package-less mods need no install', async () => {
  const root = await mkdtemp(join(tmpdir(), 'thalia-dependency-cache-'));
  try {
    expect(hasYarnDependencies(root)).toBe(true);
    await ensureYarnDependencies(root);
    await writeFile(join(root, 'package.json'), '{"name":"fixture","private":true}');
    expect(hasYarnDependencies(root)).toBe(false);
    await mkdir(join(root, 'node_modules'));
    expect(hasYarnDependencies(root)).toBe(true);
    await rm(join(root, 'node_modules'), { recursive: true });
    expect(hasYarnDependencies(root)).toBe(false);
    await writeFile(join(root, '.pnp.cjs'), '/* installed PnP map */');
    expect(hasYarnDependencies(root)).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
