import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execPath } from 'node:process';
import { dirname, join } from 'node:path';
import { minify } from 'terser';
import type { ThaliaConfig } from '../core/config';
import { run } from '../core/process';

const SC2_SOURCE_ENTRY = 'src/sugarcube.js';
const SC2_FORMAT_OUTPUT = 'build/twine2/sugarcube-2/format.js';

const MODLOADER_HOOK_MARKER = 'DoL-Thalia ModLoader hook';
const I10N_HOOK_MARKER = 'DoL-Thalia I10n hook';

export interface BuildStoryFormatOptions {
  modloaderHook?: boolean;
  i10nHook?: boolean;
}

type ResolvedBuildStoryFormatOptions = Required<BuildStoryFormatOptions>;

const CHINESE_IDB_L10N_COMPAT = {
  identity: '游戏',
  aborting: '终止',
  cancel: '取消',
  close: '关闭',
  ok: '确认',
  errorTitle: '出错',
  errorToggle: '打开/关闭错误视图',
  errorNonexistentPassage: '段落"{passage}"不存在',
  errorSaveDiskLoadFailed: '从本地读取存档文件失败',
  errorSaveMissingData: '存档缺少必要数据，可能是读取的文件非存档或存档已损坏',
  errorSaveIdMismatch: '来自{identity}的存档有误',
  _warningIntroLacking: '你的浏览器可能损坏，或限制了',
  _warningOutroDegraded: '，因此{identity}在受限制模式中运行。你可以继续运行，但部分内容可能出现异常。',
  warningNoWebStorage: '{_warningIntroLacking} Web Storage API{_warningOutroDegraded}',
  warningDegraded: '{_warningIntroLacking}{identity}所需功能{_warningOutroDegraded}',
  debugBarToggle: '打开/关闭调试栏',
  debugBarNoWatches: '\u2014 未设置监控 \u2014',
  debugBarAddWatch: '添加监控',
  debugBarDeleteWatch: '删除监控',
  debugBarWatchAll: '监控全部',
  debugBarWatchNone: '删除全部',
  debugBarLabelAdd: '添加',
  debugBarLabelWatch: '监视',
  debugBarLabelTurn: '回合',
  debugBarLabelViews: '视图',
  debugBarViewsToggle: '打开/关闭调试视图',
  debugBarWatchToggle: '打开/关闭监控面板',
  uiBarToggle: '打开/关闭导航栏',
  uiBarBackward: '后退',
  uiBarForward: '前进',
  uiBarJumpto: '跳到{identity}的历史记录中的某一点',
  jumptoTitle: '跳到',
  jumptoTurn: '转到',
  jumptoUnavailable: '目前没有可用的跳跃点…',
  savesTitle: '存档',
  savesDisallowed: '在本段落中不允许存档',
  savesIncapable: '{_warningIntroLacking}支持存档所需的功能，因此本次游戏的存档功能已被禁用',
  savesLabelAuto: '自动存档',
  savesLabelDelete: '删除',
  savesLabelExport: '另存为…',
  savesLabelImport: '读取…',
  savesLabelLoad: '读取',
  savesLabelClear: '全部删除',
  savesLabelSave: '保存',
  savesLabelSlot: '存档槽',
  savesUnavailable: '未找到存档插槽…',
  savesUnknownDate: '未知',
  savesDisallowedReplay: '目前正在使用场景查看器，无法正常保存。',
  savesExportReminder: '警告：如果你清除了浏览器缓存，此处的存档也将丢失！请定时导出存档！',
  savesHeaderSaveLoad: '保存/加载',
  savesHeaderIDName: 'ID/名称',
  savesHeaderDetails: '描述',
  savesDescTitle: '标题：',
  savesDescName: '存档名：',
  savesDescId: '存档 ID：',
  savesDescDate: '日期：',
  savesPagerJump: '跳转到最近一次手动保存',
  savesPagerPage: '页数：',
  savesPagerSavesPerPage: '每页存档个数：',
  savesOptionsConfirmOn: '保存时需要确认',
  savesOptionsOverwrite: '覆盖',
  savesOptionsUseLegacy: '使用旧版储存方式',
  savesWarningSaveOnSlot: '保存存档到槽 ',
  savesWarningOverwriteSlot: '覆盖存档到槽 ',
  savesWarningOverwriteID: '存档 ID 不匹配，是否继续覆盖？',
  savesWarningDeleteInSlot: '删除存档槽：',
  savesWarningLoad: '加载存档槽：',
  savesWarningDeleteAll: '警告：你确定要删除所有存档吗？',
  savesLabelToClipboard: '保存至剪贴板…',
  settingsTitle: '设置',
  settingsOff: '关闭',
  settingsOn: '开启',
  settingsReset: '重置为默认值',
  restartTitle: '重新开始',
  restartPrompt: '你确定要重新开始吗？未保存的进度将会丢失。',
  shareTitle: '分享',
  alertTitle: '警告',
  autoloadTitle: '自动加载',
  autoloadCancel: '前往最初的段落',
  autoloadOk: '读取自动存档',
  autoloadPrompt: '有一个自动存档，读取它还是前往最初的段落？',
  macroBackText: '返回上一步',
  macroReturnText: '返回/退出'
};

