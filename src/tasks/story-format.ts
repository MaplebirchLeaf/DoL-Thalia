import { loadConfig } from '../config';
import { buildStoryFormat } from '../story-format';

const config = await loadConfig();
await buildStoryFormat(config);
