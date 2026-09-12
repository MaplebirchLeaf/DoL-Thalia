import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import type { ThaliaConfig } from '../core/config';
import { run, runShell } from '../core/process';
import { readBundledModPaths } from './modloader';
import { dependencyFingerprint, ensureYarnDependencies, fingerprintFile, fingerprintTree, fingerprintValues, hasYarnDependencies, readBuildDependencies } from '../core/build-cache';
import { logInfo } from '../core/log';

interface BuildCacheEntry {
  input: string;
  output: string;
}

const BUILD_CACHE_FILE = '.cache/build/builtin-mods.json';

interface BuiltinModTarget {
  target: string;
  output: string;
  directory: string;
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
  const submodulePaths = unique(targets.filter(target => !existsSync(join(target.directory, '.git'))).map(target => relative(modLoaderRoot, target.directory).replaceAll('\\', '/')));
  if (submodulePaths.length > 0) await run(['git', 'submodule', 'update', '--init', ...submodulePaths], { cwd: modLoaderRoot });
  await syncKnownNestedSubmodules(targets);
}

async function syncKnownNestedSubmodules(targets: BuiltinModTarget[]): Promise<void> {
  for (const target of targets) {
    const gitmodulesPath = join(target.directory, '.gitmodules');
    if (!existsSync(gitmodulesPath)) continue;
    const gitmodulesText = readFileSync(gitmodulesPath, 'utf8');
    const nestedPaths = [...gitmodulesText.matchAll(/^\s*path\s*=\s*(.+)\s*$/gm)].map(match => match[1].trim());
    for (const nestedPath of nestedPaths) {
      const nestedFullPath = join(target.directory, nestedPath);
      if (hasDirectoryContent(nestedFullPath)) continue;
      if (!(await isKnownGitSubmodule(target.directory, nestedPath))) continue;
      await run(['git', 'submodule', 'sync', '--', nestedPath], { cwd: target.directory });
      await run(['git', 'submodule', 'update', '--init', '--', nestedPath], { cwd: target.directory });
    }
  }
}

async function readBuiltinModTargets(modLoaderRoot: string): Promise<BuiltinModTarget[]> {
  const targets = (await readBundledModPaths(modLoaderRoot)).map(target => {
    const output = join(modLoaderRoot, target);
    const dir = dirname(output);
    return {
      target,
      output,
      directory: dir,
      name: basename(dir)
    };
  });
  if (targets.length === 0) throw new Error(`No active .mod.zip targets found in ${join(modLoaderRoot, 'modList.json')}`);
  return targets;
}

async function buildBuiltinModTargets(modLoaderRoot: string, targets: BuiltinModTarget[]): Promise<void> {
  const packModZip = join(modLoaderRoot, 'dist-insertTools', 'packModZip.js');
  if (!existsSync(packModZip)) throw new Error(`Missing packModZip.js: ${packModZip}`);
  const coreInputs = await Promise.all(['dist-BeforeSC2', 'dist-ForSC2', 'dist-insertTools'].map(dir => fingerprintTree(join(modLoaderRoot, dir))));
  coreInputs.push(await readFile('src/builders/builtin-mods.ts', 'utf8'), await readFile('src/core/build-cache.ts', 'utf8'), process.version, Bun.version, 'production');
  const sources = new Map<string, string>();
  const names = new Map<string, string>();
  const dependencyNames = new Map<string, string[]>();
  for (const target of targets) {
    const boot = await Bun.file(join(target.directory, 'boot.json')).json();
    names.set(boot.name, target.name);
    for (const alias of boot.alias ?? []) names.set(alias, target.name);
    dependencyNames.set(
      target.name,
      (boot.dependenceInfo ?? []).map((dependency: { modName: string }) => dependency.modName)
    );
    sources.set(target.name, await fingerprintTree(target.directory, true));
  }
  const dependencies = new Map([...dependencyNames].map(([name, list]) => [name, list.map(dependency => names.get(dependency) ?? dependency)]));
  for (const [name, imported] of await readBuildDependencies(targets)) {
    dependencies.set(name, unique([...(dependencies.get(name) ?? []), ...imported]));
  }
  let cache: Record<string, BuildCacheEntry> = {};
  try {
    cache = JSON.parse(await readFile(BUILD_CACHE_FILE, 'utf8'));
    if (!cache || typeof cache !== 'object' || Array.isArray(cache)) cache = {};
  } catch {
    /* Missing or damaged cache always triggers a rebuild. */
  }
  const inputs = new Map(targets.map(target => [target.name, fingerprintValues([...coreInputs, dependencyFingerprint(target.name, sources, dependencies)])]));
  const changed: BuiltinModTarget[] = [];
  for (const target of targets) {
    const previous = cache[target.name];
    if (!hasYarnDependencies(target.directory) || !previous || previous.input !== inputs.get(target.name) || previous.output !== (await fingerprintModOutput(target))) changed.push(target);
  }
  logInfo(`Bundled mods: rebuild ${changed.length}, reuse ${targets.length - changed.length}`);
  // Generate every changed type surface before bundling consumers of those declarations.
  for (const target of changed) {
    await ensureYarnDependencies(target.directory);
    await cleanBuiltinModTarget(target);
    await runBuiltinModScripts(target.directory, ['ts:type', 'build:type', 'build:ts']);
  }
  for (const target of changed) {
    logInfo(`Build ${target.name}`);
    await runBuiltinModScripts(target.directory, ['build:webpack', 'build']);
    await run(['node', packModZip, 'boot.json'], { cwd: target.directory, quiet: true });
    if (!existsSync(target.output)) throw new Error(`Missing packed mod zip: ${target.output}`);
    cache[target.name] = { input: inputs.get(target.name)!, output: await fingerprintModOutput(target) };
  }
  await mkdir(dirname(BUILD_CACHE_FILE), { recursive: true });
  await writeFile(BUILD_CACHE_FILE, `${JSON.stringify(Object.fromEntries(targets.map(target => [target.name, cache[target.name]])), null, 2)}\n`);
}

async function fingerprintModOutput(target: BuiltinModTarget): Promise<string> {
  if (!existsSync(target.output)) return '';
  const files = [await fingerprintFile(target.output)];
  for (const name of ['dist', 'dist-ts', 'build']) {
    const directory = join(target.directory, name);
    files.push(name, existsSync(directory) ? await fingerprintTree(directory) : 'missing');
  }
  return fingerprintValues(files);
}

async function cleanBuiltinModTarget(target: BuiltinModTarget): Promise<void> {
  await rm(target.output, { force: true });
  for (const directoryName of ['dist', 'dist-ts', 'build']) await rm(join(target.directory, directoryName), { recursive: true, force: true });
}

async function runBuiltinModScripts(directory: string, scriptNames: string[]): Promise<void> {
  const bootJson = join(directory, 'boot.json');
  if (!existsSync(bootJson)) throw new Error(`Missing boot.json: ${bootJson}`);
  const packageJsonPath = join(directory, 'package.json');
  if (!existsSync(packageJsonPath)) return;
  const scripts = (await Bun.file(packageJsonPath).json()).scripts || {};
  for (const scriptName of scriptNames) if (scripts[scriptName]) await runShell(`corepack yarn run ${scriptName}`, { cwd: directory, quiet: true, env: { NODE_ENV: 'production' } });
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

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
