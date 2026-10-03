import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface ReleasePreset {
  mods: string[];
  name: string;
  /** Deprecated single-language title; prefer title_en/title_cn. */
  title?: string;
  title_en?: string;
  title_cn?: string;
}

const RELEASE_PRESETS_SOURCE = 'input/modList.json';

export async function readReleasePresets(path = RELEASE_PRESETS_SOURCE): Promise<ReleasePreset[]> {
  const data = JSON.parse(await readFile(resolve(path), 'utf8')) as unknown;
  const grouped = !Array.isArray(data) && data !== null && typeof data === 'object' ? (data as { base_mods?: unknown; presets?: unknown }) : undefined;
  const baseMods = grouped?.base_mods ?? [];
  const presets = (grouped?.presets ?? data) as ReleasePreset[];
  if (!Array.isArray(baseMods) || !baseMods.every(mod => typeof mod === 'string' && mod.trim() !== '')) throw new Error(`${path} base_mods must be an array of mod names.`);
  validateReleasePresets(presets, path);
  return presets.map(preset => {
    const mods = [...baseMods, ...preset.mods];
    if (new Set(mods).size !== mods.length) throw new Error(`Duplicate mod in release preset: ${preset.name}`);
    return { ...preset, mods };
  });
}

export async function readReleasePreset(name: string, path?: string): Promise<ReleasePreset> {
  return selectReleasePresets(await readReleasePresets(path), [name])[0];
}

export function selectReleasePresets(presets: ReleasePreset[], names: string[]): ReleasePreset[] {
  return [...new Set(names)].map(name => {
    const preset = presets.find(item => item.name === name);
    if (!preset) throw new Error(`Unknown release preset: ${name}`);
    return preset;
  });
}

export function validateReleasePresets(presets: ReleasePreset[], source = RELEASE_PRESETS_SOURCE): void {
  if (!Array.isArray(presets)) throw new Error(`${source} must be an array.`);
  const names = new Set<string>();
  for (const preset of presets) {
    if (!preset || typeof preset !== 'object') throw new Error(`${source} contains an invalid preset.`);
    if (typeof preset.name !== 'string' || !/^[a-z0-9][a-z0-9-]*$/i.test(preset.name)) throw new Error(`Release preset name must be file-safe: ${String(preset.name)}`);
    for (const titleKey of ['title', 'title_en', 'title_cn'] as const) {
      const value = preset[titleKey];
      if (value !== undefined && (typeof value !== 'string' || value.trim() === '')) {
        throw new Error(`Release preset ${titleKey} must be a non-empty string: ${preset.name}`);
      }
    }
    if (names.has(preset.name)) throw new Error(`Duplicate release preset name: ${preset.name}`);
    names.add(preset.name);
    if (!Array.isArray(preset.mods)) throw new Error(`Release preset mods must be an array: ${preset.name}`);
    for (const mod of preset.mods) if (typeof mod !== 'string' || mod.trim() === '') throw new Error(`Release preset mod must be a non-empty string: ${preset.name}`);
  }
}
