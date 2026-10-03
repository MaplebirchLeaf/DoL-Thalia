import type { Edition, SiteVersion } from './types';
import { buildReleaseAssetUrl, parseStoredReleaseVersion } from '../../src/release/protocol';

const REPOSITORY = 'MaplebirchLeaf/DoL-Thalia';

/** Release line from a stored version string ('0.5.11.9-0701' vs 'dolp-0.775-0701'). */
export function releaseEdition(version: SiteVersion): Edition {
  return parseStoredReleaseVersion(version).edition;
}

/** GitHub tag for a stored version (prepends 'v'). */
export function releaseTag(version: SiteVersion): string {
  return parseStoredReleaseVersion(version).tag;
}

/** Game version without edition marker and trailing -YYYY date (e.g. 0.5.11.9 / 0.775). */
export function releaseGameVersion(version: SiteVersion): string {
  return parseStoredReleaseVersion(version).gameVersion;
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
  return buildReleaseAssetUrl(REPOSITORY, version, presetName, extension);
}
