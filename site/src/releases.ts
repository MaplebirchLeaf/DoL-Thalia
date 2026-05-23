import type { SiteVersion } from './types';

const REPOSITORY_RELEASES = 'https://github.com/MaplebirchLeaf/DoL-Thalia/releases';

export function releaseTag(version: SiteVersion): string {
  return version.startsWith('v') ? version : `v${version}`;
}

export function releaseAssetUrl(version: SiteVersion, presetName: string, extension: 'apk' | 'zip'): string {
  const releaseVersion = version.startsWith('v') ? version.slice(1) : version;
  const match = releaseVersion.match(/^(.+)-(\d{4})$/);
  if (!match) throw new Error(`Invalid release version: ${version}. Expected format: 0.5.8.10-0524.`);
  const [, gameVersion, releaseDate] = match;
  const file = `DoL-Thalia-${gameVersion}-${presetName}-${releaseDate}.${extension}`;
  return `${REPOSITORY_RELEASES}/download/${releaseTag(version)}/${file}`;
}
