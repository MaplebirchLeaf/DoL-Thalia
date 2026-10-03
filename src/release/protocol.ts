export type ReleaseEdition = 'standard' | 'dolp';
export type ReleaseAssetExtension = 'apk' | 'zip';

export interface ParsedReleaseTag {
  tag: string;
  storedVersion: string;
  edition: ReleaseEdition;
  gameVersion: string;
  releaseDate?: string;
}

export interface ParsedReleaseVersion {
  gameVersion: string;
  releaseDate?: string;
}

export interface ParsedReleaseAsset extends ParsedReleaseVersion {
  preset: string;
  extension: ReleaseAssetExtension;
}

/** The tag is strict; git ref and source commit checks belong to the caller. */
export function parseReleaseTag(tag: string): ParsedReleaseTag {
  const standard = tag.match(/^v(\d+\.\d+\.\d+\.\d+)(?:-(\d{4}))?$/);
  const dolp = tag.match(/^vdolp-(\d+\.\d+(?:\.\d+){0,2})(?:-(\d{4}))?$/);
  const match = standard ?? dolp;
  if (!match) throw new Error(`Expected v<four-part-version>[-MMDD] or vdolp-<version>[-MMDD], found: ${tag}`);
  return {
    tag,
    storedVersion: tag.slice(1),
    edition: standard ? 'standard' : 'dolp',
    gameVersion: match[1],
    releaseDate: match[2]
  };
}

export function parseStoredReleaseVersion(version: string): ParsedReleaseTag {
  return parseReleaseTag(`v${version}`);
}

/** Preserve the builder's legacy bare standard-version parsing contract. */
export function parseReleaseVersion(version: string): ParsedReleaseVersion {
  try {
    const parsed = parseReleaseTag(`v${version.trim()}`);
    if (parsed.edition !== 'standard') return { gameVersion: version };
    return { gameVersion: parsed.gameVersion, releaseDate: parsed.releaseDate };
  } catch {
    return { gameVersion: version };
  }
}

export function safeFileName(value: string): string {
  return (
    value
      .trim()
      .replace(/[^\w.-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'package'
  );
}

export function buildReleaseAssetName(projectName: string, gameVersion: string, preset: string, date?: string): string {
  const parsed = parseReleaseVersion(gameVersion);
  const releaseDate = date?.trim() || parsed.releaseDate;
  const parts = [projectName, parsed.gameVersion, preset];
  if (releaseDate) parts.push(releaseDate);
  return parts.map(safeFileName).join('-');
}

/** Historical DoLP archives may carry an extra dolp- filename marker. */
export function parseReleaseAssetName(name: string, release?: ParsedReleaseTag): ParsedReleaseAsset | undefined {
  const match = name.match(/^DoL-Thalia-(dolp-)?(\d+\.\d+(?:\.\d+){0,2})-([a-z0-9][a-z0-9-]*?)(?:-(\d{4}))?\.(zip|apk)$/i);
  if (!match) return undefined;
  const asset: ParsedReleaseAsset = { gameVersion: match[2], preset: match[3], releaseDate: match[4], extension: match[5].toLowerCase() as ReleaseAssetExtension };
  if (release && (asset.gameVersion !== release.gameVersion || asset.releaseDate !== release.releaseDate || (match[1] && release.edition !== 'dolp'))) return undefined;
  return asset;
}

export function buildReleaseAssetUrl(repository: string, storedVersion: string, preset: string, extension: ReleaseAssetExtension): string {
  const release = parseStoredReleaseVersion(storedVersion);
  const file = `${buildReleaseAssetName('DoL-Thalia', release.gameVersion, preset, release.releaseDate)}.${extension}`;
  return `https://github.com/${repository}/releases/download/${release.tag}/${file}`;
}
