import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ThaliaConfig } from './config';
import { runShell } from './process';

export async function buildModLoaderTools(config: ThaliaConfig): Promise<void> {
  const root = config.upstreams.modloader.path;

  await installDependencies(root);

  await runShell('corepack yarn run webpack:BeforeSC2', { cwd: root });
  await runShell('corepack yarn run ts:ForSC2', { cwd: root });
  await runShell('corepack yarn run webpack:insertTools', { cwd: root });

  requireFile(join(root, 'dist-BeforeSC2/BeforeSC2.js'));
  requireFile(join(root, 'dist-insertTools/insert2html.js'));
  requireFile(join(root, 'dist-insertTools/sc2ReplaceTool.js'));
  requireFile(join(root, 'dist-insertTools/packModZip.js'));
}

async function installDependencies(root: string): Promise<void> {
  if (existsSync(join(root, '.pnp.cjs')) || existsSync(join(root, 'node_modules'))) return;
  await runShell('corepack yarn install', { cwd: root });
}

function requireFile(path: string): void {
  if (!existsSync(path)) throw new Error(`缺少构建产物：${path}`);
}
