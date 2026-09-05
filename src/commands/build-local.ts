import { buildHtml } from '../builders/html';
import { loadConfig, withGameVariant } from '../core/config';
import { prepareLocalBuild } from '../builders/prepare';
import { parseLocalBuildCommandOptions } from './build-options';

const args = process.argv.slice(2);
const config = await loadConfig();

const options = parseLocalBuildCommandOptions(args);
const buildConfig = withGameVariant(config, options.game);

if (!buildConfig.game.version) throw new Error('Local HTML build requires game.version in thalia.config.toml.');

if (options.prepare !== 'skip') await prepareLocalBuild(buildConfig, options.prepare);

await buildHtml(buildConfig, options.html);
