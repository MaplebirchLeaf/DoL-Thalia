import { syncAndBuildBuiltinMods } from '../builtin-mods';
import { loadConfig } from '../config';
import { discoverGameVersions, withGameVersion } from '../game-input';
import { buildHtml } from '../html';
import { logDone, logStep } from '../log';
import { buildModLoaderTools } from '../modloader';
import { syncModSources } from '../mod-sources';
import { syncOnlinePlay } from '../play';
import { readDefaultReleasePreset } from '../release-presets';
import { buildStoryFormat } from '../story-format';
import { syncGitRepo } from '../vendor';

const config = await loadConfig();
const versions = await discoverGameVersions(config);
const latestVersion = versions.at(-1);
if (!latestVersion) throw new Error('No game version found for online play.');

const versionConfig = withGameVersion(config, latestVersion);
const defaultPreset = await readDefaultReleasePreset(config.game.default_mod_list);

await step('同步默认在线版模组源', () => syncModSources(versionConfig, defaultPreset.mods));
await step('同步 SugarCube', () => syncGitRepo(config.upstreams.sugarcube_vrelnir));
await step('同步 ModLoader', () => syncGitRepo(config.upstreams.modloader));
await step('构建 Story Format', () => buildStoryFormat(config));
await step('构建 ModLoader 工具', () => buildModLoaderTools(config));
await step('构建内置模组包', () => syncAndBuildBuiltinMods(config));
await step(`生成 ${latestVersion} 默认在线版`, () => buildHtml(versionConfig, defaultPreset));
await step('同步在线版资源', () => syncOnlinePlay(versionConfig));

async function step(name: string, action: () => Promise<void>): Promise<void> {
  logStep(name);
  await action();
  logDone('完成');
}
