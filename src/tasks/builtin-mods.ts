import { loadConfig } from '../config';
import { syncAndBuildBuiltinMods } from '../builtin-mods';

const config = await loadConfig();
await syncAndBuildBuiltinMods(config);
