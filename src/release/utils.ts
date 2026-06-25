export function safeFileName(value: string): string {
  return (
    value
      .trim()
      .replace(/[^\w.-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'package'
  );
}

export function escapeXml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

export function buildPackageName(projectName: string, version: string): string {
  return `${safeFileName(projectName)}-${safeFileName(version)}`;
}

export function buildReleaseAssetName(projectName: string, gameVersion: string, modListName: string, date?: string): string {
  const releaseVersion = parseReleaseVersion(gameVersion);
  const releaseDate = date?.trim() || releaseVersion.releaseDate;
  const parts = [projectName, releaseVersion.gameVersion, modListName];
  if (releaseDate) parts.push(releaseDate);
  return parts.map(safeFileName).join('-');
}

export function buildReleaseDate(value?: string): string | undefined {
  const envDate = Bun.env.THALIA_RELEASE_DATE?.trim();
  if (envDate) return envDate;
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/^\d{4}$/.test(trimmed)) return trimmed;
  return parseReleaseVersion(trimmed).releaseDate;
}

export interface ParsedReleaseVersion {
  gameVersion: string;
  releaseDate?: string;
}

export function parseReleaseVersion(version: string): ParsedReleaseVersion {
  const match = version.trim().match(/^(\d+\.\d+\.\d+\.\d+)(?:-(\d{4}))?$/);
  if (!match) return { gameVersion: version };
  return {
    gameVersion: match[1],
    releaseDate: match[2]
  };
}
