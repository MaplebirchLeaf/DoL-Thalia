import { existsSync } from 'node:fs';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import type { ThaliaConfig } from '../core/config';
import { logWarn } from '../core/log';

interface GitHubRelease {
  assets?: GitHubReleaseAsset[];
  tag_name?: string;
}

interface GitHubReleaseAsset {
  browser_download_url?: string;
  name?: string;
  size?: number;
}

interface SelectedAsset extends GitHubReleaseAsset {
  browser_download_url: string;
  keyword: string;
  name: string;
}

const DEFAULT_ASSET_EXTENSIONS = ['.mod.zip', '.modpack'];
const VERSION_PATTERN = /\d+\.\d+\.\d+\.\d+/;

export async function syncModSources(config: ThaliaConfig, requiredMods?: string[]): Promise<void> {
  const sources = Object.entries(config.mod_sources || {}).filter(([sourceName, source]) => shouldSyncSource(sourceName, source.asset_keywords, requiredMods));
  if (sources.length === 0) {
    logWarn('没有配置 mod_sources，跳过模组源同步。');
    return;
  }

  for (const [sourceName, source] of sources) {
    if (source.asset_urls?.length) {
      await syncUrlAssets(config, sourceName, source.asset_urls);
      continue;
    }

    const keywords = source.asset_keywords?.length ? source.asset_keywords : [sourceName];
    const extensions = source.asset_extensions || DEFAULT_ASSET_EXTENSIONS;
    if (await hasAllLocalAssets(config, keywords, extensions)) continue;

    if (!source.repository) throw new Error(`Missing local mod asset for source: ${sourceName}`);

    const release = await fetchRelease(source.repository, source.release_tag || (await resolveReleaseTag(sourceName, source.repository, config)));
    const assets = keywords.map(keyword => selectAsset(release, keyword, extensions, config.game.version));
    for (const asset of assets) {
      const outputDir = resolve(config.paths.builtin_mods, config.game.version);
      await mkdir(outputDir, { recursive: true });
      if (await hasLocalAsset(outputDir, asset.keyword, extensions, config.game.version)) continue;
      await removeOlderAssetFiles(outputDir, asset.keyword, asset.name, extensions);
      await downloadAsset(asset, outputDir);
    }
  }
}

function shouldSyncSource(sourceName: string, assetKeywords: string[] | undefined, requiredMods: string[] | undefined): boolean {
  if (!requiredMods) return true;
  const sourceKeys = [sourceName, ...(assetKeywords || [])];
  return sourceKeys.some(sourceKey => requiredMods.some(requiredMod => sourceKey.includes(requiredMod) || requiredMod.includes(sourceKey)));
}

async function syncUrlAssets(config: ThaliaConfig, sourceName: string, urls: string[]): Promise<void> {
  const outputDir = resolve(config.paths.builtin_mods, config.game.version);
  await mkdir(outputDir, { recursive: true });
  for (const url of urls) {
    const fileName = fileNameFromUrl(url);
    const output = join(outputDir, fileName);
    if (existsSync(output)) continue;
    await downloadFile(url, output);
  }
}

function fileNameFromUrl(url: string): string {
  const fileName = basename(decodeURIComponent(new URL(url).pathname));
  if (!fileName) throw new Error(`Cannot infer file name from URL: ${url}`);
  return fileName;
}

async function hasAllLocalAssets(config: ThaliaConfig, keywords: string[], extensions: string[]): Promise<boolean> {
  for (const keyword of keywords) {
    const outputDir = resolve(config.paths.builtin_mods, config.game.version);
    if (!(await hasLocalAsset(outputDir, keyword, extensions, config.game.version))) return false;
  }
  return true;
}

async function resolveReleaseTag(sourceName: string, repository: string, config: ThaliaConfig): Promise<string | undefined> {
  if (sourceName === 'chinese-localization') return findChineseLocalizationReleaseTag(repository, config.game.version);
  return undefined;
}

async function findChineseLocalizationReleaseTag(repository: string, gameVersion: string): Promise<string> {
  const releases = await fetchReleases(repository);
  const prefix = `v${gameVersion}-chs-`;
  const release = releases.find(item => item.tag_name?.startsWith(prefix));
  if (!release?.tag_name) throw new Error(`找不到匹配汉化 Release：${repository}@${prefix}*`);
  return release.tag_name;
}

