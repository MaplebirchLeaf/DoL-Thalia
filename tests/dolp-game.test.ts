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
  expect(presets.map(preset => preset.name)).toEqual(['goose-f-mysterious', 'goose-m-mysterious']);
  expect(presets.some(preset => preset.name === dolp.game.default_mod_list)).toBe(true);
  for (const preset of presets) {
    expect(preset.mods).not.toContain('ModI18N');
    expect(preset.mods.some(mod => mod.startsWith('AU'))).toBe(false);
  }
  const standard = await readReleasePresets();
  expect(standard.map(preset => preset.name)).toEqual(['goose-f-mysterious', 'goose-m-mysterious', 'chs-goose-f-mysterious', 'chs-goose-m-mysterious']);
  expect(standard.some(preset => preset.name === config.game.default_mod_list)).toBe(true);
  for (const preset of [...presets, ...standard]) {
    expect(preset.mods.slice(-2)).toEqual(['Mysterious', 'NPC Sidebar Portraits']);
    expect(preset.mods.filter(mod => mod.endsWith('Goose Compilation'))).toHaveLength(1);
  }
  expect(dolp.game.release_repository).toBe('Frostberg/degrees-of-lewdity-plus');
});
