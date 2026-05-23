import { existsSync, readFileSync } from 'node:fs';
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import type { ThaliaConfig } from './config';
import { logDone, logInfo, logStep } from './log';
import { run, runShell } from './process';

interface BuiltinModTarget {
  target: string;
  output: string;
  dir: string;
  name: string;
}

export async function syncAndBuildBuiltinMods(config: ThaliaConfig): Promise<void> {
  const modLoaderRoot = resolve(config.upstreams.modloader.path);
  await syncRequiredModSubmodules(modLoaderRoot);
  const targets = await readBuiltinModTargets(modLoaderRoot);
  await buildBuiltinModTargets(modLoaderRoot, targets);
}

async function syncRequiredModSubmodules(modLoaderRoot: string): Promise<void> {
  await run(['git', 'submodule', 'sync'], { cwd: modLoaderRoot });
  const targets = await readBuiltinModTargets(modLoaderRoot);
  const submodulePaths = unique(targets.map(T => relative(modLoaderRoot, T.dir).replaceAll('\\', '/')));
  if (submodulePaths.length === 0) return;
  await run(['git', 'submodule', 'update', '--init', ...submodulePaths], { cwd: modLoaderRoot });
  await syncKnownNestedSubmodules(targets);
}

async function syncKnownNestedSubmodules(targets: BuiltinModTarget[]): Promise<void> {
  for (const target of targets) {
    const gitmodulesPath = join(target.dir, '.gitmodules');
    if (!existsSync(gitmodulesPath)) continue;
    const gitmodulesText = readFileSync(gitmodulesPath, 'utf8');
    const nestedPaths = [...gitmodulesText.matchAll(/^\s*path\s*=\s*(.+)\s*$/gm)].map(match => match[1].trim());
    for (const nestedPath of nestedPaths) {
      const nestedFullPath = join(target.dir, nestedPath);
      if (hasDirectoryContent(nestedFullPath)) continue;
      if (!(await isKnownGitSubmodule(target.dir, nestedPath))) continue;
      await run(['git', 'submodule', 'sync', '--', nestedPath], { cwd: target.dir });
      await run(['git', 'submodule', 'update', '--init', '--', nestedPath], { cwd: target.dir });
    }
  }
}

async function readBuiltinModTargets(modLoaderRoot: string): Promise<BuiltinModTarget[]> {
  const modListPath = join(modLoaderRoot, 'modList.json');
  if (!existsSync(modListPath)) throw new Error(`modList.json not found: ${modListPath}`);
  const modList = await Bun.file(modListPath).json();
  if (!Array.isArray(modList) || !modList.every(target => typeof target === 'string')) throw new Error(`Invalid modList.json: ${modListPath}`);
  const targets = modList
    .filter(target => target.toLowerCase().endsWith('.mod.zip'))
    .map(target => {
      const output = join(modLoaderRoot, target);
      const dir = dirname(output);
      return {
        target,
        output,
        dir,
        name: basename(dir)
      };
    });
  if (targets.length === 0) throw new Error(`No active .mod.zip targets found in ${modListPath}`);
  return targets;
}

async function buildBuiltinModTargets(modLoaderRoot: string, targets: BuiltinModTarget[]): Promise<void> {
  const packModZip = join(modLoaderRoot, 'dist-insertTools', 'packModZip.js');
  if (!existsSync(packModZip)) throw new Error(`Missing packModZip.js: ${packModZip}`);
  logInfo(`Builtin mods: ${targets.length}`);
  logInfo(`Build order: ${targets.map(T => T.name).join(' -> ')}`);
  for (const target of targets) {
    await cleanBuiltinModTarget(target);
    await runBuiltinModScripts(target.dir, ['ts:type', 'build:type', 'build:ts']);
  }
  for (const [index, target] of targets.entries()) {
    logStep(`Build builtin mod ${index + 1}/${targets.length}: ${target.name}`);
    await runBuiltinModScripts(target.dir, ['build:webpack', 'build']);
    await run(['node', packModZip, 'boot.json'], { cwd: target.dir, quiet: true });
    if (!existsSync(target.output)) throw new Error(`Missing packed mod zip: ${target.output}`);
    logDone(`Output: ${target.target}`);
  }
}

async function cleanBuiltinModTarget(target: BuiltinModTarget): Promise<void> {
  await rm(target.output, { force: true });
  for (const dirName of ['dist', 'dist-ts', 'build']) await rm(join(target.dir, dirName), { recursive: true, force: true });
}

async function runBuiltinModScripts(dir: string, scriptNames: string[]): Promise<void> {
  const bootJson = join(dir, 'boot.json');
  if (!existsSync(bootJson)) throw new Error(`Missing boot.json: ${bootJson}`);
  const packageJsonPath = join(dir, 'package.json');
  if (!existsSync(packageJsonPath)) return;
  await installDependencies(dir);
  const scripts = (await Bun.file(packageJsonPath).json()).scripts || {};
  for (const scriptName of scriptNames) if (scripts[scriptName]) await runShell(`corepack yarn run ${scriptName}`, { cwd: dir, quiet: true });
}
async function installDependencies(dir: string): Promise<void> {
  if (existsSync(join(dir, '.pnp.cjs')) || existsSync(join(dir, 'node_modules'))) return;
  await runShell('corepack yarn install', { cwd: dir, quiet: true });
}

function hasDirectoryContent(path: string): boolean {
  return existsSync(path) && readdirSync(path).length > 0;
}

async function isKnownGitSubmodule(root: string, path: string): Promise<boolean> {
  const child = Bun.spawn(['git', 'ls-files', '-s', '--', path], {
    cwd: root,
    stdout: 'pipe',
    stderr: 'ignore'
  });
  const output = await new Response(child.stdout).text();
  const code = await child.exited;
  return code === 0 && output.trim().startsWith('160000 ');
}

function unique<T>(list: T[]): T[] {
  return [...new Set(list)];
}
