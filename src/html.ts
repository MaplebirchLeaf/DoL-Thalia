import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { cp, copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { minify } from 'terser';
import type { ThaliaConfig } from './config';
import { readModLoaderLocalModTargets } from './modloader';
import { run } from './process';
import { type ReleasePreset, readDefaultReleasePreset } from './release-presets';

const HTML_CACHE_DIR = '.cache/html';

interface EmbeddedIndexDBMod {
  dataParts: string[];
  hash: string;
  name: string;
}

interface GameInput {
  imagesDir: string;
  sourceHtml: string;
}

const EMBEDDED_MOD_BASE64_PART_SIZE = 1024 * 1024;
const INDEXDB_MOD_EXTENSIONS = ['.mod.zip', '.zip', '.modpack'];
const MODPACK_MAGIC = new Uint8Array([0x4a, 0x65, 0x72, 0x65, 0x6d, 0x69, 0x65, 0x4d, 0x6f, 0x64, 0x4c, 0x6f, 0x61, 0x64, 0x65, 0x72]);
const MODPACK_HEADER_OFFSET = 64;
const RUNTIME_SIDECAR_FILES = ['style.css', 'DolSettingsExport.json'];

export async function buildHtml(config: ThaliaConfig, releasePreset?: ReleasePreset): Promise<void> {
  const outputHtml = resolve(config.paths.output_html);
  const outputDir = dirname(outputHtml);
  const storyFormat = resolve(config.paths.story_format);
  const inputModsDir = resolve(config.paths.builtin_mods);
  const modLoaderRoot = resolve(config.upstreams.modloader.path);
  const beforeSc2 = join(modLoaderRoot, 'dist-BeforeSC2/BeforeSC2.js');
  const insert2html = join(modLoaderRoot, 'dist-insertTools/insert2html.js');
  const sc2ReplaceTool = join(modLoaderRoot, 'dist-insertTools/sc2ReplaceTool.js');
  const vendorModListPath = join(modLoaderRoot, 'modList.json');
  const localModListFile = 'modList.thalia.local.json';
  const cleanLocalModListPath = join(modLoaderRoot, localModListFile);
  requireFile(storyFormat);
  requireFile(beforeSc2);
  requireFile(insert2html);
  requireFile(sc2ReplaceTool);
  requireFile(vendorModListPath);
  const cacheDir = resolve(HTML_CACHE_DIR);
  await rm(cacheDir, { recursive: true, force: true });
  await rm(cleanLocalModListPath, { force: true });
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(cacheDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });
  try {
    const gameInput = await prepareGameInput(config.paths.source_html, config.game.version, cacheDir);
    const cacheHtml = join(cacheDir, 'index.html');
    await copyFile(gameInput.sourceHtml, cacheHtml);
    const localModTargets = await readModLoaderLocalModTargets(modLoaderRoot);
    const preset = releasePreset ?? (await readDefaultReleasePreset(config.game.default_mod_list));
    const indexDBModFiles = await listIndexDBModFiles(inputModsDir, config.game.version, preset.mods);
    await writeFile(cleanLocalModListPath, `${JSON.stringify(localModTargets, null, 2)}\n`, 'utf8');
    await run(['node', sc2ReplaceTool, cacheHtml, storyFormat], { quiet: true });
    const replacedHtml = `${cacheHtml}.sc2replace.html`;
    requireFile(replacedHtml);
    await run(['node', insert2html, replacedHtml, localModListFile, beforeSc2], { cwd: modLoaderRoot, quiet: true });
    const generatedModHtml = `${replacedHtml}.mod.html`;
    requireFile(generatedModHtml);
    await insertIndexDBMods(generatedModHtml, indexDBModFiles);
    await minifySugarCubeScript(generatedModHtml);
    await copyFile(generatedModHtml, outputHtml);
    await copyRuntimeAssets({
      sourceHtml: gameInput.sourceHtml,
      imagesDir: gameInput.imagesDir,
      outputDir
    });
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
    await rm(cleanLocalModListPath, { force: true });
  }
}

async function prepareGameInput(sourcePattern: string, gameVersion: string, cacheDir: string): Promise<GameInput> {
  const source = await findGameSource(sourcePattern, gameVersion);
  if (extname(source).toLowerCase() !== '.zip') {
    const sourceDir = dirname(source);
    return {
      imagesDir: join(sourceDir, 'img'),
      sourceHtml: source
    };
  }

  const extractDir = join(cacheDir, 'game');
  await mkdir(extractDir, { recursive: true });
  await extractZip(source, extractDir);
  const sourceHtml = await findSingleHtmlInDir(extractDir);
  return {
    imagesDir: join(dirname(sourceHtml), 'img'),
    sourceHtml
  };
}

