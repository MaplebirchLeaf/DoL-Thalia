import type { SiteVersion } from './types';

const REPOSITORY_RELEASES = 'https://github.com/MaplebirchLeaf/DoL-Thalia/releases';

export function releaseTag(version: SiteVersion): string {
  return version.startsWith('v') ? version : `v${version}`;
}

export function releaseAssetUrl(version: SiteVersion, presetName: string, extension: 'apk' | 'zip'): string {
  const releaseVersion = version.startsWith('v') ? version.slice(1) : version;
  const match = releaseVersion.match(/^(.+)-(\d{4})$/);
  const gameVersion = match ? match[1] : releaseVersion;
  const releaseDate = match?.[2];
  const file = ['DoL-Thalia', gameVersion, presetName, releaseDate].filter(Boolean).join('-') + `.${extension}`;
  return `${REPOSITORY_RELEASES}/download/${releaseTag(version)}/${file}`;
}
