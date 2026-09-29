import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildHtml } from '../builders/html';
import { prepareLocalBuild } from '../builders/prepare';
import { loadConfig, type ThaliaConfig } from '../core/config';
import { runTimedStep } from '../core/steps';
import { readReleasePresets } from '../release/presets';
import { resolveVanillaGameHtml } from '../sources/vanilla-game';
import { logWarn } from '../core/log';
import { splitHtmlAssets } from '../builders/split-html-assets';

export interface SiteReleasePreset {
  name: string;
  title_en?: string;
  title_cn?: string;
}

export interface SiteRelease {
  tag: string;
  /** Presets with published assets on this release; empty/undefined = show all. */
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
  const entries = Object.entries(row as Record<string, unknown>).map(([key, value]) => {
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
const PLAY_INDEX = 'site/public/play/index.html';
const REPOSITORY = 'MaplebirchLeaf/DoL-Thalia';

export async function syncSiteData(): Promise<void> {
  const config = await loadConfig();
  if (Bun.env.SYNC_SKIP_ONLINE_PLAY !== '1') await ensureOnlinePlayHtml(config);

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
    logWarn('无法读取 GitHub tags，versions.json 保持现状。');
  }
}

/**
 * Published versions are derived from this repository's tags (best effort).
 * Returns null on network failure so callers keep existing data.
 */
async function fetchPublishedVersions(): Promise<SiteRelease[] | null> {
  try {
    const response = await fetch('https://api.github.com/repos/MaplebirchLeaf/DoL-Thalia/releases?per_page=100', {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'DoL-Thalia-site' }
    });
    if (!response.ok) return null;
    const releases = (await response.json()) as Array<{ tag_name?: string; assets?: Array<{ name?: string }> }>;
    const result: SiteRelease[] = [];
    for (const release of releases) {
      const tag = release.tag_name ?? '';
      const stored = tag.replace(/^v/, '');
      if (!/^(?:dolp-)?\d+\.\d+(?:\.\d+){0,2}(?:-\d{4})?$/.test(stored)) continue;
      const presets = collectPresets(stored, release.assets ?? []);
      result.push({ tag: stored, presets });
    }
    result.sort((a, b) => b.tag.localeCompare(a.tag, undefined, { numeric: true }));
    return result;
  } catch {
    return null;
  }
}

// Asset file name: DoL-Thalia[-dolp]-<gameVersion>-<preset>[-<YYYY>].zip|apk
function collectPresets(version: string, assets: Array<{ name?: string }>): string[] {
  const gameVersion = parseReleaseEdition(version).gameVersion;
  const presets = new Set<string>();
  for (const asset of assets) {
    const name = asset.name ?? '';
    const parts = name.split('.');
    const base = parts.length > 1 ? parts.slice(0, -1).join('.') : name;
    const tokens = base.split('-');
    // 'DoL-Thalia' splits into two tokens
    let i = 0;
    if (tokens[0] === 'DoL' && tokens[1] === 'Thalia') i = 2;
    else continue;
    if (tokens[i] === 'dolp') i += 1;
    if (tokens[i] === gameVersion) i += 1;
    else continue;
    // trailing -YYYY date token (if present)
    if (i < tokens.length && /^\d{4}$/.test(tokens[tokens.length - 1])) tokens.pop();
    const preset = tokens.slice(i).join('-');
    if (preset) presets.add(preset);
  }
  return Array.from(presets);
}

function parseReleaseEdition(version: string): { edition: 'standard' | 'dolp'; gameVersion: string } {
  const dolp = /^dolp-/i.test(version);
  const withoutDate = version.replace(/-\d{4}$/, '');
  const gameVersion = dolp ? withoutDate.replace(/^dolp-/i, '') : withoutDate;
  return { edition: dolp ? 'dolp' : 'standard', gameVersion };
}

async function ensureOnlinePlayHtml(config: ThaliaConfig): Promise<void> {
  if (existsSync(PLAY_INDEX)) {
    await splitHtmlAssets(PLAY_INDEX);
    return;
  }

  const sourceHtml = await runTimedStep(`Build ${config.game.version} vanilla source HTML`, () => resolveVanillaGameHtml(config));
  const siteConfig: ThaliaConfig = {
    ...config,
    paths: {
      ...config.paths,
      source_html: sourceHtml,
      output_html: PLAY_INDEX
    }
  };

  await prepareLocalBuild(siteConfig, {
    steps: ['sugarcube', 'modloader', 'story-format', 'modloader-tools', 'builtin-mods'],
    storyFormat: {
      i10nHook: false,
      modloaderHook: true
    }
  });
  await runTimedStep(`Build ${config.game.version} online play HTML`, () =>
    buildHtml(siteConfig, {
      embedIndexDBMods: false,
      minify: false,
      modloader: true
    })
  );
  await splitHtmlAssets(PLAY_INDEX);
}

async function writeJson(path: string, data: unknown): Promise<void> {
  const output = resolve(path);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, serializeSiteData(data), 'utf8');
}