async function copyRuntimeAssets(options: { sourceHtml: string; imagesDir: string; outputDir: string }): Promise<void> {
  const sourceDir = dirname(options.sourceHtml);
  if (existsSync(options.imagesDir)) await cp(options.imagesDir, join(options.outputDir, 'img'), { recursive: true, force: true });
  for (const file of RUNTIME_SIDECAR_FILES) {
    const source = join(sourceDir, file);
    if (existsSync(source)) await copyFile(source, join(options.outputDir, file));
  }
  const remoteModList = join(options.outputDir, 'modList.json');
  if (!existsSync(remoteModList)) await writeFile(remoteModList, '[]\n', 'utf8');
}

async function findGameSource(pattern: string, gameVersion: string): Promise<string> {
  if (!pattern.includes('*')) {
    const file = resolve(pattern);
    requireFile(file);
    return file;
  }
  const extension = extname(pattern).toLowerCase();
  if (extension !== '.html' && extension !== '.zip') throw new Error(`Unsupported game input pattern: ${pattern}`);
  const dir = resolve(pattern.slice(0, -`*${extension}`.length));
  if (!existsSync(dir)) throw new Error(`Game input directory does not exist: ${dir}`);
  const files = await readdir(dir);
  const matches = files
    .filter(file => extname(file).toLowerCase() === extension)
    .filter(file => file.includes(gameVersion))
    .sort();
  if (matches.length === 0) throw new Error(`Game input directory has no ${extension} file for ${gameVersion}: ${dir}`);
  if (matches.length > 1) throw new Error(`Game input directory has multiple ${extension} files for ${gameVersion}: ${matches.join(', ')}`);
  return join(dir, matches[0]);
}

async function findSingleHtmlInDir(dir: string): Promise<string> {
  const result: string[] = [];
  await collectFiles(dir, '.html', result);
  if (result.length === 0) throw new Error(`Extracted game package has no .html file: ${dir}`);
  if (result.length > 1) throw new Error(`Extracted game package must contain only one .html file: ${dir}`);
  return result[0];
}

async function collectFiles(dir: string, extension: string, result: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(path, extension, result);
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === extension) {
      result.push(path);
    }
  }
}

async function extractZip(zipPath: string, outputDir: string): Promise<void> {
  const files = unzipSync(await readFile(zipPath));
  const outputRoot = resolve(outputDir);
  for (const [name, data] of Object.entries(files)) {
    const output = resolve(outputDir, name);
    if (!output.startsWith(`${outputRoot}${sep}`) && output !== outputRoot) {
      throw new Error(`Unsafe path in game zip: ${name}`);
    }
    if (name.endsWith('/')) {
      await mkdir(output, { recursive: true });
    } else {
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, data);
    }
  }
}

async function listIndexDBModFiles(modsRoot: string, gameVersion: string, modSourceNames: string[]): Promise<string[]> {
  const result: string[] = [];
  const versionDir = join(modsRoot, gameVersion);
  for (const sourceName of modSourceNames) {
    const sourceFiles = await findModSourceFiles(versionDir, sourceName);
    if (sourceFiles.length === 0) throw new Error(`Missing mod source files: ${join(versionDir, sourceName)}`);
    result.push(...sourceFiles.sort());
  }
  return result;
}

async function findModSourceFiles(versionDir: string, sourceName: string): Promise<string[]> {
  const sourceDir = join(versionDir, sourceName);
  const result: string[] = [];
  if (existsSync(sourceDir)) await collectModFiles(sourceDir, result);
  const entries = existsSync(versionDir) ? await readdir(versionDir, { withFileTypes: true }) : [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.includes(sourceName) || !isIndexDBModFile(entry.name)) continue;
    result.push(join(versionDir, entry.name));
  }
  return [...new Set(result)];
}

async function collectModFiles(dir: string, result: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectModFiles(path, result);
    } else if (entry.isFile() && isIndexDBModFile(entry.name)) {
      result.push(path);
    }
  }
}

function isIndexDBModFile(file: string): boolean {
  const lower = file.toLowerCase();
  return INDEXDB_MOD_EXTENSIONS.some(extension => lower.endsWith(extension));
}

async function insertIndexDBMods(htmlPath: string, modFiles: string[]): Promise<void> {
  const items: EmbeddedIndexDBMod[] = [];
  for (const modFile of modFiles) {
    const data = await readFile(modFile);
    items.push({
      dataParts: splitBase64(data.toString('base64')),
      hash: createHash('sha256').update(data).digest('hex'),
      name: modNameFromFileData(data, modFile)
    });
  }
  const script = `<script type="text/javascript">window.modDataValueZipListIndexDB = ${JSON.stringify(items)};</script>`;
  const html = await readFile(htmlPath, 'utf8');
  const localListIndex = html.indexOf('window.modDataValueZipList');
  if (localListIndex !== -1) {
    const scriptEndIndex = html.indexOf('</script>', localListIndex);
    if (scriptEndIndex !== -1) {
      const insertIndex = scriptEndIndex + '</script>'.length;
      await writeFile(htmlPath, `${html.slice(0, insertIndex)}\n${script}${html.slice(insertIndex)}`, 'utf8');
      return;
    }
  }
  const firstScriptIndex = html.indexOf('<script');
  if (firstScriptIndex === -1) throw new Error(`Cannot find script insertion point in HTML: ${htmlPath}`);
  await writeFile(htmlPath, `${html.slice(0, firstScriptIndex)}\n${script}\n${html.slice(firstScriptIndex)}`, 'utf8');
}

