import { loadConfig } from '../config';
import { buildModLoaderTools } from '../modloader';

const config = await loadConfig();
await buildModLoaderTools(config);
