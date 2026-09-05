import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import type { ThaliaConfig } from '../core/config';
import { parseReleaseVersion } from '../release/utils';

const VERSION_PATTERN = /\b\d+\.\d+\.\d+\.\d+\b/;

export async function discoverGameVersions(config: ThaliaConfig): Promise<string[]> {
  const pattern = config.paths.source_html;
  if (!pattern.includes('*')) {
    const version = extractGameVersion(pattern);
    if (!version) throw new Error(`Game input file name has no version: ${pattern}`);
    return [version];
  }

  const extension = extname(pattern).toLowerCase();
  const dir = resolve(pattern.slice(0, -`*${extension}`.length));
  if (!existsSync(dir)) throw new Error(`Game input directory does not exist: ${dir}`);
  const files = (await readdir(dir)).filter(file => extname(file).toLowerCase() === extension);
  const versions = new Set<string>();
  for (const file of files) {
    const version = extractGameVersion(file);
    if (version) versions.add(version);
  }
  const result = [...versions].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (result.length === 0) {
    // Variant versions may not be four-part (e.g. DoLP 0.775): fall back to the configured
    // game.version when a matching file exists in the source directory.
    const fallback = config.game.version?.trim();
    if (fallback && files.some(file => file.includes(fallback))) return [fallback];
    throw new Error(`Game input directory has no versioned ${extension} file: ${dir}`);
  }
  return result;
}

export function withGameVersion(config: ThaliaConfig, version: string): ThaliaConfig {
  const releaseVersion = parseReleaseVersion(version);
  return {
    ...config,
    game: {
      ...config.game,
      release_date: releaseVersion.releaseDate,
      version: releaseVersion.gameVersion
    }
  };
}

function extractGameVersion(value: string): string | undefined {
  return value.match(VERSION_PATTERN)?.[0];
}
