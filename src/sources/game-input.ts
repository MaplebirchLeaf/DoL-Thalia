import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import type { ThaliaConfig } from '../core/config';

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
  const versions = new Set<string>();
  for (const file of await readdir(dir)) {
    if (extname(file).toLowerCase() !== extension) continue;
    const version = extractGameVersion(file);
    if (version) versions.add(version);
  }
  const result = [...versions].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (result.length === 0) throw new Error(`Game input directory has no versioned ${extension} file: ${dir}`);
  return result;
}

export function withGameVersion(config: ThaliaConfig, version: string): ThaliaConfig {
  return {
    ...config,
    game: {
      ...config.game,
      version
    }
  };
}

function extractGameVersion(value: string): string | undefined {
  return value.match(VERSION_PATTERN)?.[0];
}
