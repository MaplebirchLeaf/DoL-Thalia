import { loadConfig } from '../config';
import { buildPlayerZip } from '../package';

const config = await loadConfig();
await buildPlayerZip(config);