async function fetchReleases(repository: string): Promise<GitHubRelease[]> {
  const url = `https://api.github.com/repos/${repository}/releases?per_page=50`;
  const response = await fetch(url, {
    headers: githubHeaders()
  });
  if (!response.ok) throw new Error(`读取 GitHub Releases 失败（${response.status}）：${url}`);
  return (await response.json()) as GitHubRelease[];
}

async function fetchRelease(repository: string, tag: string | undefined): Promise<GitHubRelease> {
  const endpoint = tag ? `releases/tags/${encodeURIComponent(tag)}` : 'releases/latest';
  const url = `https://api.github.com/repos/${repository}/${endpoint}`;
  const response = await fetch(url, {
    headers: githubHeaders()
  });
  if (!response.ok) throw new Error(`读取 GitHub Release 失败（${response.status}）：${url}`);
  return (await response.json()) as GitHubRelease;
}

function githubHeaders(): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    ...(Bun.env.GITHUB_TOKEN ? { Authorization: `Bearer ${Bun.env.GITHUB_TOKEN}` } : {}),
    'User-Agent': 'DoL-Thalia'
  };
}

function selectAsset(release: GitHubRelease, keyword: string, extensions: string[], gameVersion: string): SelectedAsset {
  const matches = filterAssets(release.assets || [], keyword, extensions);
  const versionMatches = matches.filter(asset => asset.name?.includes(gameVersion));
  const candidates = versionMatches.length > 0 ? versionMatches : matches;

  if (candidates.length === 0) throw new Error(`Release 缺少资产：${keyword} (${extensions.join(', ')})`);
  if (candidates.length > 1) throw new Error(`Release 中 ${keyword} 匹配到多个资产：${candidates.map(asset => asset.name).join(', ')}`);

  const asset = candidates[0];
  if (!asset.name || !asset.browser_download_url) throw new Error(`Release 资产缺少下载链接：${keyword}`);
  return {
    ...asset,
    browser_download_url: asset.browser_download_url,
    keyword,
    name: asset.name
  };
}

function filterAssets(assets: GitHubReleaseAsset[], keyword: string, extensions: string[]): GitHubReleaseAsset[] {
  return assets
    .filter(asset => asset.name?.includes(keyword))
    .filter(asset => extensions.some(extension => asset.name?.toLowerCase().endsWith(extension.toLowerCase())))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));
}

async function removeOlderAssetFiles(outputDir: string, keyword: string, keepName: string, extensions: string[]): Promise<void> {
  if (!existsSync(outputDir)) return;
  const files = await readdir(outputDir);
  for (const file of files) {
    const sameKind = file.includes(keyword) && extensions.some(extension => file.toLowerCase().endsWith(extension.toLowerCase()));
    if (file === keepName || !sameKind) continue;
    await rm(join(outputDir, file), { force: true });
  }
}

async function hasLocalAsset(outputDir: string, keyword: string, extensions: string[], gameVersion: string): Promise<boolean> {
  if (!existsSync(outputDir)) return false;
  const files = await readdir(outputDir);
  return files.some(file => {
    const matchesKeyword = file.includes(keyword);
    const matchesVersion = file.includes(gameVersion) || !VERSION_PATTERN.test(file);
    const matchesExtension = extensions.some(extension => file.toLowerCase().endsWith(extension.toLowerCase()));
    return matchesKeyword && matchesVersion && matchesExtension;
  });
}

async function downloadAsset(asset: SelectedAsset, outputDir: string): Promise<void> {
  const output = join(outputDir, asset.name);
  if (await hasSameSize(output, asset.size)) return;

  await downloadFile(asset.browser_download_url, output);
}

async function downloadFile(url: string, output: string): Promise<void> {
  const response = await fetch(url, {
    headers: Bun.env.GITHUB_TOKEN ? { Authorization: `Bearer ${Bun.env.GITHUB_TOKEN}` } : undefined
  });
  if (!response.ok) throw new Error(`下载失败（${response.status}）：${url}`);
  await writeFile(output, new Uint8Array(await response.arrayBuffer()));
}

async function hasSameSize(path: string, expectedSize: number | undefined): Promise<boolean> {
  if (!existsSync(path) || typeof expectedSize !== 'number') return false;
  return (await stat(path)).size === expectedSize;
}
