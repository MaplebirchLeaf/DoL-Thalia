import { extname } from 'node:path';
import type { ThaliaConfig } from '../core/config';
import type { BuildStoryFormatOptions } from './story-format';

export function withStoryFormatConfig(config: ThaliaConfig, options: BuildStoryFormatOptions = {}): ThaliaConfig {
  const extension = extname(config.paths.story_format);
  const stem = extension ? config.paths.story_format.slice(0, -extension.length) : config.paths.story_format;
  const hooks = options.modloaderHook === false ? 'plain' : 'modloader';
  const language = options.i10nHook === true ? 'chs' : 'en';
  return { ...config, paths: { ...config.paths, story_format: `${stem}.${hooks}.${language}${extension}` } };
}
