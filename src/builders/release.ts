import { rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { ThaliaConfig } from '../core/config';
import { formatSeconds, logDone, logWarn } from '../core/log';
import { runTimedStep } from '../core/steps';
import { readDefaultReleasePreset, readReleasePresets, type ReleasePreset } from '../release/presets';
import { discoverGameVersions, withGameVersion } from '../sources/game-input';
import { syncModSources } from '../sources/mod-sources';
import { syncGitRepo } from '../sources/vendor';
import { syncAndBuildBuiltinMods } from './builtin-mods';
import { buildHtml } from './html';
import { buildModLoaderTools } from './modloader';
import { apkBuildStatus, buildApk, buildPlayerZip } from './artifacts';
import { buildStoryFormat } from './story-format';

export type ReleaseTarget = 'html' | 'zip' | 'apk';

export interface BuildReleaseOptions {
  fast?: boolean;
  presets?: string[];
  skipModSources?: boolean;
  skipPrepare?: boolean;
  targets?: ReleaseTarget[];
  versions?: string[];
}

const ALL_RELEASE_TARGETS: ReleaseTarget[] = ['html', 'zip', 'apk'];

export async function buildRelease(config: ThaliaConfig, options: BuildReleaseOptions = {}): Promise<void> {
  const startedAt = Date.now();
  const versions = options.versions?.length ? options.versions : await discoverGameVersions(config);
  const presets = await readBuildPresets(config.game.default_mod_list, options.presets);
  const targets = new Set<ReleaseTarget>(options.targets?.length ? options.targets : ALL_RELEASE_TARGETS);
  const needsHtml = targets.has('html') || targets.has('zip') || targets.has('apk');

  // Shared toolchain work is done once; version/preset work happens inside the nested loop below.
  if (!isCI() && shouldCleanFullRelease(options)) await runTimedStep('Clean local release outputs', () => clean(config));
  if (!options.skipPrepare) {
    await runTimedStep('Sync SugarCube', () => syncGitRepo(config.upstreams.sugarcube_vrelnir));
    await runTimedStep('Sync ModLoader', () => syncGitRepo(config.upstreams.modloader));
    await runTimedStep('Build Story Format', () => buildStoryFormat(config));
    await runTimedStep('Build ModLoader tools', () => buildModLoaderTools(config));
    await runTimedStep('Build bundled ModLoader mods', () => syncAndBuildBuiltinMods(config));
  }

  for (const version of versions) {
    const versionConfig = withGameVersion(config, version);
    const apkStatus = targets.has('apk') ? apkBuildStatus() : undefined;

    for (const preset of presets) {
      // Mod source sync is preset-aware so optional packs are downloaded only when needed.
      if (!options.skipModSources) await runTimedStep(`Sync ${version} ${preset.name} mod sources`, () => syncModSources(versionConfig, preset.mods));
      if (needsHtml) await runTimedStep(`Build ${version} ${preset.name} HTML`, () => buildHtml(versionConfig, { minify: !options.fast, releasePreset: preset }));
      if (targets.has('zip')) await runTimedStep(`Build ${version} ${preset.name} ZIP`, () => buildPlayerZip(versionConfig, preset));

      if (apkStatus?.canBuild) {
        await runTimedStep(`Build ${version} ${preset.name} APK`, () => buildApk(versionConfig, preset));
      } else if (apkStatus) {
        logWarn(`Skip ${version} ${preset.name} APK: ${apkStatus.message}`);
      }
    }
  }

  logDone(`All done in ${formatSeconds(startedAt)}`);
}

async function readBuildPresets(defaultPresetName: string, selectedPresetNames?: string[]): Promise<ReleasePreset[]> {
  if (selectedPresetNames?.length) {
    const presets = await readReleasePresets();
    const selected = selectedPresetNames.map(name => {
      const preset = presets.find(item => item.name === name);
      if (!preset) throw new Error(`input/modList.json has no preset named: ${name}`);
      return preset;
    });
    return [...new Map(selected.map(preset => [preset.name, preset])).values()];
  }

  const defaultPreset = await readDefaultReleasePreset(defaultPresetName);
  const presets = (await readReleasePresets()).filter(preset => preset.name !== defaultPresetName);
  presets.push(defaultPreset);
  return presets;
}

function shouldCleanFullRelease(options: BuildReleaseOptions): boolean {
  return !options.versions?.length && !options.presets?.length && !options.targets?.length;
}

async function clean(config: ThaliaConfig): Promise<void> {
  await rm(dirname(resolve(config.paths.output_zip)), { recursive: true, force: true });
  await rm(resolve(config.paths.output_apk_dir), { recursive: true, force: true });
}

function isCI(): boolean {
  return Bun.env.CI === 'true' || Bun.env.GITHUB_ACTIONS === 'true';
}
