import { lstat, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { ThaliaConfig } from '../core/config';
import { buildReleaseAssetName, buildReleaseDate } from './utils';

export async function verifyReleaseAssets(config: ThaliaConfig, presets: string[]): Promise<string[]> {
  if (!presets.length || new Set(presets).size !== presets.length) throw new Error('Release presets must be nonempty and unique');
  const date = buildReleaseDate(config.game.release_date ?? config.game.version);
  const assets: string[] = [];
  for (const [extension, directory] of [
    ['zip', dirname(config.paths.output_zip)],
    ['apk', config.paths.output_apk_dir]
  ]) {
    const root = resolve(directory);
    const expected = presets.map(preset => `${buildReleaseAssetName(config.project.name, config.game.version, preset, date)}.${extension}`);
    const actual = (await readdir(root)).filter(name => /\.(?:zip|apk)$/.test(name));
    const missing = expected.filter(name => !actual.includes(name));
    const unexpected = actual.filter(name => !expected.includes(name));
    if (missing.length || unexpected.length) throw new Error(`Invalid ${extension} release assets; missing: ${missing.join(', ')}; unexpected: ${unexpected.join(', ')}`);
    for (const name of expected) {
      const path = join(root, name);
      const file = await lstat(path);
      if (!file.isFile() || file.size === 0) throw new Error(`Empty or invalid release asset: ${path}`);
      assets.push(path);
    }
  }
  return assets;
}
