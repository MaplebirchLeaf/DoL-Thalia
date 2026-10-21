import { expect, test } from 'bun:test';
import { selectDoLPVanilla } from '../src/sources/dolp-game';
import { loadConfig, withGameVariant } from '../src/core/config';
import { readReleasePresets } from '../src/release/presets';

test('DoLP selects the vanilla release asset without built-in beautification', () => {
  const url = 'https://dolp.download/DoLP_Vanilla/v0.778/DoLP_Vanilla_v0.778.zip';
  expect(
    selectDoLPVanilla([
      { name: 'DoLP_goose_masc_mysterious', url: 'https://example.com/goose.zip' },
      { name: 'DoLP_Vanilla', url }
    ])
  ).toBe(url);
  expect(() => selectDoLPVanilla([])).toThrow('Expected one');
  expect(() =>
    selectDoLPVanilla([
      { name: 'DoLP_Vanilla', url },
      { name: 'DoLP_Vanilla', url }
    ])
  ).toThrow('Expected one');
});

test('DoLP presets exclude localization and AU while standard provides both languages', async () => {
  const config = await loadConfig();
  const dolp = withGameVariant(config, 'dolp');
  const presets = await readReleasePresets(dolp.paths.mod_list);
  expect(presets.map(preset => preset.name)).toEqual(['goose-f-mysterious']);
  expect(presets.some(preset => preset.name === dolp.game.default_mod_list)).toBe(true);
  for (const preset of presets) {
    expect(preset.mods).not.toContain('ModI18N');
    expect(preset.mods.some(mod => mod.startsWith('AU'))).toBe(false);
  }
  const standard = await readReleasePresets();
  expect(standard.map(preset => preset.name)).toEqual(['goose-f-mysterious', 'chs-goose-f-mysterious']);
  expect(standard.some(preset => preset.name === config.game.default_mod_list)).toBe(true);
  for (const preset of [...presets, ...standard]) {
    expect(preset.mods.slice(0, 4)).toEqual(['maplebirch', 'deadwood-reblooms', 'deadwood-reblooms-audio', 'revelation-the-book-of-return']);
    expect(preset.mods.filter(mod => mod === 'deadwood-reblooms-audio')).toHaveLength(1);
    expect(preset.mods.slice(-4)).toEqual(['Fem Goose Compilation', 'Mysterious', 'NPC Sidebar Portraits', 'Xrayfork']);
    expect(preset.mods.filter(mod => mod.endsWith('Goose Compilation'))).toEqual(['Fem Goose Compilation']);
  }
  expect(config.mod_sources?.['Masc Goose Compilation']).toBeUndefined();
  for (const name of ['deadwood-reblooms', 'deadwood-reblooms-audio']) {
    expect(config.mod_sources?.[name]?.repository).toBe('MaplebirchLeaf/Deadwood-Reblooms');
    expect(config.mod_sources?.[name]?.release_tag).toBe('v2.4.4');
    expect(config.mod_sources?.[name]?.asset_keywords).toEqual([`${name}-0.5.12.13`]);
    expect(config.mod_sources?.[name]?.asset_extensions).toEqual(['.modpack']);
  }
  expect(config.mod_sources?.Xrayfork?.repository).toBe('MaplebirchLeaf/DoL-Thalia-Assets');
  expect(config.mod_sources?.Xrayfork?.asset_keywords).toEqual(['Xrayfork']);
  expect(dolp.game.release_repository).toBe('Frostberg/degrees-of-lewdity-plus');
});
