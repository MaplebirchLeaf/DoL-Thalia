import { VANILLA_PREPARE_STEPS, type PrepareLocalBuildOptions, type PrepareStep } from '../builders/prepare';
import type { BuildStoryFormatOptions } from '../builders/story-format';

const STEP_ALIASES: Record<string, PrepareStep> = {
  sugarcube: 'sugarcube',
  'sync-sugarcube': 'sugarcube',
  modloader: 'modloader',
  'sync-modloader': 'modloader',
  mods: 'mod-sources',
  'mod-sources': 'mod-sources',
  'sync-mods': 'mod-sources',
  story: 'story-format',
  'story-format': 'story-format',
  'build-story-format': 'story-format',
  tools: 'modloader-tools',
  'modloader-tools': 'modloader-tools',
  'build-modloader-tools': 'modloader-tools',
  builtin: 'builtin-mods',
  'builtin-mods': 'builtin-mods',
  'build-builtin-mods': 'builtin-mods'
};

export function parsePrepareOptions(args: string[]): PrepareLocalBuildOptions {
  const steps: PrepareStep[] = [];
  const storyFormat: BuildStoryFormatOptions = {};

  for (const arg of args) {
    if (arg === 'all') return { storyFormat };
    if (arg === 'pure' || arg === 'vanilla') {
      return {
        steps: VANILLA_PREPARE_STEPS,
        storyFormat: {
          i10nHook: false,
          modloaderHook: false
        }
      };
    }

    const step = STEP_ALIASES[arg];
    if (step) {
      steps.push(step);
      continue;
    }

    switch (arg) {
      case '--no-modloader':
        storyFormat.modloaderHook = false;
        break;
      case '--no-i10n':
        storyFormat.i10nHook = false;
        break;
      case '--modloader-only':
        storyFormat.modloaderHook = true;
        storyFormat.i10nHook = false;
        break;
      case '--i10n-only':
        storyFormat.modloaderHook = false;
        storyFormat.i10nHook = true;
        break;
      case '--plain':
        storyFormat.modloaderHook = false;
        storyFormat.i10nHook = false;
        break;
      default:
        throw new Error(`Unknown prepare argument: ${arg}`);
    }
  }

  return {
    steps: steps.length > 0 ? [...new Set(steps)] : undefined,
    storyFormat
  };
}
