import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execPath } from 'node:process';
import { dirname, join } from 'node:path';
import { minify } from 'terser';
import type { ThaliaConfig } from './config';
import { run } from './process';

const SC2_SOURCE_ENTRY = 'src/sugarcube.js';
const SC2_FORMAT_OUTPUT = 'build/twine2/sugarcube-2/format.js';
const MODLOADER_HOOK_MARKER = 'DoL-Thalia ModLoader hook';

export async function buildStoryFormat(config: ThaliaConfig): Promise<void> {
  const sugarcubeRoot = config.upstreams.sugarcube_vrelnir.path;
  const sourceEntry = join(sugarcubeRoot, SC2_SOURCE_ENTRY);
  const sourceFormat = join(sugarcubeRoot, SC2_FORMAT_OUTPUT);
  const outputFormat = config.paths.story_format;
  await installDependencies(sugarcubeRoot);
  await patchSugarCubeSource(sourceEntry);
  await run(['node', 'build.js', '-d', '-u', '-b', '2'], { cwd: sugarcubeRoot });
  if (!existsSync(sourceFormat)) throw new Error(`未找到 SugarCube format.js：${sourceFormat}`);
  const builtFormat = await readFile(sourceFormat, 'utf8');
  const compressed = await compressJavaScript(builtFormat);
  await mkdir(dirname(outputFormat), { recursive: true });
  await writeFile(outputFormat, compressed, 'utf8');
}

async function installDependencies(projectRoot: string): Promise<void> {
  if (existsSync(join(projectRoot, 'node_modules'))) return;
  await run([execPath, 'install'], { cwd: projectRoot });
}

async function patchSugarCubeSource(sourcePath: string): Promise<void> {
  if (!existsSync(sourcePath)) throw new Error(`未找到 SugarCube 源文件：${sourcePath}`);
  const source = await readFile(sourcePath, 'utf8');
  if (source.includes(MODLOADER_HOOK_MARKER)) return;
  const patched = patchJQueryStartup(source);
  await writeFile(sourcePath, patched, 'utf8');
}

function patchJQueryStartup(source: string): string {
  const startText = 'jQuery(() => {';
  const startIndex = source.indexOf(startText);
  if (startIndex === -1) throw new Error('未找到 SugarCube 启动入口：jQuery(() => {');
  const bodyStart = source.indexOf('{', startIndex);
  const bodyEnd = findMatchingBrace(source, bodyStart);
  const originalBody = source.slice(bodyStart + 1, bodyEnd);
  const bodyWithoutUseStrict = originalBody.replace(/^\s*(['"])use strict\1;\s*/, '');
  const patchedBody = `
    \t'use strict';
    \t/* ${MODLOADER_HOOK_MARKER} */
    \tconst mainStart = () => {
    ${indent(bodyWithoutUseStrict.trim(), '\t\t')}
    \t};
    \tif (typeof window.modSC2DataManager !== 'undefined') {
    \t\twindow.modSC2DataManager.startInit()
    \t\t\t.then(() => window.jsPreloader.startLoad())
    \t\t\t.then(() => mainStart())
    \t\t\t.catch(err => {
    \t\t\t\tconsole.error(err);
    \t\t\t});
    \t} else {
    \t\tmainStart();
    \t}
  `;
  return source.slice(0, bodyStart + 1) + patchedBody + source.slice(bodyEnd);
}

async function compressJavaScript(source: string): Promise<string> {
  const result = await minify(source, {
    compress: {
      passes: 2
    },
    mangle: true,
    format: {
      comments: true
    }
  });
  if (!result.code) throw new Error('format.js 压缩失败。');
  return result.code;
}

function indent(source: string, prefix: string): string {
  return source
    .split('\n')
    .map(line => (line.trim() === '' ? '' : `${prefix}${line}`))
    .join('\n');
}

function findMatchingBrace(source: string, openBraceIndex: number): number {
  type State = null | 'line' | 'block' | '"' | "'" | '`';
  let depth = 0;
  let state: State = null;
  let escaped = false;
  for (let i = openBraceIndex; i < source.length; i++) {
    const char = source[i];
    const next = source[i + 1];
    if (state === 'line') {
      if (char === '\n') state = null;
      continue;
    }
    if (state === 'block') {
      if (char === '*' && next === '/') {
        state = null;
        i++;
      }
      continue;
    }
    if (state === '"' || state === "'" || state === '`') {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === state) {
        state = null;
      }
      continue;
    }
    if (char === '/' && next === '/') {
      state = 'line';
      i++;
      continue;
    }
    if (char === '/' && next === '*') {
      state = 'block';
      i++;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      state = char;
      continue;
    }
    if (char === '{') depth++;
    else if (char === '}' && --depth === 0) return i;
  }
  throw new Error('未找到 SugarCube 启动函数对应的闭合大括号。');
}