export async function buildStoryFormat(config: ThaliaConfig, options: BuildStoryFormatOptions = {}): Promise<void> {
  const resolvedOptions = resolveBuildStoryFormatOptions(options);
  const sugarcubeRoot = config.upstreams.sugarcube_vrelnir.path;
  const sourceEntry = join(sugarcubeRoot, SC2_SOURCE_ENTRY);
  const sourceFormat = join(sugarcubeRoot, SC2_FORMAT_OUTPUT);
  const outputFormat = config.paths.story_format;
  await installDependencies(sugarcubeRoot);
  const restoreSugarCubeSource = await patchSugarCubeSource(sourceEntry, resolvedOptions);

  try {
    await run(['node', 'build.js', '-d', '-u', '-b', '2'], { cwd: sugarcubeRoot, quiet: true });
    if (!existsSync(sourceFormat)) throw new Error(`SugarCube format.js not found: ${sourceFormat}`);
    const builtFormat = await readFile(sourceFormat, 'utf8');
    const compressed = await compressJavaScript(builtFormat);
    await mkdir(dirname(outputFormat), { recursive: true });
    await writeFile(outputFormat, compressed, 'utf8');
  } finally {
    await restoreSugarCubeSource();
  }
}

function resolveBuildStoryFormatOptions(options: BuildStoryFormatOptions): ResolvedBuildStoryFormatOptions {
  return {
    modloaderHook: options.modloaderHook ?? true,
    i10nHook: options.i10nHook ?? true
  };
}

async function installDependencies(projectRoot: string): Promise<void> {
  if (existsSync(join(projectRoot, 'node_modules'))) return;
  await run([execPath, 'install'], { cwd: projectRoot, quiet: true });
}

async function patchSugarCubeSource(sourcePath: string, options: ResolvedBuildStoryFormatOptions): Promise<() => Promise<void>> {
  if (!existsSync(sourcePath)) throw new Error(`SugarCube source file not found: ${sourcePath}`);
  const source = await readFile(sourcePath, 'utf8');
  const patched = patchJQueryStartup(source, options);
  if (patched === source) return async () => {};
  await writeFile(sourcePath, patched, 'utf8');

  return async () => await writeFile(sourcePath, source, 'utf8');
}

function patchJQueryStartup(source: string, options: ResolvedBuildStoryFormatOptions): string {
  // SugarCube initializes through this startup closure; wrapping it lets ModLoader run first.
  const startText = 'jQuery(() => {';
  const startIndex = source.indexOf(startText);
  if (startIndex === -1) throw new Error('SugarCube startup entry not found: jQuery(() => {');
  const bodyStart = source.indexOf('{', startIndex);
  const bodyEnd = findMatchingBrace(source, bodyStart);
  const startupBody = getCleanStartupBody(source.slice(bodyStart + 1, bodyEnd));
  const patchedBody = options.modloaderHook ? createStartupWithModLoader(startupBody, options) : createStartupWithoutModLoader(startupBody, options);
  return source.slice(0, bodyStart + 1) + patchedBody + source.slice(bodyEnd);
}

