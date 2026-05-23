import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface ReleasePreset {
  mods: string[];
  name: string;
  title?: string;
}

const RELEASE_PRESETS_SOURCE = 'input/modList.json';

export async function readReleasePresets(path = RELEASE_PRESETS_SOURCE): Promise<ReleasePreset[]> {
  const presets = JSON.parse(await readFile(resolve(path), 'utf8')) as ReleasePreset[];
  validateReleasePresets(presets, path);
  return presets;
}

export async function readDefaultReleasePreset(name: string): Promise<ReleasePreset> {
  const presets = await readReleasePresets();
  const preset = presets.find(item => item.name === name);
  if (!preset) throw new Error(`${RELEASE_PRESETS_SOURCE} has no preset named: ${name}`);
  return preset;
}

export function validateReleasePresets(presets: ReleasePreset[], source = RELEASE_PRESETS_SOURCE): void {
  if (!Array.isArray(presets)) throw new Error(`${source} must be an array.`);
  const names = new Set<string>();
  for (const preset of presets) {
    if (!preset || typeof preset !== 'object') throw new Error(`${source} contains an invalid preset.`);
    if (typeof preset.name !== 'string' || !/^[a-z0-9][a-z0-9-]*$/i.test(preset.name)) throw new Error(`Release preset name must be file-safe: ${String(preset.name)}`);
    if (preset.title !== undefined && (typeof preset.title !== 'string' || preset.title.trim() === '')) throw new Error(`Release preset title must be a non-empty string: ${preset.name}`);
    if (names.has(preset.name)) throw new Error(`Duplicate release preset name: ${preset.name}`);
    names.add(preset.name);
    if (!Array.isArray(preset.mods)) throw new Error(`Release preset mods must be an array: ${preset.name}`);
    for (const mod of preset.mods) if (typeof mod !== 'string' || mod.trim() === '') throw new Error(`Release preset mod must be a non-empty string: ${preset.name}`);
  }
}
