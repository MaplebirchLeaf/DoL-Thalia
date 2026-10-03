import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { buildHtml } from '../src/builders/html';
import { withStoryFormatConfig } from '../src/builders/story-format-config';
import { loadConfig } from '../src/core/config';

test('HTML source selection uses configured asset filenames first and legacy names only as fallback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'thalia-html-mod-sources-'));
  const config = await loadConfig();
  config.paths.story_format = join(root, 'format.js');
  config.paths.source_html = join(root, 'source.html');
  config.paths.output_html = join(root, 'output/index.html');
  config.paths.builtin_mods = join(root, 'mods');
  config.upstreams.modloader.path = join(root, 'loader');
  const tools = join(config.upstreams.modloader.path, 'dist-insertTools');
  const versionDir = join(config.paths.builtin_mods, config.game.version);
  const files: Record<string, string> = {
    'Fem.Goose.Compilation.zip': 'Fem Goose Compilation',
    'Masc.Goose.Compilation.zip': 'Masc Goose Compilation',
    'Fem Goose Compilation.zip': 'Fem Goose Compilation',
    'Masc Goose Compilation.zip': 'Masc Goose Compilation',
    'Mysterious.zip': 'Mysterious',
    'Unrelated.Beautification.zip': 'Unrelated',
    [`Fem.Goose.Compilation-preview-${config.game.version}.zip`]: 'Unrelated preview',
    [`deadwood-reblooms-${config.game.version}-v1.3.1.mod.zip`]: 'deadwood-reblooms',
    [`deadwood-reblooms-audio-${config.game.version}-v1.3.1.mod.zip`]: 'deadwood-reblooms-audio',
    [`deadwood-reblooms-extra-${config.game.version}.mod.zip`]: 'Unrelated deadwood extra'
  };
  try {
    await mkdir(tools, { recursive: true });
    await mkdir(join(config.upstreams.modloader.path, 'dist-BeforeSC2'));
    await mkdir(versionDir, { recursive: true });
    await writeFile(join(config.upstreams.modloader.path, 'dist-BeforeSC2/BeforeSC2.js'), '');
    await writeFile(join(config.upstreams.modloader.path, 'modList.json'), '[]');
    await writeFile(config.paths.source_html, '<html><script></script></html>');
    await writeFile(withStoryFormatConfig(config).paths.story_format, 'english-format');
    await writeFile(join(tools, 'sc2ReplaceTool.js'), `const fs = require('node:fs'); const html = process.argv[2]; fs.copyFileSync(html, html + '.sc2replace.html');`);
    await writeFile(join(tools, 'insert2html.js'), `const fs = require('node:fs'); const html = process.argv[2]; fs.copyFileSync(html, html + '.mod.html');`);
    for (const [filename, name] of Object.entries(files)) {
      if (filename === 'Fem Goose Compilation.zip' || filename === 'Masc Goose Compilation.zip') continue;
      await writeFile(join(versionDir, filename), zipSync({ 'boot.json': strToU8(JSON.stringify({ name })), 'marker.txt': strToU8(filename) }));
    }

    async function embedded(mods: string[]) {
      await buildHtml(config, { minify: false, releasePreset: { name: 'fixture', mods } });
      const html = await readFile(config.paths.output_html, 'utf8');
      const entries = JSON.parse(html.match(/window\.modDataValueZipListIndexDB = (\[[\s\S]*?\]);/)![1]) as Array<{ name: string; dataParts: string[] }>;
      return entries.map(entry => ({ name: entry.name, file: strFromU8(unzipSync(Buffer.from(entry.dataParts.join(''), 'base64'))['marker.txt']) }));
    }

    expect(await embedded(['Fem Goose Compilation', 'Mysterious'])).toEqual([
      { name: 'Fem Goose Compilation', file: 'Fem.Goose.Compilation.zip' },
      { name: 'Mysterious', file: 'Mysterious.zip' }
    ]);
    expect(await embedded(['Masc Goose Compilation', 'Mysterious'])).toEqual([
      { name: 'Masc Goose Compilation', file: 'Masc.Goose.Compilation.zip' },
      { name: 'Mysterious', file: 'Mysterious.zip' }
    ]);
    for (const filename of ['Fem Goose Compilation.zip', 'Masc Goose Compilation.zip']) {
      await writeFile(join(versionDir, filename), zipSync({ 'boot.json': strToU8(JSON.stringify({ name: files[filename] })), 'marker.txt': strToU8(filename) }));
    }
    expect(await embedded(['Fem Goose Compilation', 'Masc Goose Compilation', 'Mysterious'])).toEqual([
      { name: 'Fem Goose Compilation', file: 'Fem.Goose.Compilation.zip' },
      { name: 'Masc Goose Compilation', file: 'Masc.Goose.Compilation.zip' },
      { name: 'Mysterious', file: 'Mysterious.zip' }
    ]);
    expect(await embedded(['deadwood-reblooms'])).toEqual([{ name: 'deadwood-reblooms', file: `deadwood-reblooms-${config.game.version}-v1.3.1.mod.zip` }]);
    expect(await embedded(['deadwood-reblooms-audio'])).toEqual([{ name: 'deadwood-reblooms-audio', file: `deadwood-reblooms-audio-${config.game.version}-v1.3.1.mod.zip` }]);
    expect(await embedded(['deadwood-reblooms', 'deadwood-reblooms-audio'])).toHaveLength(2);
    await rm(join(versionDir, 'Fem.Goose.Compilation.zip'));
    await rm(join(versionDir, 'Masc.Goose.Compilation.zip'));
    expect(await embedded(['Fem Goose Compilation', 'Masc Goose Compilation', 'Mysterious'])).toEqual([
      { name: 'Fem Goose Compilation', file: 'Fem Goose Compilation.zip' },
      { name: 'Masc Goose Compilation', file: 'Masc Goose Compilation.zip' },
      { name: 'Mysterious', file: 'Mysterious.zip' }
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
