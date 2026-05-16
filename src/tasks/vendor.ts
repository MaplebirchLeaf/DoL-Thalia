import { loadConfig } from '../config';
import { syncGitRepo } from '../vendor';

const config = await loadConfig();
await syncGitRepo(config.upstreams.sugarcube_vrelnir);
await syncGitRepo(config.upstreams.modloader);
