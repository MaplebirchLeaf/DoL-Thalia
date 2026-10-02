import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ThaliaConfig } from '../core/config';
import { downloadFile, fetchOk } from '../core/download';

interface ReleaseLink {
  name: string;
  url: string;
  direct_asset_url?: string;
}

export function selectDoLPVanilla(links: ReleaseLink[]): string {
  const candidates = links.filter(link => link.name === 'DoLP_Vanilla');
  if (candidates.length !== 1) throw new Error(`Expected one DoLP_Vanilla asset, found ${candidates.length}`);
  const url = candidates[0].direct_asset_url || candidates[0].url;
  if (!url.startsWith('https://') || !new URL(url).pathname.endsWith('.zip')) throw new Error('Invalid DoLP_Vanilla ZIP URL');
  return url;
}

export async function resolveDoLPGameZip(config: ThaliaConfig): Promise<string> {
  const repository = config.game.release_repository;
  if (!repository) throw new Error('DoLP release repository is not configured');
  const version = config.game.version;
  const output = join(resolve('.cache/game/dolp', version), `DoLP_Vanilla_v${version}.zip`);
  if (existsSync(output)) return output;
  const url = `https://gitgud.io/api/v4/projects/${encodeURIComponent(repository)}/releases/${encodeURIComponent(`v${version}`)}`;
  const response = await fetchOk(url, { label: `DoLP ${version} release` });
  const release = (await response.json()) as { tag_name: string; assets: { links: ReleaseLink[] } };
  if (release.tag_name !== `v${version}`) throw new Error('DoLP release version does not match requested version');
  await downloadFile(selectDoLPVanilla(release.assets.links), output);
  return output;
}
