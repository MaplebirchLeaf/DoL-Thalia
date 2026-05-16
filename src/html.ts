import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import type { ThaliaConfig } from './config';
import { run } from './process';

const HTML_CACHE_DIR = '.cache/html';

export async function buildHtml(config: ThaliaConfig): Promise<void> {
  const sourceHtml = await findSingleSourceHtml(config.paths.source_html);
  const outputHtml = resolve(config.paths.output_html);
  const storyFormat = resolve(config.paths.story_format);
  const builtinMods = resolve(config.paths.builtin_mods);

  const modLoaderRoot = resolve(config.upstreams.modloader.path);
  const beforeSc2 = join(modLoaderRoot, 'dist-BeforeSC2/BeforeSC2.js');
  const insert2html = join(modLoaderRoot, 'dist-insertTools/insert2html.js');
  const sc2ReplaceTool = join(modLoaderRoot, 'dist-insertTools/sc2ReplaceTool.js');

  requireFile(sourceHtml);
  requireFile(storyFormat);
  requireFile(beforeSc2);
  requireFile(insert2html);
  requireFile(sc2ReplaceTool);

  const cacheDir = resolve(HTML_CACHE_DIR);

  await rm(cacheDir, { recursive: true, force: true });
  await mkdir(cacheDir, { recursive: true });
  await mkdir(dirname(outputHtml), { recursive: true });

  const cacheHtml = join(cacheDir, 'index.html');
  const modListPath = join(cacheDir, 'modList.json');

  await copyFile(sourceHtml, cacheHtml);
  await writeModList(builtinMods, modListPath);

  await run(['node', sc2ReplaceTool, cacheHtml, storyFormat]);

  const replacedHtml = `${cacheHtml}.sc2replace.html`;
  requireFile(replacedHtml);

  await run(['node', insert2html, replacedHtml, modListPath, beforeSc2], {
    cwd: cacheDir
  });

  const generatedModHtml = `${replacedHtml}.mod.html`;
  requireFile(generatedModHtml);

  await copyFile(generatedModHtml, outputHtml);

  await rm(cacheDir, { recursive: true, force: true });
}

async function findSingleSourceHtml(pattern: string): Promise<string> {
  if (!pattern.endsWith('*.html')) {
    const file = resolve(pattern);
    requireFile(file);
    return file;
  }

  const dir = resolve(pattern.slice(0, -'*.html'.length));
  if (!existsSync(dir)) {
    throw new Error(`HTML 输入目录不存在：${dir}`);
  }

  const files = await readdir(dir);
  const htmlFiles = files.filter(file => extname(file).toLowerCase() === '.html').sort();

  if (htmlFiles.length === 0) {
    throw new Error(`HTML 输入目录中没有 .html 文件：${dir}`);
  }

  if (htmlFiles.length > 1) {
    throw new Error(`HTML 输入目录中只能放一个 .html 文件：${dir}`);
  }

  return join(dir, htmlFiles[0]);
}

async function writeModList(modsDir: string, modListPath: string): Promise<void> {
  if (!existsSync(modsDir)) {
    await writeFile(modListPath, '[]\n', 'utf8');
    return;
  }

  const files = await readdir(modsDir);
  const modFiles = files.filter(file => file.endsWith('.mod.zip') || file.endsWith('.zip')).sort();

  const modList = modFiles.map(file => {
    const target = join(modsDir, file);
    return toPosixPath(relative(dirname(modListPath), target));
  });

  await writeFile(modListPath, `${JSON.stringify(modList, null, 2)}\n`, 'utf8');
}

function requireFile(path: string): void {
  if (!existsSync(path)) throw new Error(`缺少文件：${path}`);
}

function toPosixPath(path: string): string {
  return path.replaceAll('\\', '/');
}
