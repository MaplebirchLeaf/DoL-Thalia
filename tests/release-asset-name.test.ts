import { expect, test } from 'bun:test';
import { buildReleaseAssetName, buildReleaseDate } from '../src/release/utils';
import { releaseAssetUrl } from '../site/src/releases';

// Ground truth: file names that actually exist on published GitHub releases
// (verified with `gh release view v0.5.10.12-0626 --json assets`).
const PUBLISHED_ASSETS = ['DoL-Thalia-0.5.10.12-chs-0626.apk', 'DoL-Thalia-0.5.10.12-vanilla-0626.zip', 'DoL-Thalia-0.5.10.12-chs-goose-m-0626.apk'];

/**
 * Model the publish pipeline exactly: the builder receives the bare game version
 * (no edition marker, no date) plus an optional release date, and joins the parts.
 */
function publishedName(gameVersion: string, preset: string, extension: 'apk' | 'zip', date?: string): string {
  return `${buildReleaseAssetName('DoL-Thalia', gameVersion, preset, date)}.${extension}`;
}

test('the publisher reproduces the file names that are actually published', () => {
  expect(publishedName('0.5.10.12', 'vanilla', 'zip', '0626')).toBe('DoL-Thalia-0.5.10.12-vanilla-0626.zip');
  expect(publishedName('0.5.10.12', 'chs', 'apk', '0626')).toBe('DoL-Thalia-0.5.10.12-chs-0626.apk');
  for (const asset of PUBLISHED_ASSETS) expect(asset).toMatch(/^DoL-Thalia-\d/);
});

test('site download links resolve to names the publisher actually creates', () => {
  // Regression: the site used to insert a 'dolp-' infix for DoLP releases that the
  // publisher never produced, so every DoLP download link returned 404.
  // A stored site version '<game>-<YYYY>' maps to game version '<game>' + date '<YYYY>'.
  const cases: Array<[string, string]> = [
    ['0.5.10.12-0626', '0.5.10.12'],
    ['0.5.12.13', '0.5.12.13'],
    ['dolp-0.778-0914', '0.778'],
    ['dolp-0.778', '0.778']
  ];
  for (const [stored, gameVersion] of cases) {
    const date = stored.match(/-(\d{4})$/)?.[1];
    for (const preset of ['vanilla', 'chs-goose-f-mysterious']) {
      for (const extension of ['zip', 'apk'] as const) {
        const file = releaseAssetUrl(stored, preset, extension).split('/').pop();
        expect(file).toBe(publishedName(gameVersion, preset, extension, date));
      }
    }
  }
});

test('DoLP links never contain an edition marker the publisher does not emit', () => {
  for (const preset of ['vanilla', 'chs']) {
    const file = releaseAssetUrl('dolp-0.778-0914', preset, 'zip').split('/').pop()!;
    expect(file.startsWith('DoL-Thalia-dolp-')).toBe(false);
    expect(file).toBe(publishedName('0.778', preset, 'zip', '0914'));
  }
});

test('every site link uses the release tag as stored', () => {
  expect(releaseAssetUrl('dolp-0.778-0914', 'chs', 'zip')).toContain('/download/vdolp-0.778-0914/');
  expect(releaseAssetUrl('0.5.12.13', 'chs', 'zip')).toContain('/download/v0.5.12.13/');
});

test('buildReleaseDate retains environment precedence and standard-version fallback', () => {
  const previous = Bun.env.THALIA_RELEASE_DATE;
  try {
    Bun.env.THALIA_RELEASE_DATE = ' 1003 ';
    expect(buildReleaseDate('0.5.12.13-0914')).toBe('1003');
    delete Bun.env.THALIA_RELEASE_DATE;
    expect(buildReleaseDate('0914')).toBe('0914');
    expect(buildReleaseDate('0.5.12.13-0914')).toBe('0914');
    expect(buildReleaseDate('0.778-0914')).toBeUndefined();
    expect(buildReleaseDate('dolp-0.778-0914')).toBeUndefined();
    expect(buildReleaseDate()).toBeUndefined();
  } finally {
    if (previous === undefined) delete Bun.env.THALIA_RELEASE_DATE;
    else Bun.env.THALIA_RELEASE_DATE = previous;
  }
});