async function minifySugarCubeScript(htmlPath: string): Promise<void> {
  const html = await readFile(htmlPath, 'utf8');
  const openStart = html.indexOf('<script id="script-sugarcube"');
  if (openStart === -1) return;
  const openEnd = html.indexOf('>', openStart);
  const closeStart = html.indexOf('</script>', openEnd);
  if (openEnd === -1 || closeStart === -1) throw new Error(`Invalid script-sugarcube block in HTML: ${htmlPath}`);
  const source = html.slice(openEnd + 1, closeStart);
  const result = await minify(source, {
    compress: { passes: 2 },
    mangle: true,
    format: { comments: false }
  });
  if (!result.code) throw new Error('SugarCube script minify failed.');
  await writeFile(htmlPath, `${html.slice(0, openEnd + 1)}${result.code}${html.slice(closeStart)}`, 'utf8');
}

function modNameFromFileData(data: Uint8Array, modFile: string): string {
  if (modFile.toLowerCase().endsWith('.modpack')) return modNameFromModPack(data) || modNameFromFile(modFile);
  try {
    const files = unzipSync(data, { filter: file => file.name === 'boot.json' });
    const bootJson = files['boot.json'];
    if (!bootJson) return modNameFromFile(modFile);
    const boot = JSON.parse(strFromU8(bootJson)) as { name?: unknown };
    return typeof boot.name === 'string' && boot.name.trim() !== '' ? boot.name : modNameFromFile(modFile);
  } catch {
    return modNameFromFile(modFile);
  }
}

function modNameFromFile(modFile: string): string {
  return basename(modFile).replace(/\.(mod\.zip|zip|modpack)$/i, '');
}

function modNameFromModPack(data: Uint8Array): string | undefined {
  if (!startsWith(data, MODPACK_MAGIC)) return undefined;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const metaStart = Number(view.getBigUint64(MODPACK_HEADER_OFFSET, true));
  const metaRawEnd = Number(view.getBigUint64(MODPACK_HEADER_OFFSET + 8, true));
  if (!Number.isSafeInteger(metaStart) || !Number.isSafeInteger(metaRawEnd) || metaStart < 0 || metaRawEnd <= metaStart || metaRawEnd > data.length) return undefined;
  return readBsonString(data.subarray(metaStart, metaRawEnd), 'name');
}

function startsWith(data: Uint8Array, prefix: Uint8Array): boolean {
  if (data.length < prefix.length) return false;
  return prefix.every((value, index) => data[index] === value);
}

function readBsonString(data: Uint8Array, targetKey: string): string | undefined {
  if (data.length < 5) return undefined;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const documentLength = view.getInt32(0, true);
  if (documentLength < 5 || documentLength > data.length) return undefined;
  let offset = 4;
  while (offset < documentLength - 1) {
    const type = data[offset++];
    const keyEnd = data.indexOf(0, offset);
    if (keyEnd === -1 || keyEnd >= documentLength) return undefined;
    const key = new TextDecoder().decode(data.subarray(offset, keyEnd));
    offset = keyEnd + 1;
    if (type === 0x02) {
      if (offset + 4 > documentLength) return undefined;
      const length = view.getInt32(offset, true);
      offset += 4;
      if (length <= 0 || offset + length > documentLength) return undefined;
      const value = new TextDecoder().decode(data.subarray(offset, offset + length - 1));
      if (key === targetKey) return value;
      offset += length;
    } else if (type === 0x03) {
      if (offset + 4 > documentLength) return undefined;
      offset += view.getInt32(offset, true);
    } else if (type === 0x10) {
      offset += 4;
    } else if (type === 0x08) {
      offset += 1;
    } else {
      return undefined;
    }
  }
  return undefined;
}

function splitBase64(data: string): string[] {
  const parts: string[] = [];
  for (let i = 0; i < data.length; i += EMBEDDED_MOD_BASE64_PART_SIZE) parts.push(data.slice(i, i + EMBEDDED_MOD_BASE64_PART_SIZE));
  return parts;
}

function requireFile(path: string): void {
  if (!existsSync(path)) throw new Error(`Missing file: ${path}`);
}
