import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { runInNewContext } from 'node:vm';
import type { ThaliaConfig } from '../src/core/config';
import { buildStoryFormat, type BuildStoryFormatOptions } from '../src/builders/story-format';

const startup = `jQuery(() => {
  'use strict';
  UIBar.init();
  Story.init();
  L10n.init();
});`;

async function storyFormatFixture() {
  const root = await mkdtemp(join(tmpdir(), 'thalia-story-l10n-'));
  const sugarcubeRoot = join(root, 'sugarcube');
  await mkdir(join(sugarcubeRoot, 'src'), { recursive: true });
  await mkdir(join(sugarcubeRoot, 'node_modules'));
  await mkdir(join(sugarcubeRoot, 'build/twine2/sugarcube-2'), { recursive: true });
  await writeFile(join(sugarcubeRoot, 'src/sugarcube.js'), startup);
  // Exercise the real patch/build/compress/restore pipeline without building upstream SugarCube.
  await writeFile(join(sugarcubeRoot, 'build.js'), "const fs = require('node:fs'); fs.copyFileSync('src/sugarcube.js', 'build/twine2/sugarcube-2/format.js');");
  const config = {
    upstreams: { sugarcube_vrelnir: { path: sugarcubeRoot } },
    paths: { story_format: join(root, 'format.js') }
  } as ThaliaConfig;
  return { root, config, source: join(sugarcubeRoot, 'src/sugarcube.js') };
}

async function buildFixture(config: ThaliaConfig, options: BuildStoryFormatOptions = {}) {
  await buildStoryFormat(config, options);
  const filename = `format.${options.modloaderHook === false ? 'plain' : 'modloader'}.${options.i10nHook ? 'chs' : 'en'}.js`;
  return readFile(join(dirname(config.paths.story_format), filename), 'utf8');
}

async function runStartup(source: string, options: { language?: string; loader?: 'success' | 'failure'; externalHook?: boolean } = {}) {
  const labels = { savesTitle: 'Saves', savesHeaderSaveLoad: 'Save/Load', uiBarToggle: 'Toggle the UI bar' };
  const phases: string[] = [];
  const uiLabels: Record<string, string>[] = [];
  let calls = 0;
  const window: Record<string, unknown> = {};
  if (options.externalHook)
    window.initI10n = (strings: typeof labels) => {
      expect(strings).toBe(labels);
      calls++;
      phases.push('external-i10n');
      strings.savesTitle = '自定义存档';
    };
  if (options.loader) {
    window.modSC2DataManager = {
      startInit: () => {
        phases.push('modloader-init');
        return options.loader === 'failure' ? Promise.reject(new Error('fixture preload failure')) : Promise.resolve();
      }
    };
    window.jsPreloader = { startLoad: () => phases.push('preload') };
  }
  runInNewContext(source, {
    window,
    l10nStrings: labels,
    navigator: { language: options.language ?? 'en-US', languages: [options.language ?? 'en-US'] },
    jQuery: (ready: () => void) => ready(),
    UIBar: {
      init: () => {
        phases.push('ui-init');
        uiLabels.push({ ...labels });
      }
    },
    Story: { init: () => phases.push('story-init') },
    L10n: { init: () => phases.push('l10n-init') },
    console: { log() {}, error() {} }
  });
  await new Promise<void>(resolve => setImmediate(resolve));
  return { labels, uiLabels, phases, calls };
}

