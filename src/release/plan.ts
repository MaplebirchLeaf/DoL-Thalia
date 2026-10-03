import { withGameVariant, type ThaliaConfig } from '../core/config';
import { readReleasePresets } from './presets';
import { parseReleaseTag, type ParsedReleaseTag } from './protocol';

export interface ReleasePlan extends ParsedReleaseTag {
  presets: string[];
}

/** Release matrices come from the same preset files the builders consume. */
export async function createReleasePlan(tag: string, config: ThaliaConfig): Promise<ReleasePlan> {
  const release = parseReleaseTag(tag);
  const variant = withGameVariant(config, release.edition);
  const presets = await readReleasePresets(variant.paths.mod_list);
  if (!presets.length) throw new Error('Release matrix must contain at least one preset');
  return { ...release, presets: presets.map(preset => preset.name) };
}

export function releaseEnvironment(plan: ReleasePlan): string {
  return [
    `THALIA_RELEASE_TAG=${plan.tag}`,
    `THALIA_GAME=${plan.edition}`,
    `THALIA_GAME_VERSION=${plan.gameVersion}`,
    `THALIA_RELEASE_DATE=${plan.releaseDate ?? ''}`,
    `THALIA_PRESETS=${plan.presets.join(',')}`,
    ''
  ].join('\n');
}
