import { parseReleaseVersion } from './protocol';

export { buildReleaseAssetName, parseReleaseVersion, safeFileName, type ParsedReleaseVersion } from './protocol';

export function escapeXml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

export function buildReleaseDate(value?: string): string | undefined {
  const envDate = Bun.env.THALIA_RELEASE_DATE?.trim();
  if (envDate) return envDate;
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/^\d{4}$/.test(trimmed)) return trimmed;
  return parseReleaseVersion(trimmed).releaseDate;
}
