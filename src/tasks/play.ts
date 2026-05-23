import { loadConfig } from '../config';
import { syncOnlinePlay } from '../play';

const config = await loadConfig();
await syncOnlinePlay(config);
