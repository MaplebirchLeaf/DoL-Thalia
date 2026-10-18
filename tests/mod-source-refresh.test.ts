import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, type ThaliaConfig, withGameVariant } from '../src/core/config';
import { correctLocalization, requirePublishedLocalization, syncModSources } from '../src/sources/mod-sources';

test('combat builds refuse an unpaired or unversioned localization archive', async () => {
  const config = { game: { version: '0.5.12.13' } } as ThaliaConfig;
  const combat = { original: 'original.html', patched: 'patched.html' };
  const files = ['ModI18N-0.5.12.13-chs-1.0.1a.mod.zip'];
  expect(await correctLocalization(config, files)).toEqual(files);
  expect(await correctLocalization(config, ['Xrayfork.zip'], combat)).toEqual(['Xrayfork.zip']);
  await expect(correctLocalization(config, files, combat)).rejects.toThrow('requires matching localization data');
  config.localization_data = { game_version: '0.5.12.13' } as NonNullable<ThaliaConfig['localization_data']>;
  await expect(correctLocalization(config, ['ModI18N-custom.zip'], combat)).rejects.toThrow('requires a versioned ModI18N archive');
});

test('private release assets refresh when same-name same-size content changes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'thalia-source-'));
  const previousFetch = globalThis.fetch;
  let content = 'old';
  let downloads = 0;
  globalThis.fetch = (async (input: string | URL | Request, options?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/releases/latest'))
      return Response.json({
        tag_name: 'assets-test',
        assets: [
          {
            id: 1,
            name: 'pack.zip',
            size: 3,
            digest: `sha256:${createHash('sha256').update(content).digest('hex')}`,
            url: 'https://api.github.com/repos/example/private/releases/assets/1',
            browser_download_url: 'https://example.com/pack.zip'
          }
        ]
      });
    expect(url).toBe('https://api.github.com/repos/example/private/releases/assets/1');
    expect(new Headers(options?.headers).get('Accept')).toBe('application/octet-stream');
    downloads++;
    return new Response(content);
  }) as typeof fetch;
  const config = {
    game: { version: '0.5.12.13' },
    paths: { builtin_mods: root },
    mod_sources: { pack: { repository: 'example/private', asset_keywords: ['pack'], asset_extensions: ['.zip'] } }
  } as ThaliaConfig;
  try {
    await syncModSources(config, ['pack']);
    await syncModSources(config, ['pack']);
    expect(downloads).toBe(1);
    content = 'new';
    await syncModSources(config, ['pack']);
    expect(downloads).toBe(2);
    expect(await readFile(join(root, '0.5.12.13', 'pack.zip'), 'utf8')).toBe('new');
  } finally {
    globalThis.fetch = previousFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test('Deadwood main and audio sources select distinct packages and preserve each other on repeated synchronization', async () => {
  const root = await mkdtemp(join(tmpdir(), 'thalia-audio-source-'));
  const previousFetch = globalThis.fetch;
  const names = ['deadwood-reblooms', 'deadwood-reblooms-audio'];
  const contents = ['main package', 'audio package'];
  const assets = names.map((name, index) => ({
    id: index + 1,
    name: `${name}-0.5.12.13-v2.4.1.modpack`,
    size: contents[index].length,
    digest: `sha256:${createHash('sha256').update(contents[index]).digest('hex')}`,
    url: `https://api.github.com/repos/MaplebirchLeaf/Deadwood-Reblooms/releases/assets/${index + 1}`,
    browser_download_url: `https://example.com/${name}.modpack`
  }));
  try {
    for (const variant of ['standard', 'dolp']) {
      const config = withGameVariant(await loadConfig(), variant);
      config.paths.builtin_mods = join(root, variant);
      config.mod_sources = Object.fromEntries(names.map(name => [name, config.mod_sources![name]]));
      const output = join(config.paths.builtin_mods, config.game.version);
      await mkdir(output, { recursive: true });
      for (const name of names) await writeFile(join(output, `${name}-0.5.12.13-v2.2.7.modpack`), 'old package');
      let requests = 0;
      const downloads: string[] = [];
      globalThis.fetch = (async (input: string | URL | Request) => {
        const url = String(input);
        if (url === 'https://api.github.com/repos/MaplebirchLeaf/Deadwood-Reblooms/releases/tags/v2.4.1') {
          requests++;
          if (requests === 4) expect(await readFile(join(output, assets[1].name), 'utf8')).toBe(contents[1]);
          return Response.json({ tag_name: 'v2.4.1', assets });
        }
        const index = assets.findIndex(asset => asset.url === url);
        expect(index).toBeGreaterThanOrEqual(0);
        downloads.push(assets[index].name);
        return new Response(contents[index]);
      }) as typeof fetch;
      await syncModSources(config, names);
      await syncModSources(config, names);
      expect(requests).toBe(4);
      expect(downloads).toEqual(assets.map(asset => asset.name));
      expect((await readdir(output)).filter(file => file.endsWith('.modpack')).sort()).toEqual(assets.map(asset => asset.name).sort());
      for (const [index, asset] of assets.entries()) expect(await readFile(join(output, asset.name), 'utf8')).toBe(contents[index]);
    }
  } finally {
    globalThis.fetch = previousFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test('release-ready rejects absent or prerelease localization', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json([{ tag_name: 'v0.5.12.13-chs-beta', prerelease: true }])) as typeof fetch;
  try {
    await expect(requirePublishedLocalization('example/localization', '0.5.12.13')).rejects.toThrow('has not been released');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('release-ready preserves a pinned official localization and rejects incompatible pins', async () => {
  const previousFetch = globalThis.fetch;
  let release = {
    tag_name: 'v0.5.12.13-chs-1.0.1a',
    draft: false,
    prerelease: false,
    assets: [{ name: 'ModI18N-0.5.12.13-chs-1.0.1a.mod.zip', browser_download_url: 'https://example.com/ModI18N.mod.zip' }]
  };
  globalThis.fetch = (async (url: string | URL | Request) => {
    expect(String(url)).toBe('https://api.github.com/repos/example/localization/releases/tags/v0.5.12.13-chs-1.0.1a');
    return Response.json(release);
  }) as typeof fetch;
  try {
    expect(await requirePublishedLocalization('example/localization', '0.5.12.13', release.tag_name)).toBe(release.tag_name);
    await expect(requirePublishedLocalization('example/localization', '0.5.12.12', release.tag_name)).rejects.toThrow('has not been released');
    release = { ...release, prerelease: true };
    await expect(requirePublishedLocalization('example/localization', '0.5.12.13', release.tag_name)).rejects.toThrow('has not been released');
  } finally {
    globalThis.fetch = previousFetch;
  }
});
