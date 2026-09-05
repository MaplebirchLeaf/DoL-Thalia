import type { BuildHtmlOptions } from '../builders/html';
import { LOCAL_PREPARE_STEPS, parseSimplePrepareOptions, VANILLA_PREPARE_STEPS, type PrepareLocalBuildOptions, type PrepareStep } from '../builders/prepare';
import { readOption } from '../core/args';

export interface BuildHtmlCommandOptions {
  html: BuildHtmlOptions;
  prepare: PrepareLocalBuildOptions | 'skip';
  prepareExplicit: boolean;
  /** Game-lineage variant name (see [games.*] in thalia.config.toml); default standard. */
  game?: string;
  preset?: string;
  version?: string;
}

const HTML_PREPARE_STEPS = LOCAL_PREPARE_STEPS;

export function parseBuildHtmlCommandOptions(args: string[], htmlDefaults: BuildHtmlOptions = {}, prepareDefaults?: PrepareStep[]): BuildHtmlCommandOptions {
  let prepare = parseSimplePrepareOptions(args);
  const prepareExplicit = args.some(arg => arg.startsWith('--prepare='));
  const html: BuildHtmlOptions = { ...htmlDefaults };
  const game = readOption(args, ['--game=']);
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

  return { html, prepare, prepareExplicit, game, preset, version };
}

export function parseReleaseHtmlCommandOptions(args: string[]): BuildHtmlCommandOptions {
  return parseBuildHtmlCommandOptions(args, {}, HTML_PREPARE_STEPS);
}

export function parseLocalBuildCommandOptions(args: string[]): BuildHtmlCommandOptions {
  return parseBuildHtmlCommandOptions(args, { embedIndexDBMods: false }, LOCAL_PREPARE_STEPS);
}
