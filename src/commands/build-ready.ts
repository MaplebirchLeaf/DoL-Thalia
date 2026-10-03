import { buildRelease } from '../builders/release';
import { loadConfig, withGameVariant } from '../core/config';
import { readReleasePresets, selectReleasePresets } from '../release/presets';
import { requirePublishedLocalization } from '../sources/mod-sources';
import { parseReleaseOptions } from './release-options';

const options = parseReleaseOptions(process.argv.slice(2));
if (options.skipModSources) throw new Error('build:ready requires source synchronization');
const config = withGameVariant(await loadConfig(), options.game);
const versions = options.versions?.length ? options.versions : [config.game.version];
const presets = await readReleasePresets(config.paths.mod_list);
const names = options.presets?.length ? options.presets : options.game === 'dolp' ? ['goose-f-mysterious', 'goose-m-mysterious'] : ['chs-goose-f-mysterious', 'chs-goose-m-mysterious'];
const needsLocalization = selectReleasePresets(presets, names).some(preset => preset.mods.includes('ModI18N'));
if (needsLocalization) {
  if (versions.length !== 1) throw new Error('Build one localized game version at a time');
  const source = config.mod_sources?.['chinese-localization'];
  if (!source?.repository) throw new Error('Official localization source is not configured');
  source.release_tag = await requirePublishedLocalization(source.repository, versions[0], source.release_tag);
}
await buildRelease(config, { ...options, presets: names, versions, targets: options.targets?.length ? options.targets : ['zip'] });
