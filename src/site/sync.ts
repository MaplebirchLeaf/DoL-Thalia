import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { readReleasePresets } from '../release/presets';

export interface SiteReleasePreset {
  title: string;
  name: string;
}

const RELEASE_PRESETS_SITE_DATA = 'site/data/release.json';
const PLAY_INDEX = 'site/public/play/index.html';

export async function syncSiteData(): Promise<void> {
  if (!existsSync(PLAY_INDEX)) throw new Error(`Online play HTML is required for site build: ${PLAY_INDEX}`);
  const presets = await readReleasePresets();
  const sitePresets: SiteReleasePreset[] = presets.map(({ name, title }) => ({
    title: title ?? name,
    name
  }));
  await writeJson(RELEASE_PRESETS_SITE_DATA, sitePresets);
}

async function writeJson(path: string, data: unknown): Promise<void> {
  const output = resolve(path);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}
