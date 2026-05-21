import { buildRelease } from '../build';
import { loadConfig } from '../config';

const config = await loadConfig();
await buildRelease(config);
