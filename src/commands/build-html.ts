import { buildHtml } from '../builders/html';
import { loadConfig } from '../core/config';
import { prepareLocalBuild } from '../builders/prepare';
import { readReleasePreset } from '../release/presets';
import { withGameVersion } from '../sources/game-input';
import { syncModSources } from '../sources/mod-sources';
import { parseReleaseHtmlCommandOptions } from './build-options';

const args = process.argv.slice(2);
const config = await loadConfig();

const options = parseReleaseHtmlCommandOptions(args);
const buildConfig = options.version ? withGameVersion(config, options.version) : config;
const preset = await readReleasePreset(options.preset ?? buildConfig.game.default_mod_list);
options.html.releasePreset = preset;

if (options.prepare !== 'skip') {
  await prepareLocalBuild(buildConfig, options.prepare);
  if (options.html.modloader !== false && !options.prepareExplicit) await syncModSources(buildConfig, preset.mods);
}

await buildHtml(buildConfig, options.html);
