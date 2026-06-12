import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { ThaliaConfig } from '../core/config';
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
  const modListPath = join(root, 'modList.json');
  const targets = JSON.parse(await readFile(modListPath, 'utf8'));
  if (!Array.isArray(targets) || !targets.every(target => typeof target === 'string')) {
    throw new Error(`Invalid modList.json: ${modListPath}`);
  }
  return [...new Set(targets)]
    .filter(target => {
      if (/^[a-z]+:\/\//i.test(target)) {
        logWarn(`Skip remote builtin mod: ${target}`);
        return false;
      }
      return true;
    })
    .filter(target => target.toLowerCase().endsWith('.mod.zip'));
}

async function installDependencies(root: string): Promise<void> {
  if (existsSync(join(root, '.pnp.cjs')) || existsSync(join(root, 'node_modules'))) return;
  await runShell('corepack yarn install', { cwd: root, quiet: true });
}

function requireFile(path: string): void {
  if (!existsSync(path)) throw new Error(`Missing file: ${path}`);
}
