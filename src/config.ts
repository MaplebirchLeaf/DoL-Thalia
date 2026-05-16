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
    version: string;
  };

  upstreams: {
    sugarcube_vrelnir: UpstreamConfig;
    modloader: UpstreamConfig;
  };

  paths: {
    source_html: string;
    builtin_mods: string;
    output_html: string;
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

  if (!existsSync(fullPath)) {
    throw new Error(`Config file not found: ${fullPath}`);
  }

  const content = await Bun.file(fullPath).text();
  const config = TOML.parse(content) as unknown as ThaliaConfig;

  validateConfig(config);

  return config;
}

export function getApkVersionName(config: ThaliaConfig): string {
  return config.game.version;
}

function validateConfig(config: ThaliaConfig): void {
  required(config.project?.name, 'project.name');

  required(config.game?.version, 'game.version');

  required(config.upstreams?.sugarcube_vrelnir?.url, 'upstreams.sugarcube_vrelnir.url');
  required(config.upstreams?.sugarcube_vrelnir?.ref, 'upstreams.sugarcube_vrelnir.ref');
  required(config.upstreams?.sugarcube_vrelnir?.path, 'upstreams.sugarcube_vrelnir.path');

  required(config.upstreams?.modloader?.url, 'upstreams.modloader.url');
  required(config.upstreams?.modloader?.ref, 'upstreams.modloader.ref');
  required(config.upstreams?.modloader?.path, 'upstreams.modloader.path');

  required(config.paths?.source_html, 'paths.source_html');
  required(config.paths?.builtin_mods, 'paths.builtin_mods');
  required(config.paths?.output_html, 'paths.output_html');
  required(config.paths?.story_format, 'paths.story_format');
  required(config.paths?.cordova_project, 'paths.cordova_project');

  required(config.apk?.id, 'apk.id');
  required(config.apk?.name, 'apk.name');
}

function required(value: unknown, name: string): void {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required config field: ${name}`);
  }
}
