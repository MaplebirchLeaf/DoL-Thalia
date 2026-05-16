import { loadConfig } from '../config';
import { buildHtml } from '../html';

const config = await loadConfig();
await buildHtml(config);
