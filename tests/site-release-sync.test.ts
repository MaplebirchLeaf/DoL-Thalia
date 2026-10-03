import { expect, test } from 'bun:test';
import { fetchPublishedVersions } from '../src/site/sync';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('site metadata collects only archives for the exact release, with historical optional dates and DoLP markers', async () => {
  const previousFetch = globalThis.fetch;
  const releases = [
    {
      tag_name: 'v0.5.12.13-1003',
      assets: [
        'DoL-Thalia-0.5.12.13-thalia-1003.zip',
        'DoL-Thalia-0.5.12.13-thalia-1003.apk',
        'DoL-Thalia-0.5.12.13-chs-1003.apk',
        'DoL-Thalia-0.5.12.13-preview-1003.png',
        'DoL-Thalia-0.5.12.13-preview-1003.html',
        'DoL-Thalia-0.5.12.13-goose-f-mysterious-1002.zip',
        'DoL-Thalia-0.5.12.13-goose-m-mysterious.zip',
        'DoL-Thalia-0.5.12.12-mysterious-1003.apk',
        'DoL-Thalia-dolp-0.5.12.13-marked-1003.zip',
        'DoL-Thalia-0.5.12.13-checksum-1003.zip.sha256'
      ]
    },
    {
      tag_name: 'v0.5.12.13',
      assets: ['DoL-Thalia-0.5.12.13-thalia.zip', 'DoL-Thalia-0.5.12.13-dated-1003.apk']
    },
    {
      tag_name: 'vdolp-0.778-0914',
      assets: ['DoL-Thalia-0.778-thalia-0914.zip', 'DoL-Thalia-dolp-0.778-goose-f-mysterious-0914.apk', 'DoL-Thalia-0.778-mismatch-1003.zip']
    },
    {
      tag_name: 'vdolp-0.777',
      assets: ['DoL-Thalia-dolp-0.777-thalia.zip']
    },
    { tag_name: 'v0.5.12.13-preview', assets: ['DoL-Thalia-0.5.12.13-thalia.zip'] },
    { tag_name: 'v0.5.12.14', draft: true, assets: ['DoL-Thalia-0.5.12.14-thalia.zip'] },
    { tag_name: 'v0.5.12.15', prerelease: true, assets: ['DoL-Thalia-0.5.12.15-thalia.zip'] }
  ];
  globalThis.fetch = (async () => new Response(JSON.stringify(releases.map(release => ({ ...release, assets: release.assets.map(name => ({ name })) }))))) as typeof fetch;
  try {
    const versions = await fetchPublishedVersions();
    expect(versions).toHaveLength(4);
    expect(versions?.find(version => version.tag === '0.5.12.13-1003')?.presets).toEqual(['thalia', 'chs']);
    expect(versions?.find(version => version.tag === '0.5.12.13')?.presets).toEqual(['thalia']);
    expect(versions?.find(version => version.tag === 'dolp-0.778-0914')?.presets).toEqual(['thalia', 'goose-f-mysterious']);
    expect(versions?.find(version => version.tag === 'dolp-0.777')?.presets).toEqual(['thalia']);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('site release requests use the configured GitHub token', async () => {
  const previousFetch = globalThis.fetch;
  const previousToken = process.env.GITHUB_TOKEN;
  let authorization: string | null = null;
  process.env.GITHUB_TOKEN = 'site-test-token';
  globalThis.fetch = (async (_url, options) => {
    authorization = new Headers(options?.headers).get('Authorization');
    return new Response('[]');
  }) as typeof fetch;
  try {
    expect(await fetchPublishedVersions()).toEqual([]);
    expect(authorization).toBe('Bearer site-test-token');
  } finally {
    globalThis.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = previousToken;
  }
});

test('deployment refuses failed or missing release metadata instead of reusing an empty download list', async () => {
  const root = await mkdtemp(join(tmpdir(), 'thalia-site-required-release-'));
  try {
    await mkdir(join(root, 'input'));
    await mkdir(join(root, 'site/data'), { recursive: true });
    await writeFile(join(root, 'input/modList.json'), JSON.stringify([{ name: 'metadata-only', mods: [] }]));
    const versionsPath = join(root, 'site/data/versions.json');
    const previousVersions = '[{"tag":"0.5.12.12"}]';
    await writeFile(versionsPath, previousVersions);
    const modulePath = resolve('src/site/sync.ts');
    for (const status of [403, 200]) {
      const script = `import { syncSiteData } from ${JSON.stringify(modulePath)};
        globalThis.fetch = async () => new Response('[]', { status: ${status} });
        await syncSiteData('v0.5.12.13');`;
      const child = Bun.spawn([process.execPath, '-e', script], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
      const error = await new Response(child.stderr).text();
      expect(await child.exited).not.toBe(0);
      expect(error).toContain('Cannot deploy site without published download metadata for v0.5.12.13');
      expect(await readFile(versionsPath, 'utf8')).toBe(previousVersions);
    }
    const script = `import { syncSiteData } from ${JSON.stringify(modulePath)};
      globalThis.fetch = async () => new Response(JSON.stringify([{ tag_name: 'v0.5.12.13', assets: [{ name: 'DoL-Thalia-0.5.12.13-metadata-only.zip' }] }]));
      await syncSiteData('v0.5.12.13');`;
    const child = Bun.spawn([process.execPath, '-e', script], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
    const error = await new Response(child.stderr).text();
    expect(await child.exited, error).toBe(0);
    expect(JSON.parse(await readFile(versionsPath, 'utf8'))).toEqual([{ tag: '0.5.12.13', presets: ['metadata-only'] }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('metadata synchronization works without a game, toolchain or build config', async () => {
  const root = await mkdtemp(join(tmpdir(), 'thalia-site-data-'));
  try {
    await mkdir(join(root, 'input'));
    await writeFile(join(root, 'input/modList.json'), JSON.stringify([{ name: 'metadata-only', title_en: 'Metadata', mods: [] }]));
    const modulePath = resolve('src/site/sync.ts');
    const script = `import { syncSiteData } from ${JSON.stringify(modulePath)};
      globalThis.fetch = async () => new Response('[]');
      await syncSiteData();`;
    const child = Bun.spawn([process.execPath, '-e', script], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
    const error = await new Response(child.stderr).text();
    expect(await child.exited, error).toBe(0);
    const presets = JSON.parse(await readFile(join(root, 'site/data/release.json'), 'utf8'));
    expect(presets).toEqual([{ name: 'metadata-only', title_en: 'Metadata' }]);
    expect(JSON.parse(await readFile(join(root, 'site/data/versions.json'), 'utf8'))).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('site metadata preserves the existing fallback on GitHub errors', async () => {
  const previousFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response('', { status: 403 })) as typeof fetch;
    expect(await fetchPublishedVersions()).toBeNull();
    globalThis.fetch = (async () => {
      throw new Error('offline');
    }) as typeof fetch;
    expect(await fetchPublishedVersions()).toBeNull();
  } finally {
    globalThis.fetch = previousFetch;
  }
});
