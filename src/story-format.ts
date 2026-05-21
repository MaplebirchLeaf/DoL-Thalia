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
const I10N_HOOK_MARKER = 'DoL-Thalia I10n hook';
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

export async function buildStoryFormat(config: ThaliaConfig): Promise<void> {
  const sugarcubeRoot = config.upstreams.sugarcube_vrelnir.path;
  const sourceEntry = join(sugarcubeRoot, SC2_SOURCE_ENTRY);
  const sourceFormat = join(sugarcubeRoot, SC2_FORMAT_OUTPUT);
  const outputFormat = config.paths.story_format;
  await installDependencies(sugarcubeRoot);
  const restoreSugarCubeSource = await patchSugarCubeSource(sourceEntry);
  try {
    await run(['node', 'build.js', '-d', '-u', '-b', '2'], { cwd: sugarcubeRoot, quiet: true });
    if (!existsSync(sourceFormat)) throw new Error(`未找到 SugarCube format.js：${sourceFormat}`);
    const builtFormat = await readFile(sourceFormat, 'utf8');
    const compressed = await compressJavaScript(builtFormat);
    await mkdir(dirname(outputFormat), { recursive: true });
    await writeFile(outputFormat, compressed, 'utf8');
  } finally {
    await restoreSugarCubeSource();
  }
}

async function installDependencies(projectRoot: string): Promise<void> {
  if (existsSync(join(projectRoot, 'node_modules'))) return;
  await run([execPath, 'install'], { cwd: projectRoot, quiet: true });
}

async function patchSugarCubeSource(sourcePath: string): Promise<() => Promise<void>> {
  if (!existsSync(sourcePath)) throw new Error(`未找到 SugarCube 源文件：${sourcePath}`);
  const source = await readFile(sourcePath, 'utf8');
  const patched = source.includes(MODLOADER_HOOK_MARKER) ? patchExistingStartupHook(source) : patchJQueryStartup(source);
  if (patched === source) return async () => {};
  await writeFile(sourcePath, patched, 'utf8');
  return async () => await writeFile(sourcePath, source, 'utf8');
}

function patchExistingStartupHook(source: string): string {
  if (source.includes(I10N_HOOK_MARKER)) return patchExistingI10nHook(source);
  const initHook = I10nHookSource('\t');
  let patched = source.replace(/\tif \(typeof window\.modSC2DataManager !== 'undefined'\) \{/, `${initHook}\tif (typeof window.modSC2DataManager !== 'undefined') {`);
  patched = patched.replace('.then(() => mainStart())', '.then(() => { mainStart(); initI10n(); })');
  patched = patched.replace(/\n(\s*)mainStart\(\);/, '\n$1mainStart();\n$1initI10n();');
  return patched;
}

function patchExistingI10nHook(source: string): string {
  const hookNameIndex = source.indexOf('const initI10n = () => {');
  if (hookNameIndex === -1) return source;
  const bodyStart = source.indexOf('{', hookNameIndex);
  const bodyEnd = findMatchingBrace(source, bodyStart);
  return `${source.slice(0, hookNameIndex)}${I10nHookSource('\t').trimEnd()}${source.slice(bodyEnd + 1)}`;
}

function I10nHookSource(prefix: string): string {
  return `${prefix}const shouldApplyChineseI10n = () => {\n${prefix}\tconst languages = Array.isArray(navigator.languages) && navigator.languages.length > 0 ? navigator.languages : [navigator.language];\n${prefix}\treturn languages.some(language => /^zh(?:-|$)/i.test(language || ''));\n${prefix}};\n${prefix}const initI10n = () => {\n${prefix}\t/* ${I10N_HOOK_MARKER} */\n${prefix}\tif (typeof window.initI10n === 'function') window.initI10n(l10nStrings);\n${prefix}\tif (shouldApplyChineseI10n()) Object.assign(l10nStrings, ${JSON.stringify(CHINESE_IDB_L10N_COMPAT)});\n${prefix}};\n`;
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
    ${I10nHookSource('\t').trimEnd()}
    \tif (typeof window.modSC2DataManager !== 'undefined') {
    \t\twindow.modSC2DataManager.startInit()
    \t\t\t.then(() => window.jsPreloader.startLoad())
    \t\t\t.then(() => { mainStart(); initI10n(); })
    \t\t\t.catch(err => {
    \t\t\t\tconsole.error(err);
    \t\t\t});
    \t} else {
    \t\tmainStart();
    \t\tinitI10n();
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
    if (char === '{') depth++;
    else if (char === '}' && --depth === 0) return i;
  }
  throw new Error('未找到 SugarCube 启动函数对应的闭合大括号。');
}
