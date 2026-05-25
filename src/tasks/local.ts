import { loadConfig } from '../config';
import { buildHtml } from '../html';

const config = await loadConfig();
if (!config.game.version) throw new Error('Local HTML build requires game.version in thalia.config.toml.');
await buildHtml(config, { embedIndexDBMods: false });
