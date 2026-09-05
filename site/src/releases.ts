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
 * GitHub release asset URL. File name contract (shared with publish naming):
 *   standard: DoL-Thalia-<game>-<preset>-<YYYY>.zip
 *   dolp:     DoL-Thalia-dolp-<game>-<preset>-<YYYY>.zip
 * with tag v<stored version>.
 */
export function releaseAssetUrl(version: SiteVersion, presetName: string, extension: 'apk' | 'zip'): string {
  const gameVersion = releaseGameVersion(version);
  const date = version.match(/-(\d{4})$/)?.[1];
  const parts = ['DoL-Thalia'];
  if (releaseEdition(version) === 'dolp') parts.push('dolp');
  parts.push(gameVersion, presetName);
  if (date) parts.push(date);
  const file = parts.join('-') + `.${extension}`;
  return `${REPOSITORY_RELEASES}/download/${releaseTag(version)}/${file}`;
}
