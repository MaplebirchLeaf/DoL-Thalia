import { loadConfig } from '../config';
import { buildApk } from '../package';

const config = await loadConfig();
await buildApk(config);
