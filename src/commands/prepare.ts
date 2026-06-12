import { prepareLocalBuild } from '../builders/prepare';
import { loadConfig } from '../core/config';
import { parsePrepareOptions } from './prepare-options';

await prepareLocalBuild(await loadConfig(), parsePrepareOptions(process.argv.slice(2)));
