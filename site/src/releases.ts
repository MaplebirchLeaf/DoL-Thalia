import type { Edition, SiteVersion } from './types';

const REPOSITORY_RELEASES = 'https://github.com/MaplebirchLeaf/DoL-Thalia/releases';

/** Release line from a stored version string ('0.5.11.9-0701' vs 'dolp-0.775-0701'). */
export function releaseEdition(version: SiteVersion): Edition {
  return /^dolp-/i.test(version) ? 'dolp' : 'standard';
}

/** GitHub tag for a stored version (prepends 'v'). */
export function releaseTag(version: SiteVersion): string {
  return `v${version}`;
}

/** Game version without edition marker and trailing -YYYY date (e.g. 0.5.11.9 / 0.775). */
export function releaseGameVersion(version: SiteVersion): string {
  const withoutDate = version.replace(/-\d{4}$/, '');
  return releaseEdition(version) === 'dolp' ? withoutDate.replace(/^dolp-/i, '') : withoutDate;
}

/**
 * GitHub release asset URL, with tag v<stored version>.
 *
 * The file name follows the same contract the publish pipeline uses
 * (buildReleaseAssetName): DoL-Thalia-<game>-<preset>[-<YYYY>].<ext>
 * The DoLP edition marker is stripped from the game version and is NOT
 * re-inserted: published assets carry only the game version token.
 * Keep aligned with tests/release-asset-name.test.ts.
 */
export function releaseAssetUrl(version: SiteVersion, presetName: string, extension: 'apk' | 'zip'): string {
  const gameVersion = releaseGameVersion(version);
  const date = version.match(/-(\d{4})$/)?.[1];
  const parts = ['DoL-Thalia', gameVersion, presetName];
  if (date) parts.push(date);
  const file = parts.join('-') + `.${extension}`;
  return `${REPOSITORY_RELEASES}/download/${releaseTag(version)}/${file}`;
}
