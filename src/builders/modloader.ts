import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ThaliaConfig } from '../core/config';
import { requireFile } from '../core/fs';
import { logWarn } from '../core/log';
import { runShell } from '../core/process';

export async function buildModLoaderTools(config: ThaliaConfig): Promise<void> {
  const root = resolve(config.upstreams.modloader.path);
  await installDependencies(root);
  await runShell('corepack yarn run ts:BeforeSC2', { cwd: root, quiet: true });
  await runShell('corepack yarn run webpack:BeforeSC2', { cwd: root, quiet: true });
  await runShell('corepack yarn run ts:ForSC2', { cwd: root, quiet: true });
  await runShell('corepack yarn run webpack:insertTools', { cwd: root, quiet: true });
  requireFile(join(root, 'dist-BeforeSC2/BeforeSC2.js'));
  requireFile(join(root, 'dist-insertTools/insert2html.js'));
  requireFile(join(root, 'dist-insertTools/sc2ReplaceTool.js'));
  requireFile(join(root, 'dist-insertTools/packModZip.js'));
}

export async function readModLoaderLocalModTargets(root: string): Promise<string[]> {
  const targets = await modListTargets(root);
  return targets.filter(target => {
    if (/^[a-z]+:\/\//i.test(target)) {
      logWarn(`Skip remote builtin mod: ${target}`);
      return false;
    }
    return true;
  });
}

export async function modListTargets(modLoaderRoot: string): Promise<string[]> {
  const modListPath = join(modLoaderRoot, 'modList.json');
  if (!existsSync(modListPath)) throw new Error(`modList.json not found: ${modListPath}`);
  const modList = await Bun.file(modListPath).json();
  if (!Array.isArray(modList) || !modList.every(target => typeof target === 'string')) {
    throw new Error(`Invalid modList.json: ${modListPath}`);
  }
  return [...new Set(modList)].filter(target => target.toLowerCase().endsWith('.mod.zip'));
}

async function installDependencies(root: string): Promise<void> {
  if (existsSync(join(root, '.pnp.cjs')) || existsSync(join(root, 'node_modules'))) return;
  await runShell('corepack yarn install', { cwd: root, quiet: true });
}
