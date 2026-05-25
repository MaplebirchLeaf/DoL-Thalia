import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { readReleasePresets } from './release-presets';

export interface SiteReleasePreset {
  title: string;
  name: string;
}

const RELEASE_PRESETS_SITE_DATA = 'site/data/release.json';

export async function syncSiteData(): Promise<void> {
  const presets = await readReleasePresets();
  const sitePresets: SiteReleasePreset[] = presets.map(({ name, title }) => ({
    title: title ?? name,
    name
  }));
  const output = resolve(RELEASE_PRESETS_SITE_DATA);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(sitePresets, null, 2)}\n`, 'utf8');
}
