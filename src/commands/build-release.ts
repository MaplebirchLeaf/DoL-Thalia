import { buildRelease } from '../builders/release';
import { loadConfig } from '../core/config';
import { parseReleaseOptions } from './release-options';

await buildRelease(await loadConfig(), parseReleaseOptions(process.argv.slice(2)));
