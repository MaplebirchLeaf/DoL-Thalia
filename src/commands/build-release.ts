import { buildRelease } from '../builders/release';
import { loadConfig, withGameVariant } from '../core/config';
import { parseReleaseOptions } from './release-options';

const options = parseReleaseOptions(process.argv.slice(2));
await buildRelease(withGameVariant(await loadConfig(), options.game), options);
