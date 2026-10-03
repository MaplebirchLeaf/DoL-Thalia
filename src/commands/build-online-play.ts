import { loadConfig } from '../core/config';
import { buildOnlinePlay } from '../site/online-play';

await buildOnlinePlay(await loadConfig());
