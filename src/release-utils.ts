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

export function buildReleaseDate(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}${day}`;
}

export function buildReleaseAssetBaseName(projectName: string, gameVersion: string, modListName: string, date: string): string {
  return `${safeFileName(projectName)}-${safeFileName(gameVersion)}-${safeFileName(modListName)}-${safeFileName(date)}`;
}
