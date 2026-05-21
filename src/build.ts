import type { ThaliaConfig } from './config';
import { buildHtml } from './html';
import { buildModLoaderLocalMods, buildModLoaderTools } from './modloader';
import { buildApk, buildPlayerZip, apkBuildStatus } from './package';
import { buildStoryFormat } from './story-format';
import { syncGitRepo } from './vendor';
import { formatSeconds, logDone, logStep, logWarn } from './log';

export async function buildRelease(config: ThaliaConfig): Promise<void> {
  const startedAt = Date.now();
  await step('同步 SugarCube', () => syncGitRepo(config.upstreams.sugarcube_vrelnir));
  await step('同步 ModLoader', () => syncGitRepo(config.upstreams.modloader));
  await step('构建 Story Format', () => buildStoryFormat(config));
  await step('构建 ModLoader 工具', () => buildModLoaderTools(config));
  await step('检查内置模组包', () => buildModLoaderLocalMods(config));
  await step('生成 HTML 游玩目录', () => buildHtml(config));
  await step('生成 ZIP 游玩包', () => buildPlayerZip(config));
  const apkStatus = apkBuildStatus();
  if (apkStatus.canBuild) {
    await step('生成 APK 游玩包', () => buildApk(config));
  } else {
    logWarn(`跳过 APK：${apkStatus.message}`);
  }
  logDone(`全部完成，用时 ${formatSeconds(startedAt)}`);
}

async function step(name: string, action: () => Promise<void>): Promise<void> {
  const startedAt = Date.now();
  logStep(name);
  await action();
  logDone(`完成，用时 ${formatSeconds(startedAt)}`);
}
