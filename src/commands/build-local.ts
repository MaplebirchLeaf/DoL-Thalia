import { buildHtml } from '../builders/html';
import { loadConfig } from '../core/config';
import { prepareLocalBuild } from '../builders/prepare';
import { parseLocalBuildCommandOptions } from './build-options';

const args = process.argv.slice(2);
const config = await loadConfig();

if (!config.game.version) throw new Error('Local HTML build requires game.version in thalia.config.toml.');

const options = parseLocalBuildCommandOptions(args);
if (options.prepare !== 'skip') await prepareLocalBuild(config, options.prepare);

await buildHtml(config, options.html);