function getCleanStartupBody(currentBody: string): string {
  const mainStartBody = extractMainStartBody(currentBody);
  const sourceBody = mainStartBody ?? currentBody;
  const withoutI10n = removeExistingI10nHook(sourceBody);
  const withoutUseStrict = withoutI10n.replace(/^\s*(['"])use strict\1;\s*/, '');
  return withoutUseStrict.trim();
}

function extractMainStartBody(source: string): string | null {
  if (!source.includes(MODLOADER_HOOK_MARKER)) return null;
  const mainStartIndex = source.search(/\b(?:const|let|var)\s+mainStart\s*=\s*\(\)\s*=>\s*\{/);
  if (mainStartIndex === -1) return null;
  const bodyStart = source.indexOf('{', mainStartIndex);
  const bodyEnd = findMatchingBrace(source, bodyStart);
  return source.slice(bodyStart + 1, bodyEnd);
}

function createStartupWithModLoader(startupBody: string, options: ResolvedBuildStoryFormatOptions): string {
  const i10nHookSource = options.i10nHook ? `${createI10nHookSource('\t').trimEnd()}\n` : '';
  const preloaderDone = options.i10nHook ? '.then(() => { mainStart(); initI10n(); })' : '.then(() => mainStart())';
  const fallbackStart = options.i10nHook ? `\t\tmainStart();\n\t\tinitI10n();` : `\t\tmainStart();`;
  return `
\t'use strict';
\t/* ${MODLOADER_HOOK_MARKER} */
\tconst mainStart = () => {
${indent(startupBody, '\t\t')}
\t};
${i10nHookSource}\tif (typeof window.modSC2DataManager !== 'undefined') {
\t\twindow.modSC2DataManager.startInit()
\t\t\t.then(() => window.jsPreloader.startLoad())
\t\t\t${preloaderDone}
\t\t\t.catch(err => {
\t\t\t\tconsole.error(err);
\t\t\t});
\t} else {
${fallbackStart}
\t}
`;
}

function createStartupWithoutModLoader(startupBody: string, options: ResolvedBuildStoryFormatOptions): string {
  const i10nHookSource = options.i10nHook ? `${createI10nHookSource('\t').trimEnd()}\n\tinitI10n();\n` : '';
  return `
\t'use strict';
${indent(startupBody, '\t')}
${i10nHookSource}`;
}

function createI10nHookSource(prefix: string): string {
  // The Chinese localization expects these labels before SugarCube finishes UI setup.
  return `${prefix}var shouldApplyChineseI10n = () => {
${prefix}\tconst languages = Array.isArray(navigator.languages) && navigator.languages.length > 0 ? navigator.languages : [navigator.language];
${prefix}\treturn languages.some(language => /^zh(?:-|$)/i.test(language || ''));
${prefix}};
${prefix}var initI10n = () => {
${prefix}\t/* ${I10N_HOOK_MARKER} */
${prefix}\tif (typeof window.initI10n === 'function') window.initI10n(l10nStrings);
${prefix}\tif (shouldApplyChineseI10n()) Object.assign(l10nStrings, ${JSON.stringify(CHINESE_IDB_L10N_COMPAT)});
${prefix}};
`;
}

function removeExistingI10nHook(source: string): string {
  let patched = source;
  const shouldApplyIndex = patched.search(/\n?\s*var\s+shouldApplyChineseI10n\s*=\s*\(\)\s*=>\s*\{/);
  const initIndex = patched.search(/\n?\s*var\s+initI10n\s*=\s*\(\)\s*=>\s*\{/);
  if (shouldApplyIndex !== -1 && initIndex !== -1) {
    const initBodyStart = patched.indexOf('{', initIndex);
    const initBodyEnd = findMatchingBrace(patched, initBodyStart);
    const initStatementEnd = patched.indexOf(';', initBodyEnd);
    if (initStatementEnd !== -1) patched = patched.slice(0, shouldApplyIndex) + patched.slice(initStatementEnd + 1);
  }
  patched = patched.replace(/\.then\(\(\) => \{\s*mainStart\(\);\s*initI10n\(\);\s*\}\)/g, '.then(() => mainStart())');
  patched = patched.replace(/\n\s*initI10n\(\);/g, '');
  return patched.trim();
}

async function compressJavaScript(source: string): Promise<string> {
  const result = await minify(source, {
    compress: {
      passes: 2
    },
    mangle: true,
    format: {
      comments: false
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

    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;

      if (depth === 0) return i;
    }
  }

  throw new Error('SugarCube startup function closing brace not found.');
}
