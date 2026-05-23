import type { SiteVersion } from './types';

const REPOSITORY_RELEASES = 'https://github.com/MaplebirchLeaf/DoL-Thalia/releases';

export function releaseTag(version: SiteVersion) {
  return version.startsWith('v') ? version : `v${version}`;
}

export function releaseAssetUrl(version: SiteVersion, presetName: string, extension: 'apk' | 'zip') {
  const file = `DoL-Thalia-${version.replace(/-\d{4}$/, '')}-${presetName}.${extension}`;
  return `${REPOSITORY_RELEASES}/download/${releaseTag(version)}/${file}`;
}
