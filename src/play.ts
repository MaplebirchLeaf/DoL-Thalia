import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { ThaliaConfig } from './config';
import { discoverGameVersions } from './game-input';
import { logDone } from './log';

const ONLINE_PLAY_DIR = 'site/public/play/latest';

export async function syncOnlinePlay(config: ThaliaConfig): Promise<void> {
  const htmlDir = dirname(resolve(config.paths.output_html));
  if (!existsSync(htmlDir)) throw new Error(`Missing HTML output directory: ${htmlDir}`);
  const versions = await discoverGameVersions(config);
  const latestVersion = versions.at(-1);
  if (!latestVersion) throw new Error('No game version found for online play.');
  const outputDir = resolve(ONLINE_PLAY_DIR);
  await copyOnlinePlay(htmlDir, outputDir);
  logDone(`在线版输出：${outputDir} (${latestVersion})`);
}

async function copyOnlinePlay(sourceDir: string, outputDir: string): Promise<void> {
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  await copyWithoutImages(sourceDir, outputDir);
}

async function copyWithoutImages(sourceDir: string, outputDir: string): Promise<void> {
  const entries = await readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'img') continue;
    const source = join(sourceDir, entry.name);
    const target = join(outputDir, entry.name);
    if (entry.isDirectory()) {
      await mkdir(target, { recursive: true });
      await copyWithoutImages(source, target);
    } else if (entry.isFile()) {
      await copyFile(source, target);
    }
  }
}
