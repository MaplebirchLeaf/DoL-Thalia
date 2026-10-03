import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readReleasePresets, selectReleasePresets } from '../src/release/presets';

test('base mods apply to each preset in order, while the existing array format stays valid', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'thalia-presets-'));
  const path = join(dir, 'modList.json');
  try {
    await writeFile(
      path,
      JSON.stringify({
        base_mods: ['framework', 'main', 'audio'],
        presets: [
          { name: 'thalia', mods: [] },
          { name: 'chs', mods: ['localization'] }
        ]
      })
    );
    expect((await readReleasePresets(path)).map(preset => preset.mods)).toEqual([
      ['framework', 'main', 'audio'],
      ['framework', 'main', 'audio', 'localization']
    ]);

    await writeFile(path, JSON.stringify([{ name: 'vanilla', mods: [] }]));
    expect((await readReleasePresets(path))[0].mods).toEqual([]);

    await writeFile(path, JSON.stringify({ base_mods: ['main'], presets: [{ name: 'duplicate', mods: ['main'] }] }));
    await expect(readReleasePresets(path)).rejects.toThrow('Duplicate mod');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('preset selection preserves caller order, removes duplicates and rejects missing names', () => {
  const presets = [
    { name: 'first', mods: [] },
    { name: 'second', mods: [] }
  ];
  expect(selectReleasePresets(presets, ['second', 'first', 'second'])).toEqual([presets[1], presets[0]]);
  expect(() => selectReleasePresets(presets, ['missing'])).toThrow('Unknown release preset: missing');
});
