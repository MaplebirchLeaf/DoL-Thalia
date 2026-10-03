import { rm } from 'node:fs/promises';
import { buildHtml } from '../builders/html';
import { prepareLocalBuild } from '../builders/prepare';
import { splitHtmlAssets } from '../builders/split-html-assets';
import type { ThaliaConfig } from '../core/config';
import { runTimedStep } from '../core/steps';
import { resolveVanillaGameHtml } from '../sources/vanilla-game';

const PLAY_ROOT = 'site/public/play';

/** Explicit game build; metadata synchronization never calls this entry point. */
export async function buildOnlinePlay(config: ThaliaConfig): Promise<void> {
  const sourceHtml = await runTimedStep(`Build ${config.game.version} vanilla source HTML`, () => resolveVanillaGameHtml(config));
  await rm(PLAY_ROOT, { recursive: true, force: true });
  await prepareLocalBuild(config, { steps: ['sugarcube', 'modloader', 'modloader-tools', 'builtin-mods'] });
  for (const [language, i10nHook] of [
    ['en', false],
    ['chs', true]
  ] as const) {
    const siteConfig: ThaliaConfig = {
      ...config,
      paths: { ...config.paths, source_html: sourceHtml, output_html: `${PLAY_ROOT}/${language}/index.html` }
    };
    await prepareLocalBuild(siteConfig, { steps: ['story-format'], storyFormat: { i10nHook, modloaderHook: true } });
    await runTimedStep(`Build ${config.game.version} ${language} online play HTML`, () => buildHtml(siteConfig, { embedIndexDBMods: false, i10nHook, minify: false, modloader: true }));
    await splitHtmlAssets(siteConfig.paths.output_html);
  }
}
