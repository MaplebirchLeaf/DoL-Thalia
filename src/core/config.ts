import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import * as TOML from '@iarna/toml';

export interface UpstreamConfig {
  url: string;
  ref: string;
  path: string;
}

export interface GameVariantConfig {
  /** Version identifier for the variant (may be non-4-part, e.g. 0.775). */
  version?: string;
  source_html?: string;
  default_mod_list?: string;
  /** Directory for the variant's own external mod assets (e.g. input/mods-dolp). */
  mods_dir?: string;
}

export type ModSourceConfig = {
  asset_extensions?: string[];
  asset_keywords?: string[];
  asset_urls?: string[];
  release_tag?: string;
  repository?: string;
  /** Per-variant repository override (e.g. dolp_repository); empty string = skip source for that variant. */
  [variantRepoKey: string]: string | string[] | undefined;
};

export interface ThaliaConfig {
  project: {
    name: string;
  };

  game: {
    default_mod_list: string;
    release_date?: string;
    version: string;
  };

  /** Optional per-game-lineage variants (e.g. dolp). Selected via --game=<name>. */
  games?: Record<string, GameVariantConfig>;

  mod_sources?: Record<string, ModSourceConfig>;

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

  for (const [gameName, variant] of Object.entries(config.games || {})) {
    if (!variant || typeof variant !== 'object') throw new Error(`Invalid config field: games.${gameName}`);
    for (const key of ['version', 'source_html', 'default_mod_list', 'mods_dir'] as const) {
      const value = variant[key];
      if (value !== undefined && (typeof value !== 'string' || value.trim() === '')) {
        throw new Error(`Invalid config field: games.${gameName}.${key}`);
      }
    }
  }

  for (const [name, source] of Object.entries(config.mod_sources || {})) {
    const hasReleaseSource = typeof source.repository === 'string' && source.repository.trim() !== '';
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

/**
 * Apply a game-lineage variant overlay. 'standard' (or missing) returns the config unchanged;
 * variant keys override game.version/default_mod_list, paths.source_html/builtin_mods, and each
 * mod source's repository via a '<variant>_repository' field (empty string => source skipped).
 */
export function withGameVariant(config: ThaliaConfig, game: string | undefined): ThaliaConfig {
  const variant = game && game !== 'standard' ? config.games?.[game] : undefined;
  if (!variant) return config;

  const modSources = config.mod_sources ? mapModSourcesForVariant(config.mod_sources, game!) : config.mod_sources;
  return {
    ...config,
    game: {
      ...config.game,
      version: variant.version ?? config.game.version,
      default_mod_list: variant.default_mod_list ?? config.game.default_mod_list
    },
    paths: {
      ...config.paths,
      source_html: variant.source_html ?? config.paths.source_html,
      builtin_mods: variant.mods_dir ?? config.paths.builtin_mods
    },
    mod_sources: modSources
  };
}

function mapModSourcesForVariant(modSources: NonNullable<ThaliaConfig['mod_sources']>, game: string): NonNullable<ThaliaConfig['mod_sources']> {
  const result: NonNullable<ThaliaConfig['mod_sources']> = {};
  const overrideKey = `${game}_repository`;
  for (const [name, source] of Object.entries(modSources)) {
    const next: ModSourceConfig = { ...source };
    if (Object.prototype.hasOwnProperty.call(source, overrideKey)) {
      const override = source[overrideKey];
      next.repository = typeof override === 'string' ? override.trim() : '';
    }
    result[name] = next;
  }
  return result;
}
