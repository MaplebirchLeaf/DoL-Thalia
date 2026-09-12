import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { lstat, mkdir, readdir, readFile, readlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { SyntaxKind } from 'typescript/unstable/ast';
import { createScanner } from 'typescript/unstable/ast/scanner';
import { runShell } from './process';

const IGNORED_DIRECTORIES = new Set(['.git', '.idea', 'node_modules', '.cache']);
const GENERATED_DIRECTORIES = new Set(['dist', 'dist-ts', 'build']);

/** Hash contents, including local edits; timestamps and unrelated generated files do not invalidate sources. */
export async function fingerprintTree(root: string, sourceOnly = false): Promise<string> {
  const hash = createHash('sha256');
  async function visit(path: string): Promise<void> {
    const name = relative(root, path).replaceAll('\\', '/');
    if (sourceOnly && (name.endsWith('.mod.zip') || name.endsWith('.tsbuildinfo') || name === '.yarn/install-state.gz' || name.startsWith('.yarn/cache/'))) return;
    const stat = await lstat(path);
    if (stat.isDirectory()) {
      for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
        if (IGNORED_DIRECTORIES.has(entry.name) || (sourceOnly && path === root && GENERATED_DIRECTORIES.has(entry.name))) continue;
        await visit(join(path, entry.name));
      }
    } else {
      hash.update(name).update('\0');
      hash.update(stat.isSymbolicLink() ? await readlink(path) : await readFile(path));
      hash.update('\0');
    }
  }
  await visit(root);
  return hash.digest('hex');
}

export function fingerprintValues(values: string[]): string {
  return createHash('sha256').update(JSON.stringify(values)).digest('hex');
}

export async function fingerprintFile(path: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}

/** Build-time imports include optional runtime peers and type-only interfaces absent from boot.json. */
export async function readBuildDependencies(targets: ReadonlyArray<{ name: string; directory: string }>): Promise<Map<string, string[]>> {
  const roots = targets.map(target => ({ name: target.name, directory: resolve(target.directory) }));
  const dependencies = new Map<string, string[]>();
  for (const target of roots) {
    const found = new Set<string>();
    async function visit(directory: string): Promise<void> {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (IGNORED_DIRECTORIES.has(entry.name) || GENERATED_DIRECTORIES.has(entry.name) || entry.name === '.yarn') continue;
        const path = join(directory, entry.name);
        if (entry.isDirectory()) await visit(path);
        else if (entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name)) {
          const scanner = createScanner(true, undefined, await readFile(path, 'utf8'));
          let previous = SyntaxKind.Unknown;
          let beforePrevious = SyntaxKind.Unknown;
          let previousText = '';
          let beforePreviousText = '';
          for (let token = scanner.scan(); token !== SyntaxKind.EndOfFile; token = scanner.scan()) {
            const isLiteral = token === SyntaxKind.StringLiteral || token === SyntaxKind.NoSubstitutionTemplateLiteral;
            const isModulePath =
              previous === SyntaxKind.FromKeyword ||
              previous === SyntaxKind.ImportKeyword ||
              (previous === SyntaxKind.OpenParenToken && (beforePrevious === SyntaxKind.ImportKeyword || beforePreviousText === 'require'));
            if (isLiteral && isModulePath) {
              const specifier = scanner.getTokenValue();
              if (specifier.startsWith('./') || specifier.startsWith('../')) {
                const importedPath = resolve(dirname(path), specifier);
                for (const candidate of roots) {
                  if (candidate.name === target.name) continue;
                  const local = relative(candidate.directory, importedPath);
                  if (!isAbsolute(local) && local !== '..' && !local.startsWith(`..${sep}`)) found.add(candidate.name);
                }
              }
            }
            beforePrevious = previous;
            beforePreviousText = previousText;
            previous = token;
            previousText = scanner.getTokenText();
          }
        }
      }
    }
    await visit(target.directory);
    dependencies.set(target.name, [...found].sort());
  }
  return dependencies;
}

export function hasYarnDependencies(root: string): boolean {
  return !existsSync(join(root, 'package.json')) || existsSync(join(root, 'node_modules')) || existsSync(join(root, '.pnp.cjs'));
}

/** Include transitive mod dependencies, including cycles, in each target's build inputs. */
export function dependencyFingerprint(name: string, sources: Map<string, string>, dependencies: Map<string, string[]>): string {
  const visited = new Set<string>();
  function visit(current: string): void {
    if (visited.has(current)) return;
    visited.add(current);
    for (const dependency of dependencies.get(current) ?? []) if (sources.has(dependency)) visit(dependency);
  }
  visit(name);
  return fingerprintValues([...visited].sort().flatMap(key => [key, sources.get(key) ?? '']));
}

export async function ensureYarnDependencies(root: string): Promise<void> {
  if (!existsSync(join(root, 'package.json'))) return;
  const inputs: string[] = [];
  for (const name of ['package.json', 'yarn.lock', '.yarnrc.yml']) {
    const path = join(root, name);
    if (existsSync(path)) inputs.push(name, await readFile(path, 'utf8'));
  }
  const patches = join(root, '.yarn/patches');
  if (existsSync(patches)) inputs.push(await fingerprintTree(patches));
  const digest = fingerprintValues(inputs);
  const cacheDir = '.cache/build/dependencies';
  const marker = join(cacheDir, fingerprintValues([root]));
  if (hasYarnDependencies(root) && existsSync(marker) && (await readFile(marker, 'utf8')) === digest) return;
  await runShell('corepack yarn install --immutable', { cwd: root, quiet: true });
  await mkdir(cacheDir, { recursive: true });
  await writeFile(marker, digest);
}
