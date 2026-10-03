import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { readReleasePresets } from '../release/presets';
import { parseReleaseAssetName, parseReleaseTag, type ParsedReleaseTag } from '../release/protocol';
import { logWarn } from '../core/log';

export interface SiteReleasePreset {
  name: string;
  title_en?: string;
  title_cn?: string;
}

export interface SiteRelease {
  tag: string;
  /** Presets with published assets on this release; undefined = show all. */
  presets?: string[];
}

/**
 * Serialise generated site data the way the committed files are laid out.
 *
 * JSON.stringify always breaks arrays across lines, while oxfmt preserves the
 * line breaks it is given, so the committed data keeps short arrays on one line.
 * Emitting the expanded form made every `bun run site:build` leave the tree in a
 * state that fails `bun run check`, so values are rendered explicitly here:
 * string arrays stay inline, objects keep their properties on separate lines.
 */
function serializeSiteData(data: unknown): string {
  const rows = (Array.isArray(data) ? data : [data]).map(row => renderRow(row));
  return `[\n${rows.join(',\n')}\n]\n`;
}

function renderRow(row: unknown): string {
  const entries = Object.entries(row as Record<string, unknown>)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => {
      if (Array.isArray(value)) return `    "${key}": ${renderInlineArray(value)}`;
      return `    "${key}": ${JSON.stringify(value)}`;
    });
  return `  {\n${entries.join(',\n')}\n  }`;
}

function renderInlineArray(values: unknown[]): string {
  if (values.length === 0) return '[]';
  return `[${values.map(value => JSON.stringify(value)).join(', ')}]`;
}

const RELEASE_PRESETS_SITE_DATA = 'site/data/release.json';
const RELEASE_VERSIONS_SITE_DATA = 'site/data/versions.json';

export async function syncSiteData(): Promise<void> {
  const presets = await readReleasePresets();
  const sitePresets: SiteReleasePreset[] = presets.map(({ name, title_en, title_cn, title }) => ({
    name,
    title_en: title_en ?? title,
    title_cn: title_cn ?? title
  }));
  await writeJson(RELEASE_PRESETS_SITE_DATA, sitePresets);

  const publishedVersions = await fetchPublishedVersions();
  if (publishedVersions !== null) {
    await writeJson(RELEASE_VERSIONS_SITE_DATA, publishedVersions);
  } else {
    logWarn('无法读取 GitHub releases，versions.json 保持现状。');
  }
}

/**
 * Published versions are derived from this repository's release assets (best effort).
 * Returns null on network failure so callers keep existing data.
 */
export async function fetchPublishedVersions(): Promise<SiteRelease[] | null> {
  try {
    const response = await fetch('https://api.github.com/repos/MaplebirchLeaf/DoL-Thalia/releases?per_page=100', {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'DoL-Thalia-site' }
    });
    if (!response.ok) return null;
    const releases = (await response.json()) as Array<{ tag_name?: string; assets?: Array<{ name?: string }> }>;
    const result: SiteRelease[] = [];
    for (const release of releases) {
      let parsed: ParsedReleaseTag;
      try {
        parsed = parseReleaseTag(release.tag_name ?? '');
      } catch {
        continue;
      }
      const presets = collectPresets(parsed, release.assets ?? []);
      result.push({ tag: parsed.storedVersion, presets });
    }
    result.sort((a, b) => b.tag.localeCompare(a.tag, undefined, { numeric: true }));
    return result;
  } catch {
    return null;
  }
}

function collectPresets(release: ParsedReleaseTag, assets: Array<{ name?: string }>): string[] {
  const presets = new Set<string>();
  for (const asset of assets) {
    const parsed = parseReleaseAssetName(asset.name ?? '', release);
    if (parsed) presets.add(parsed.preset);
  }
  return Array.from(presets);
}

async function writeJson(path: string, data: unknown): Promise<void> {
  const output = resolve(path);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, serializeSiteData(data), 'utf8');
}
