import type { ThaliaConfig } from '../core/config';
import { runStep } from '../core/steps';
import { syncModSources } from '../sources/mod-sources';
import { syncGitRepo } from '../sources/vendor';
import { syncAndBuildBuiltinMods } from './builtin-mods';
import { buildModLoaderTools } from './modloader';
import { buildStoryFormat, type BuildStoryFormatOptions } from './story-format';

export type PrepareStep = 'sugarcube' | 'modloader' | 'mod-sources' | 'story-format' | 'modloader-tools' | 'builtin-mods';

export interface PrepareLocalBuildOptions {
  steps?: PrepareStep[];
  storyFormat?: BuildStoryFormatOptions;
}

const DEFAULT_PREPARE_STEPS: PrepareStep[] = ['sugarcube', 'modloader', 'mod-sources', 'story-format', 'modloader-tools', 'builtin-mods'];

// Prepares the current configured version for local builds without producing release ZIP/APK files.
export async function prepareLocalBuild(config: ThaliaConfig, options: PrepareLocalBuildOptions = {}): Promise<void> {
  const selectedSteps = new Set<PrepareStep>(options.steps ?? DEFAULT_PREPARE_STEPS);

  if (selectedSteps.has('sugarcube')) await runStep('Sync SugarCube', () => syncGitRepo(config.upstreams.sugarcube_vrelnir));
  if (selectedSteps.has('modloader')) await runStep('Sync ModLoader', () => syncGitRepo(config.upstreams.modloader));
  if (selectedSteps.has('mod-sources')) await runStep(`Sync ${config.game.version} mod sources`, () => syncModSources(config));
  if (selectedSteps.has('story-format')) await runStep('Build Story Format', () => buildStoryFormat(config, options.storyFormat));
  if (selectedSteps.has('modloader-tools')) await runStep('Build ModLoader tools', () => buildModLoaderTools(config));
  if (selectedSteps.has('builtin-mods')) await runStep('Build bundled ModLoader mods', () => syncAndBuildBuiltinMods(config));
}

export function parseSimplePrepareOptions(args: string[]): PrepareLocalBuildOptions | 'skip' {
  if (args.includes('--skip-prepare')) return 'skip';

  const prepareArg = args.find(arg => arg.startsWith('--prepare='));
  if (!prepareArg) return {};

  const stepsValue = prepareArg.slice('--prepare='.length);
  if (stepsValue === '') return {};

  const steps = stepsValue
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  for (const step of steps) if (!DEFAULT_PREPARE_STEPS.includes(step as PrepareStep)) throw new Error(`Unknown prepare step: ${step}. Available steps: ${DEFAULT_PREPARE_STEPS.join(', ')}`);

  return { steps: steps as PrepareStep[] };
}
