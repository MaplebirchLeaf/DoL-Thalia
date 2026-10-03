import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { buildHtml } from '../src/builders/html';
import { withStoryFormatConfig } from '../src/builders/story-format-config';
import { loadConfig } from '../src/core/config';

test('HTML builds select isolated English/Chinese formats and no-input builds keep the English format', async () => {
  const root = await mkdtemp(join(tmpdir(), 'thalia-story-selection-'));
  const config = await loadConfig();
  config.paths.story_format = join(root, 'format.js');
  config.paths.source_html = join(root, 'source.html');
  config.paths.output_html = join(root, 'output/index.html');
  config.paths.builtin_mods = join(root, 'mods');
  config.upstreams.modloader.path = join(root, 'loader');
  const tools = join(config.upstreams.modloader.path, 'dist-insertTools');
  try {
    await mkdir(tools, { recursive: true });
    await mkdir(join(config.upstreams.modloader.path, 'dist-BeforeSC2'));
    await writeFile(join(config.upstreams.modloader.path, 'dist-BeforeSC2/BeforeSC2.js'), '');
    await writeFile(join(config.upstreams.modloader.path, 'modList.json'), '[]');
    await writeFile(config.paths.source_html, '<html><script></script></html>');
    await writeFile(config.paths.story_format, 'wrong-shared-format');
    for (const i10nHook of [false, true]) {
      await writeFile(withStoryFormatConfig(config, { i10nHook }).paths.story_format, i10nHook ? 'chinese-format' : 'english-format');
    }
    const plain = withStoryFormatConfig(config, { modloaderHook: false }).paths.story_format;
    expect(plain).not.toBe(withStoryFormatConfig(config).paths.story_format);
    expect(plain).not.toBe(withStoryFormatConfig(config, { i10nHook: true }).paths.story_format);
    await writeFile(
      join(tools, 'sc2ReplaceTool.js'),
      `const fs = require('node:fs'); const [html, format] = process.argv.slice(2); fs.writeFileSync(html + '.sc2replace.html', fs.readFileSync(html, 'utf8').replace('</html>', '<!-- ' + fs.readFileSync(format, 'utf8') + ' --></html>'));`
    );
    await writeFile(join(tools, 'insert2html.js'), `const fs = require('node:fs'); const html = process.argv[2]; fs.copyFileSync(html, html + '.mod.html');`);
    const mod = join(config.paths.builtin_mods, config.game.version, 'ModI18N-fixture.mod.zip');
    await mkdir(dirname(mod), { recursive: true });
    await writeFile(mod, zipSync({ 'boot.json': strToU8('{"name":"ModI18N"}') }));
    for (const [mods, embedIndexDBMods, i10nHook, expected, absent] of [
      [[], true, undefined, 'english-format', 'chinese-format'],
      [['ModI18N'], true, undefined, 'chinese-format', 'english-format'],
      [['ModI18N'], false, undefined, 'english-format', 'chinese-format'],
      [[], false, true, 'chinese-format', 'english-format']
    ] as const) {
      await buildHtml(config, { minify: false, embedIndexDBMods, i10nHook, releasePreset: { name: 'fixture', title: 'Fixture', mods: [...mods] } });
      const html = await readFile(config.paths.output_html, 'utf8');
      expect(html).toContain(expected);
      expect(html).not.toContain(absent);
      expect(html).not.toContain('wrong-shared-format');
      if (!embedIndexDBMods) expect(html).not.toContain('modDataValueZipListIndexDB');
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
