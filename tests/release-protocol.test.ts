import { expect, test } from 'bun:test';
import { buildReleaseAssetName, buildReleaseAssetUrl, parseReleaseAssetName, parseReleaseTag, parseReleaseVersion, parseStoredReleaseVersion } from '../src/release/protocol';

test('release tags share edition, bare version and optional date parsing', () => {
  for (const [tag, edition, gameVersion, releaseDate] of [
    ['v0.5.12.13', 'standard', '0.5.12.13', undefined],
    ['v0.5.12.13-1003', 'standard', '0.5.12.13', '1003'],
    ['vdolp-0.778', 'dolp', '0.778', undefined],
    ['vdolp-0.778-0914', 'dolp', '0.778', '0914'],
    ['vdolp-0.7.8.9-0914', 'dolp', '0.7.8.9', '0914']
  ] as const) {
    const expected = { tag, storedVersion: tag.slice(1), edition, gameVersion, releaseDate };
    expect(parseReleaseTag(tag)).toEqual(expected);
    expect(parseStoredReleaseVersion(tag.slice(1))).toEqual(expected);
  }
  for (const tag of ['0.5.12.13', 'v0.5.12', 'v0.5.12.13.1', 'v0.5.12.13-103', 'v0.5.12.13-10033', 'vdolp-0', 'vdolp-0.7.8.9.1', 'v0.5.12.13-preview', 'v0.5.12.13\n', ' v0.5.12.13']) {
    expect(() => parseReleaseTag(tag)).toThrow();
  }
});

test('archive parsing requires ZIP or APK and the release version and date', () => {
  const release = parseReleaseTag('v0.5.12.13-1003');
  expect(parseReleaseAssetName('DoL-Thalia-0.5.12.13-chs-goose-f-mysterious-1003.zip', release)).toEqual({
    gameVersion: '0.5.12.13',
    preset: 'chs-goose-f-mysterious',
    releaseDate: '1003',
    extension: 'zip'
  });
  for (const name of [
    'DoL-Thalia-0.5.12.13-preview-1003.png',
    'DoL-Thalia-0.5.12.13-thalia-1003.zip.sha256',
    'DoL-Thalia-0.5.12.13-thalia-1002.apk',
    'DoL-Thalia-0.5.12.13-thalia.apk',
    'DoL-Thalia-0.5.12.12-thalia-1003.zip',
    'DoL-Thalia-dolp-0.5.12.13-thalia-1003.zip',
    'Other-0.5.12.13-thalia-1003.zip'
  ])
    expect(parseReleaseAssetName(name, release)).toBeUndefined();
  const undated = parseReleaseTag('v0.5.12.13');
  expect(parseReleaseAssetName('DoL-Thalia-0.5.12.13-thalia.apk', undated)?.preset).toBe('thalia');
  expect(parseReleaseAssetName('DoL-Thalia-0.5.12.13-thalia-1003.apk', undated)).toBeUndefined();
});

test('historical DoLP filename markers are accepted while canonical links stay unchanged', () => {
  const release = parseReleaseTag('vdolp-0.778-0914');
  for (const marker of ['', 'dolp-']) {
    expect(parseReleaseAssetName(`DoL-Thalia-${marker}0.778-goose-m-mysterious-0914.apk`, release)).toEqual({
      gameVersion: '0.778',
      preset: 'goose-m-mysterious',
      releaseDate: '0914',
      extension: 'apk'
    });
  }
  expect(buildReleaseAssetUrl('MaplebirchLeaf/DoL-Thalia', release.storedVersion, 'goose-m-mysterious', 'apk')).toBe(
    'https://github.com/MaplebirchLeaf/DoL-Thalia/releases/download/vdolp-0.778-0914/DoL-Thalia-0.778-goose-m-mysterious-0914.apk'
  );
  expect(buildReleaseAssetName('DoL-Thalia', '0.5.12.13-1003', 'thalia')).toBe('DoL-Thalia-0.5.12.13-thalia-1003');
});

test('legacy bare version parsing keeps its original fallback behavior', () => {
  expect(parseReleaseVersion(' 0.5.12.13-1003 ')).toEqual({ gameVersion: '0.5.12.13', releaseDate: '1003' });
  for (const gameVersion of ['0.778-0914', 'dolp-0.778-0914', 'invalid']) expect(parseReleaseVersion(gameVersion)).toEqual({ gameVersion });
});
