import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ThaliaConfig } from '../src/core/config';
import { requirePublishedLocalization, syncModSources } from '../src/sources/mod-sources';

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
