import { resolve } from 'node:path';
import { run } from '../core/process';
import { loadConfig } from '../core/config';

const root = resolve((await loadConfig()).upstreams.modloader.path);
for (const [directory, tests] of [
  [root, './test'],
  [resolve(root, 'mod/ModLoaderGui'), './tests'],
  [resolve(root, 'mod/BeautySelectorAddon'), './test']
]) {
  await run([process.execPath, 'test', tests], { cwd: directory });
}
