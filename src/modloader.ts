import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { dirname, join, posix, resolve } from 'node:path';
import type { ThaliaConfig } from './config';
import { logDone, logWarn } from './log';
import { run, runShell } from './process';

export async function buildModLoaderTools(config: ThaliaConfig): Promise<void> {
  const root = resolve(config.upstreams.modloader.path);
  await installDependencies(root);
  await runShell('corepack yarn run webpack:BeforeSC2', { cwd: root, quiet: true });
  await runShell('corepack yarn run ts:ForSC2', { cwd: root, quiet: true });
  await runShell('corepack yarn run webpack:insertTools', { cwd: root, quiet: true });
  requireFile(join(root, 'dist-BeforeSC2/BeforeSC2.js'));
  requireFile(join(root, 'dist-insertTools/insert2html.js'));
  requireFile(join(root, 'dist-insertTools/sc2ReplaceTool.js'));
  requireFile(join(root, 'dist-insertTools/packModZip.js'));
}

export async function buildModLoaderLocalMods(config: ThaliaConfig): Promise<void> {
  const root = resolve(config.upstreams.modloader.path);
  const packModZip = join(root, 'dist-insertTools/packModZip.js');
  requireFile(packModZip);
  requireFile(join(root, 'modList.json'));
  const targets = await readModLoaderLocalModTargets(root);
  let existingCount = 0;
  for (const target of targets) {
    const outputZip = resolve(root, target);
    if (existsSync(outputZip)) {
      existingCount += 1;
      continue;
    }
    const modDirRel = posix.dirname(target);
    const modDir = resolve(root, modDirRel);
    const bootJson = join(modDir, 'boot.json');
    logWarn(`内置模组缺失，正在构建：${target}`);
    await syncModLoaderSubmodule(root, modDirRel);
    requireFile(bootJson);
    await run(['node', packModZip, 'boot.json'], { cwd: modDir, quiet: true });
    requireFile(outputZip);
  }
  if (existingCount > 0) logDone(`内置模组已就绪：${existingCount}/${targets.length}`);
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

async function syncModLoaderSubmodule(root: string, submodulePath: string): Promise<void> {
  const ok = await tryRun(['git', 'submodule', 'update', '--init', '--recursive', '--jobs', '1', submodulePath], { cwd: root });
  if (ok) return;
  logWarn(`子模块同步失败，清理后重试：${submodulePath}`);
  await tryRun(['git', 'submodule', 'deinit', '-f', '--', submodulePath], { cwd: root });
  await rm(resolve(root, submodulePath), { recursive: true, force: true });
  await rm(join(root, '.git', 'modules', ...submodulePath.split('/')), { recursive: true, force: true });
  await run(['git', 'submodule', 'update', '--init', '--recursive', '--force', '--jobs', '1', submodulePath], { cwd: root, quiet: true });
}

async function tryRun(
  command: string[],
  options: {
    cwd?: string;
  } = {}
): Promise<boolean> {
  try {
    await run(command, { ...options, quiet: true, printOutputOnError: false });
    return true;
  } catch {
    return false;
  }
}

function requireFile(path: string): void {
  if (!existsSync(path)) throw new Error(`缺少文件：${path}`);
}
