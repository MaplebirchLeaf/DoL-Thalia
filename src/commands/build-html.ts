import { buildHtml } from '../builders/html';
import { loadConfig, withGameVariant } from '../core/config';
import { prepareLocalBuild } from '../builders/prepare';
import { readReleasePreset } from '../release/presets';
import { withGameVersion } from '../sources/game-input';
import { syncModSources } from '../sources/mod-sources';
import { parseBuildHtmlCommandOptions } from './build-options';

const args = process.argv.slice(2);
const config = await loadConfig();

const options = parseBuildHtmlCommandOptions(args);
const variantConfig = withGameVariant(config, options.game);
const buildConfig = options.version ? withGameVersion(variantConfig, options.version) : variantConfig;
const preset = await readReleasePreset(options.preset ?? buildConfig.game.default_mod_list, buildConfig.paths.mod_list);
options.html.releasePreset = preset;

if (options.prepare !== 'skip') {
  options.prepare.storyFormat = {
    ...options.prepare.storyFormat,
    modloaderHook: options.html.modloader !== false,
    i10nHook: options.html.modloader !== false && options.html.embedIndexDBMods !== false && preset.mods.includes('ModI18N')
  };
  await prepareLocalBuild(buildConfig, options.prepare);
  if (options.html.modloader !== false && options.html.embedIndexDBMods !== false && !options.prepareExplicit) await syncModSources(buildConfig, preset.mods);
}

await buildHtml(buildConfig, options.html);
