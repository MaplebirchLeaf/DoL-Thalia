import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildHtml } from '../builders/html';
import { prepareLocalBuild } from '../builders/prepare';
import { loadConfig, type ThaliaConfig } from '../core/config';
import { runTimedStep } from '../core/steps';
import { readReleasePresets } from '../release/presets';
import { ensureVanillaGameHtml } from '../sources/vanilla-game';

export interface SiteReleasePreset {
  title: string;
  name: string;
}

const RELEASE_PRESETS_SITE_DATA = 'site/data/release.json';
const PLAY_INDEX = 'site/public/play/index.html';

export async function syncSiteData(): Promise<void> {
  const config = await loadConfig();
  await ensureOnlinePlayHtml(config);
  const presets = await readReleasePresets();
  const sitePresets: SiteReleasePreset[] = presets.map(({ name, title }) => ({
    title: title ?? name,
    name
  }));
  await writeJson(RELEASE_PRESETS_SITE_DATA, sitePresets);
}

async function ensureOnlinePlayHtml(config: ThaliaConfig): Promise<void> {
  if (existsSync(PLAY_INDEX)) return;

  const sourceHtml = await runTimedStep(`Build ${config.game.version} vanilla source HTML`, () => ensureVanillaGameHtml(config));
  const siteConfig: ThaliaConfig = {
    ...config,
    paths: {
      ...config.paths,
      source_html: sourceHtml,
      output_html: PLAY_INDEX
    }
  };

  await prepareLocalBuild(siteConfig, {
    steps: ['sugarcube', 'modloader', 'story-format', 'modloader-tools'],
    storyFormat: {
      i10nHook: false,
      modloaderHook: false
    }
  });
  await runTimedStep(`Build ${config.game.version} online play HTML`, () =>
    buildHtml(siteConfig, {
      embedIndexDBMods: false,
      minify: false,
      modloader: false
    })
  );
}

async function writeJson(path: string, data: unknown): Promise<void> {
  const output = resolve(path);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}
