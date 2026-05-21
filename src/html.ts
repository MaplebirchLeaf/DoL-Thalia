import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { cp, copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { minify } from 'terser';
import type { ThaliaConfig } from './config';
import { readModLoaderLocalModTargets } from './modloader';
import { run } from './process';

const HTML_CACHE_DIR = '.cache/html';

interface EmbeddedIndexDBMod {
  dataParts: string[];
  hash: string;
  name: string;
}

const EMBEDDED_MOD_BASE64_PART_SIZE = 1024 * 1024;
const RUNTIME_SIDECAR_FILES = ['style.css', 'DolSettingsExport.json'];

export async function buildHtml(config: ThaliaConfig): Promise<void> {
  const sourceHtml = await findSingleSourceHtml(config.paths.source_html);
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
  requireFile(sourceHtml);
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
    const cacheHtml = join(cacheDir, 'index.html');
    await copyFile(sourceHtml, cacheHtml);
    const localModTargets = await readModLoaderLocalModTargets(modLoaderRoot);
    const indexDBModFiles = await listIndexDBModFiles(inputModsDir);
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
      sourceHtml,
      imagesDir: resolve(config.paths.images),
      outputDir
    });
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
    await rm(cleanLocalModListPath, { force: true });
  }
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

async function findSingleSourceHtml(pattern: string): Promise<string> {
  if (!pattern.endsWith('*.html')) {
    const file = resolve(pattern);
    requireFile(file);
    return file;
  }
  const dir = resolve(pattern.slice(0, -'*.html'.length));
  if (!existsSync(dir)) throw new Error(`HTML input directory does not exist: ${dir}`);
  const files = await readdir(dir);
  const htmlFiles = files.filter(file => extname(file).toLowerCase() === '.html').sort();
  if (htmlFiles.length === 0) throw new Error(`HTML input directory has no .html file: ${dir}`);
  if (htmlFiles.length > 1) throw new Error(`HTML input directory must contain only one .html file: ${dir}`);
  return join(dir, htmlFiles[0]);
}

async function listIndexDBModFiles(modsDir: string): Promise<string[]> {
  if (!existsSync(modsDir)) return [];
  const entries = await readdir(modsDir, { withFileTypes: true });
  return entries
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .filter(file => file.toLowerCase().endsWith('.zip'))
    .sort()
    .map(file => join(modsDir, file));
}

async function insertIndexDBMods(htmlPath: string, modFiles: string[]): Promise<void> {
  const items: EmbeddedIndexDBMod[] = [];
  for (const modFile of modFiles) {
    const data = await readFile(modFile);
    items.push({
      dataParts: splitBase64(data.toString('base64')),
      hash: createHash('sha256').update(data).digest('hex'),
      name: modNameFromZip(data, modFile)
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

function modNameFromZip(data: Uint8Array, modFile: string): string {
  const files = unzipSync(data, { filter: file => file.name === 'boot.json' });
  const bootJson = files['boot.json'];
  if (!bootJson) throw new Error(`Missing boot.json in embedded IndexDB mod: ${modFile}`);
  const boot = JSON.parse(strFromU8(bootJson)) as { name?: unknown };
  if (typeof boot.name !== 'string' || boot.name.trim() === '') throw new Error(`Invalid boot.json name in embedded IndexDB mod: ${modFile}`);
  return boot.name;
}

function splitBase64(data: string): string[] {
  const parts: string[] = [];
  for (let i = 0; i < data.length; i += EMBEDDED_MOD_BASE64_PART_SIZE) parts.push(data.slice(i, i + EMBEDDED_MOD_BASE64_PART_SIZE));
  return parts;
}

function requireFile(path: string): void {
  if (!existsSync(path)) throw new Error(`Missing file: ${path}`);
}