test('default English story format stays English on a Chinese browser and never calls the Chinese hook', async () => {
  const fixture = await storyFormatFixture();
  try {
    const output = await buildFixture(fixture.config);
    const result = await runStartup(output, { language: 'zh-CN', externalHook: true, loader: 'success' });
    expect(result.uiLabels).toEqual([{ savesTitle: 'Saves', savesHeaderSaveLoad: 'Save/Load', uiBarToggle: 'Toggle the UI bar' }]);
    expect(result.calls).toBe(0);
    expect(output).not.toContain('initI10n');
    expect(await readFile(fixture.source, 'utf8')).toBe(startup);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('Chinese localization is applied before SugarCube builds the UI even on an English browser', async () => {
  const fixture = await storyFormatFixture();
  try {
    const output = await buildFixture(fixture.config, { i10nHook: true });
    const result = await runStartup(output, { language: 'en-US', loader: 'success' });
    expect(result.uiLabels[0]).toMatchObject({ savesTitle: '存档', savesHeaderSaveLoad: '保存/加载', uiBarToggle: '打开/关闭导航栏' });
    expect(result.phases).toEqual(['modloader-init', 'preload', 'ui-init', 'story-init', 'l10n-init']);
    expect(output).not.toContain('navigator');
    expect(await readFile(fixture.source, 'utf8')).toBe(startup);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('Chinese startup preserves the external initI10n callback and uses its labels before UI setup', async () => {
  const fixture = await storyFormatFixture();
  try {
    const output = await buildFixture(fixture.config, { i10nHook: true });
    for (const loader of ['success', 'failure', undefined] as const) {
      const result = await runStartup(output, { externalHook: true, loader });
      expect(result.calls).toBe(1);
      expect(result.uiLabels[0]).toMatchObject({ savesTitle: '自定义存档', savesHeaderSaveLoad: '保存/加载' });
      expect(result.phases.indexOf('external-i10n')).toBeLessThan(result.phases.indexOf('ui-init'));
      expect(result.uiLabels).toHaveLength(1);
    }
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('plain Chinese story format also initializes localization before UI setup', async () => {
  const fixture = await storyFormatFixture();
  try {
    const output = await buildFixture(fixture.config, { modloaderHook: false, i10nHook: true });
    const result = await runStartup(output, { language: 'en-US', externalHook: true });
    expect(result.calls).toBe(1);
    expect(result.phases).toEqual(['external-i10n', 'ui-init', 'story-init', 'l10n-init']);
    expect(result.uiLabels[0]).toMatchObject({ savesTitle: '自定义存档', savesHeaderSaveLoad: '保存/加载' });
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('English and Chinese formats are separate files and building either preserves the other', async () => {
  const fixture = await storyFormatFixture();
  try {
    const english = await buildFixture(fixture.config);
    const chinese = await buildFixture(fixture.config, { i10nHook: true });
    expect(await readFile(join(fixture.root, 'format.modloader.en.js'), 'utf8')).toBe(english);
    expect(await buildFixture(fixture.config)).toBe(english);
    expect(await readFile(join(fixture.root, 'format.modloader.chs.js'), 'utf8')).toBe(chinese);
    expect((await runStartup(english, { language: 'zh-CN' })).uiLabels[0].savesTitle).toBe('Saves');
    expect((await runStartup(chinese, { language: 'en-US' })).uiLabels[0].savesTitle).toBe('存档');
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('rebuilding a previously patched plain format removes both legacy and current Chinese hooks for English', async () => {
  for (const predicate of ['', 'var shouldApplyChineseI10n = () => { return true; };']) {
    const fixture = await storyFormatFixture();
    const previouslyPatched = `jQuery(() => {
      ${predicate}
      var initI10n = () => {
        /* DoL-Thalia I10n hook */
        l10nStrings.savesTitle = '旧中文';
      };
      initI10n();
      UIBar.init();
      Story.init();
      L10n.init();
    });`;
    try {
      await writeFile(fixture.source, previouslyPatched);
      const output = await buildFixture(fixture.config, { modloaderHook: false });
      expect(output).not.toContain('initI10n');
      expect(output).not.toContain('shouldApplyChineseI10n');
      expect((await runStartup(output, { language: 'zh-CN' })).uiLabels[0].savesTitle).toBe('Saves');
      expect(await readFile(fixture.source, 'utf8')).toBe(previouslyPatched);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  }
});
