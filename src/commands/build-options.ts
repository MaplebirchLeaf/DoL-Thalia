import type { BuildHtmlOptions } from '../builders/html';
import { parseSimplePrepareOptions, type PrepareLocalBuildOptions, type PrepareStep } from '../builders/prepare';

export interface BuildHtmlCommandOptions {
  html: BuildHtmlOptions;
  prepare: PrepareLocalBuildOptions | 'skip';
  prepareExplicit: boolean;
  preset?: string;
  version?: string;
}

const VANILLA_PREPARE_STEPS: PrepareStep[] = ['sugarcube', 'modloader', 'story-format', 'modloader-tools'];
const LOCAL_PREPARE_STEPS: PrepareStep[] = ['sugarcube', 'modloader', 'story-format', 'modloader-tools', 'builtin-mods'];
const HTML_PREPARE_STEPS: PrepareStep[] = LOCAL_PREPARE_STEPS;

export function parseBuildHtmlCommandOptions(args: string[], htmlDefaults: BuildHtmlOptions = {}, prepareDefaults?: PrepareStep[]): BuildHtmlCommandOptions {
  let prepare = parseSimplePrepareOptions(args);
  const prepareExplicit = args.some(arg => arg.startsWith('--prepare='));
  const html: BuildHtmlOptions = { ...htmlDefaults };
  const preset = readOption(args, ['--preset=', '--config=']);
  const version = readOption(args, ['--version=']);
  if (args.includes('--fast')) html.minify = false;

  if (prepare !== 'skip' && prepareDefaults && !prepare.steps) prepare = { ...prepare, steps: prepareDefaults };

  if (args.includes('--pure') || args.includes('--vanilla')) {
    html.embedIndexDBMods = false;
    html.modloader = false;
    if (prepare !== 'skip') {
      prepare = {
        steps: VANILLA_PREPARE_STEPS,
        storyFormat: {
          i10nHook: false,
          modloaderHook: false
        }
      };
    }
  }

  return { html, prepare, prepareExplicit, preset, version };
}

export function parseReleaseHtmlCommandOptions(args: string[]): BuildHtmlCommandOptions {
  return parseBuildHtmlCommandOptions(args, {}, HTML_PREPARE_STEPS);
}

export function parseLocalBuildCommandOptions(args: string[]): BuildHtmlCommandOptions {
  return parseBuildHtmlCommandOptions(args, { embedIndexDBMods: false }, LOCAL_PREPARE_STEPS);
}

function readOption(args: string[], names: string[]): string | undefined {
  const arg = args.find(value => names.some(name => value.startsWith(name)));
  if (!arg) return undefined;
  const name = names.find(item => arg.startsWith(item));
  const value = name ? arg.slice(name.length).trim() : '';
  return value || undefined;
}
