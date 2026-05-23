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

export function buildReleaseAssetName(projectName: string, gameVersion: string, modListName: string, date: string): string {
  return `${safeFileName(projectName)}-${safeFileName(gameVersion)}-${safeFileName(modListName)}-${safeFileName(date)}`;
}
