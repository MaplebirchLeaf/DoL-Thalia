import { existsSync } from 'node:fs';
import { chmod, mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { ThaliaConfig } from '../core/config';
import { extractZipSafe } from '../core/zip';
import { run } from '../core/process';

const VANILLA_GAME_CACHE = '.cache/site/vanilla-game';

export async function ensureVanillaGameHtml(config: ThaliaConfig): Promise<string> {
  const outputDir = resolve(VANILLA_GAME_CACHE, config.game.version);
  const outputHtml = join(outputDir, `Degrees of Lewdity ${config.game.version}.html`);
  if (existsSync(outputHtml)) return outputHtml;

  const sourceDir = join(outputDir, 'source');
  await mkdir(sourceDir, { recursive: true });
  await extractGameSourceArchive(config.game.version, sourceDir);

  const root = await findSourceRoot(sourceDir);
  await chmod(join(root, 'compile.sh'), 0o755);
  await chmodBundledTweego(root);
  await run(['bash', 'compile.sh'], {
    cwd: root,
    env: { FORCE_VERSION: config.game.version },
    quiet: true
  });

  const builtHtml = join(root, `Degrees of Lewdity ${config.game.version}.html`);
  if (!existsSync(builtHtml)) throw new Error(`Vanilla game build did not produce HTML: ${builtHtml}`);
  return builtHtml;
}

async function extractGameSourceArchive(version: string, outputDir: string): Promise<void> {
  const archive = join(dirname(outputDir), `degrees-of-lewdity-${version}.zip`);
  if (!existsSync(archive)) await downloadFile(releaseArchiveUrl(version), archive);
  await extractZipSafe(archive, outputDir, 'vanilla game archive');
}

async function findSourceRoot(sourceDir: string): Promise<string> {
  const entries = await readdir(sourceDir, { withFileTypes: true });
  const dirs = entries.filter(entry => entry.isDirectory());
  if (dirs.length !== 1) throw new Error(`Vanilla game archive should contain exactly one root directory: ${sourceDir}`);
  const root = join(sourceDir, dirs[0].name);
  if (!existsSync(join(root, 'compile.sh'))) throw new Error(`Vanilla game archive has no compile.sh: ${root}`);
  return root;
}

async function chmodBundledTweego(root: string): Promise<void> {
  for (const file of ['tweego_linux64', 'tweego_linux86', 'tweego_osx64', 'tweego_osx86', 'tweego_m1']) {
    const path = join(root, 'devTools', 'tweego', file);
    if (existsSync(path)) await chmod(path, 0o755);
  }
}

async function downloadFile(url: string, output: string): Promise<void> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'DoL-Thalia'
    }
  });
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, new Uint8Array(await response.arrayBuffer()));
}

function releaseArchiveUrl(version: string): string {
  return `https://gitgud.io/Vrelnir/degrees-of-lewdity/-/archive/${encodeURIComponent(version)}/degrees-of-lewdity-${encodeURIComponent(version)}.zip`;
}
