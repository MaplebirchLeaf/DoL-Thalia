import type { ThaliaConfig } from './config';
import { buildHtml } from './html';
import { syncAndBuildBuiltinMods } from './builtin-mods';
import { buildModLoaderTools } from './modloader';
import { buildApk, buildPlayerZip, apkBuildStatus } from './package';
import { buildStoryFormat } from './story-format';
import { syncGitRepo } from './vendor';
import { formatSeconds, logDone, logStep, logWarn } from './log';
import { discoverGameVersions, withGameVersion } from './game-input';
import { readDefaultReleasePreset, readReleasePresets, type ReleasePreset } from './release-presets';

export async function buildRelease(config: ThaliaConfig): Promise<void> {
  const startedAt = Date.now();
  const versions = await discoverGameVersions(config);
  const presets = await readBuildPresets(config.game.default_mod_list);
  await step('同步 SugarCube', () => syncGitRepo(config.upstreams.sugarcube_vrelnir));
  await step('同步 ModLoader', () => syncGitRepo(config.upstreams.modloader));
  await step('构建 Story Format', () => buildStoryFormat(config));
  await step('构建 ModLoader 工具', () => buildModLoaderTools(config));
  await step('构建内置模组包', () => syncAndBuildBuiltinMods(config));
  for (const version of versions) {
    const versionConfig = withGameVersion(config, version);
    const apkStatus = apkBuildStatus();
    for (const preset of presets) {
      await step(`生成 ${version} ${preset.name} HTML 游玩目录`, () => buildHtml(versionConfig, preset));
      await step(`生成 ${version} ${preset.name} ZIP 游玩包`, () => buildPlayerZip(versionConfig, preset));
      if (apkStatus.canBuild) {
        await step(`生成 ${version} ${preset.name} APK 游玩包`, () => buildApk(versionConfig, preset));
      } else {
        logWarn(`跳过 ${version} ${preset.name} APK：${apkStatus.message}`);
      }
    }
  }
  logDone(`全部完成，用时 ${formatSeconds(startedAt)}`);
}

async function readBuildPresets(defaultPresetName: string): Promise<ReleasePreset[]> {
  const defaultPreset = await readDefaultReleasePreset(defaultPresetName);
  const presets = (await readReleasePresets()).filter(preset => preset.name !== defaultPresetName);
  presets.push(defaultPreset);
  return presets;
}

async function step(name: string, action: () => Promise<void>): Promise<void> {
  const startedAt = Date.now();
  logStep(name);
  await action();
  logDone(`完成，用时 ${formatSeconds(startedAt)}`);
}
