import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import type { ThaliaConfig } from '../core/config';
import { downloadFile, githubHeaders } from '../core/download';
import { logWarn } from '../core/log';

interface GitHubRelease {
  assets?: GitHubReleaseAsset[];
  tag_name?: string;
  draft?: boolean;
  prerelease?: boolean;
}

interface GitHubReleaseAsset {
  browser_download_url?: string;
  name?: string;
  size?: number;
  id?: number;
  url?: string;
  digest?: string;
  updated_at?: string;
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
    if (source.local_dir) {
      const directory = resolve(source.local_dir);
      const files = await readdir(directory);
      const extensions = source.asset_extensions || DEFAULT_ASSET_EXTENSIONS;
      for (const keyword of source.asset_keywords || [sourceName]) {
        const matches = files.filter(file => file.includes(keyword) && extensions.some(extension => file.endsWith(extension)));
        if (matches.length !== 1) throw new Error(`Expected one private resource for ${keyword}, found ${matches.length}`);
        const outputDir = resolve(config.paths.builtin_mods, config.game.version);
        await mkdir(outputDir, { recursive: true });
        await copyFile(join(directory, matches[0]), join(outputDir, matches[0]));
        await removeOlderAssetFiles(outputDir, keyword, matches, extensions);
      }
      continue;
    }
    if (source.asset_urls?.length) {
      await syncUrlAssets(config, sourceName, source.asset_urls);
      continue;
    }

    const keywords = source.asset_keywords?.length ? source.asset_keywords : [sourceName];
    const extensions = source.asset_extensions || DEFAULT_ASSET_EXTENSIONS;
    if (!source.repository && (await hasAllLocalAssets(config, keywords, extensions))) continue;

    // Variant builds may clear a source's repository (e.g. dolp_repository = "") to skip it.
    if (source.repository === '') {
      logWarn(`跳过 ${sourceName}：该变体未配置仓库。`);
      continue;
    }
    if (!source.repository) throw new Error(`Missing local mod asset for source: ${sourceName}`);

    const release = await fetchRelease(source.repository, source.release_tag || (await resolveReleaseTag(sourceName, source.repository, config)));
    const assets = keywords.map(keyword => selectAsset(release, keyword, extensions, config.game.version));
    for (const asset of assets) {
      const outputDir = resolve(config.paths.builtin_mods, config.game.version);
      await mkdir(outputDir, { recursive: true });
      await downloadAsset(asset, outputDir);
    }
    const keepNames = assets.map(asset => asset.name);
    for (const asset of assets)
      await removeOlderAssetFiles(resolve(config.paths.builtin_mods, config.game.version), asset.keyword, keepNames, [...new Set([...extensions, ...DEFAULT_ASSET_EXTENSIONS])]);
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

export async function requirePublishedLocalization(repository: string, gameVersion: string, releaseTag?: string): Promise<string> {
  const releases = releaseTag ? [await fetchRelease(repository, releaseTag)] : await fetchReleases(repository);
  const release = releases.find(item => !item.draft && !item.prerelease && item.tag_name?.startsWith(`v${gameVersion}-chs-`));
  if (!release?.tag_name) throw new Error(`Official localization ${gameVersion} has not been released. Internal local packages will not be used by build:ready.`);
  selectAsset(release, 'ModI18N', ['.mod.zip'], gameVersion);
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

function selectAsset(release: GitHubRelease, keyword: string, extensions: string[], gameVersion: string): SelectedAsset {
  const matches = filterAssets(release.assets || [], keyword, extensions);
  const versionMatches = matches.filter(asset => asset.name?.includes(gameVersion));
  const exactPrefix = versionMatches.filter(asset => asset.name?.startsWith(`${keyword}-${gameVersion}`));
  const candidates = exactPrefix.length > 0 ? exactPrefix : versionMatches.length > 0 ? versionMatches : matches;

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

async function removeOlderAssetFiles(outputDir: string, keyword: string, keepNames: string[], extensions: string[]): Promise<void> {
  if (!existsSync(outputDir)) return;
  const files = await readdir(outputDir);
  for (const file of files) {
    const sameKind = file.includes(keyword) && extensions.some(extension => file.toLowerCase().endsWith(extension.toLowerCase()));
    if (keepNames.includes(file) || !sameKind) continue;
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
  const metadata = `${output}.source.json`;
  const identity = JSON.stringify({ id: asset.id, updated_at: asset.updated_at, digest: asset.digest, url: asset.url || asset.browser_download_url });
  if (await hasSameSize(output, asset.size)) {
    if (asset.digest?.startsWith('sha256:')) {
      const digest = createHash('sha256')
        .update(await readFile(output))
        .digest('hex');
      if (`sha256:${digest}` === asset.digest) return;
    } else if (existsSync(metadata) && (await readFile(metadata, 'utf8')) === identity) return;
  }
  await downloadFile(asset.url || asset.browser_download_url, output, {
    githubAuth: true,
    headers: asset.url ? { Accept: 'application/octet-stream' } : {},
    label: asset.name
  });
  if (asset.digest?.startsWith('sha256:')) {
    const digest = createHash('sha256')
      .update(await readFile(output))
      .digest('hex');
    if (`sha256:${digest}` !== asset.digest) throw new Error(`Asset digest mismatch: ${asset.name}`);
  }
  await writeFile(metadata, identity);
}

async function hasSameSize(path: string, expectedSize: number | undefined): Promise<boolean> {
  if (!existsSync(path) || typeof expectedSize !== 'number') return false;
  return (await stat(path)).size === expectedSize;
}
