import type { SiteVersion } from './types';

const REPOSITORY_RELEASES = 'https://github.com/MaplebirchLeaf/DoL-Thalia/releases';

export function releaseTag(version: SiteVersion) {
  return version.version;
}

export function releaseUrl(version: SiteVersion) {
  return `${REPOSITORY_RELEASES}/tag/${releaseTag(version)}`;
}

export function releaseAssetUrl(version: SiteVersion, presetName: string, extension: 'apk' | 'zip') {
  const file = `DoL-Thalia-${version.version}-${presetName}.${extension}`;
  return `${REPOSITORY_RELEASES}/download/${releaseTag(version)}/${file}`;
}
