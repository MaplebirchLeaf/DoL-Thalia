import { existsSync } from 'node:fs';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { ThaliaConfig } from './config';
import { logDone, logInfo, logWarn } from './log';

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

export async function syncModSources(config: ThaliaConfig): Promise<void> {
  const sources = Object.entries(config.mod_sources || {});
  if (sources.length === 0) {
    logWarn('没有配置 mod_sources，跳过模组源同步。');
    return;
  }

  for (const [sourceName, source] of sources) {
    const extensions = source.asset_extensions || DEFAULT_ASSET_EXTENSIONS;
    if (await hasAllLocalAssets(config, source.asset_keywords, extensions)) {
      logDone(`本地模组源已就绪：${sourceName}`);
      continue;
    }
    const release = await fetchRelease(source.repository, source.release_tag || (await resolveReleaseTag(sourceName, source.repository, config)));
    const assets = source.asset_keywords.map(keyword => selectAsset(release, keyword, extensions, config.game.version));
    for (const asset of assets) {
      const outputDir = resolve(config.paths.builtin_mods, config.game.version, asset.keyword);
      await mkdir(outputDir, { recursive: true });
      if (await hasLocalAsset(outputDir, asset.keyword, extensions, config.game.version)) {
        logDone(`已存在：${asset.keyword}`);
        continue;
      }
      await removeOlderAssetFiles(outputDir, asset.keyword, asset.name, extensions);
      await downloadAsset(asset, outputDir);
    }
  }
}

async function hasAllLocalAssets(config: ThaliaConfig, keywords: string[], extensions: string[]): Promise<boolean> {
  for (const keyword of keywords) {
    const outputDir = resolve(config.paths.builtin_mods, config.game.version, keyword);
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
  logInfo(`查找 GitHub Release：${repository}`);
  const response = await fetch(url, {
    headers: githubHeaders()
  });
  if (!response.ok) throw new Error(`读取 GitHub Releases 失败（${response.status}）：${url}`);
  return (await response.json()) as GitHubRelease[];
}

async function fetchRelease(repository: string, tag: string | undefined): Promise<GitHubRelease> {
  const endpoint = tag ? `releases/tags/${encodeURIComponent(tag)}` : 'releases/latest';
  const url = `https://api.github.com/repos/${repository}/${endpoint}`;
  logInfo(`读取 GitHub Release：${repository}${tag ? `@${tag}` : '@latest'}`);
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
    const matchesVersion = file.includes(gameVersion);
    const matchesExtension = extensions.some(extension => file.toLowerCase().endsWith(extension.toLowerCase()));
    return matchesKeyword && matchesVersion && matchesExtension;
  });
}

async function downloadAsset(asset: SelectedAsset, outputDir: string): Promise<void> {
  const output = join(outputDir, asset.name);
  if (await hasSameSize(output, asset.size)) {
    logDone(`已存在：${asset.name}`);
    return;
  }

  logInfo(`下载：${asset.name}`);
  await downloadFile(asset.browser_download_url, output);
  logDone(`已保存：${output}`);
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
