import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import * as TOML from '@iarna/toml';

export interface UpstreamConfig {
  url: string;
  ref: string;
  path: string;
}

export interface ThaliaConfig {
  project: {
    name: string;
  };

  game: {
    default_mod_list: string;
    version: string;
  };

  mod_sources?: Record<
    string,
    {
      asset_extensions?: string[];
      asset_keywords?: string[];
      asset_urls?: string[];
      release_tag?: string;
      repository?: string;
    }
  >;

  upstreams: {
    sugarcube_vrelnir: UpstreamConfig;
    modloader: UpstreamConfig;
  };

  paths: {
    source_html: string;
    builtin_mods: string;
    output_html: string;
    output_zip: string;
    output_apk_dir: string;
    story_format: string;
    cordova_project: string;
  };

  apk: {
    id: string;
    name: string;
  };
}

export async function loadConfig(configPath = 'thalia.config.toml'): Promise<ThaliaConfig> {
  const fullPath = resolve(configPath);
  if (!existsSync(fullPath)) throw new Error(`Config file not found: ${fullPath}`);
  const content = await Bun.file(fullPath).text();
  const config = TOML.parse(content) as unknown as ThaliaConfig;
  validateConfig(config);
  return config;
}

function validateConfig(config: ThaliaConfig): void {
  required(config.project?.name, 'project.name');

  required(config.game?.default_mod_list, 'game.default_mod_list');

  required(config.upstreams?.sugarcube_vrelnir?.url, 'upstreams.sugarcube_vrelnir.url');
  required(config.upstreams?.sugarcube_vrelnir?.ref, 'upstreams.sugarcube_vrelnir.ref');
  required(config.upstreams?.sugarcube_vrelnir?.path, 'upstreams.sugarcube_vrelnir.path');

  required(config.upstreams?.modloader?.url, 'upstreams.modloader.url');
  required(config.upstreams?.modloader?.ref, 'upstreams.modloader.ref');
  required(config.upstreams?.modloader?.path, 'upstreams.modloader.path');

  required(config.paths?.source_html, 'paths.source_html');
  required(config.paths?.builtin_mods, 'paths.builtin_mods');
  required(config.paths?.output_html, 'paths.output_html');
  required(config.paths?.output_zip, 'paths.output_zip');
  required(config.paths?.output_apk_dir, 'paths.output_apk_dir');
  required(config.paths?.story_format, 'paths.story_format');
  required(config.paths?.cordova_project, 'paths.cordova_project');

  required(config.apk?.id, 'apk.id');
  required(config.apk?.name, 'apk.name');

  for (const [name, source] of Object.entries(config.mod_sources || {})) {
    const hasReleaseSource = typeof source.repository === 'string' && source.repository.trim() !== '';
    const hasUrlSource = Array.isArray(source.asset_urls) && source.asset_urls.length > 0;
    if (!hasReleaseSource && !hasUrlSource) throw new Error(`Missing required config field: mod_sources.${name}.repository or mod_sources.${name}.asset_urls`);
    if (hasReleaseSource && (!Array.isArray(source.asset_keywords) || source.asset_keywords.length === 0 || !source.asset_keywords.every(item => typeof item === 'string' && item.trim() !== ''))) {
      throw new Error(`Missing required config field: mod_sources.${name}.asset_keywords`);
    }
    if (source.asset_urls && !source.asset_urls.every(item => typeof item === 'string' && /^https?:\/\//i.test(item))) throw new Error(`Invalid config field: mod_sources.${name}.asset_urls`);
    if (source.asset_extensions && (!Array.isArray(source.asset_extensions) || !source.asset_extensions.every(item => typeof item === 'string' && item.startsWith('.')))) {
      throw new Error(`Invalid config field: mod_sources.${name}.asset_extensions`);
    }
  }
}

function required(value: unknown, name: string): void {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`Missing required config field: ${name}`);
}
