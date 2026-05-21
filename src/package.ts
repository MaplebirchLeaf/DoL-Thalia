import { existsSync, readFileSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { platform } from 'node:process';
import { zipSync } from 'fflate';
import type { ThaliaConfig } from './config';
import { logDone, logInfo } from './log';
import { run } from './process';
import { buildPackageName, escapeXml, safeFileName } from './release-utils';

const GRADLE_VERSION = '8.14.2';
const ANDROID_PLATFORM_DIR = 'platforms/android';
const DEBUG_APK_PATH = `${ANDROID_PLATFORM_DIR}/app/build/outputs/apk/debug/app-debug.apk`;
const APK_ICON_SOURCE = 'input/icon.png';
const CORDOVA_PLUGINS = ['cordova-plugin-save-dialog@2.0.1', 'cordova-plugin-rnk-toast@0.0.1'];

export interface ApkBuildStatus {
  canBuild: boolean;
  message?: string;
}

export async function buildPlayerZip(config: ThaliaConfig): Promise<void> {
  const htmlDir = dirname(resolve(config.paths.output_html));
  const outputZip = resolve(config.paths.output_zip);
  requireDirectory(htmlDir);
  await mkdir(dirname(outputZip), { recursive: true });

  const folderName = buildPackageName(config.project.name, config.game.version);
  const files = await readFilesForZip(htmlDir, folderName, `${safeFileName(config.project.name)}.html`);
  await writeFile(outputZip, zipSync(files, { level: 6 }));
  logDone(`ZIP 输出：${outputZip}`);
}

export async function buildApk(config: ThaliaConfig): Promise<void> {
  const htmlDir = dirname(resolve(config.paths.output_html));
  const projectDir = resolve(config.paths.cordova_project);
  const androidProjectDir = join(projectDir, ANDROID_PLATFORM_DIR);
  const outputDir = resolve(config.paths.output_apk_dir);
  requireDirectory(htmlDir);
  const status = apkBuildStatus();
  if (!status.canBuild) throw new Error(status.message);
  await mkdir(outputDir, { recursive: true });

  logInfo('准备 Cordova 工程');
  const projectCreated = await ensureCordovaProject(config, projectDir);
  await prepareCordovaWww(htmlDir, join(projectDir, 'www'));
  await writeCordovaConfig(config, join(projectDir, 'config.xml'));
  const platformCreated = await ensureAndroidPlatform(projectDir);
  const pluginsChanged = await ensureCordovaPlugins(projectDir);
  if (projectCreated || platformCreated || pluginsChanged || !existsSync(join(androidProjectDir, 'app/src/main/assets/www/cordova.js'))) {
    logInfo('刷新 Cordova 平台');
    await run([findCordovaBin(), 'prepare', 'android'], { cwd: projectDir, quiet: true });
  }

  logInfo('同步 Web 资源');
  await syncAndroidWww(projectDir);
  await applyApkIcon(androidProjectDir);
  await suppressAndroidJavaWarnings(androidProjectDir);

  logInfo('打包 Android APK');
  await run([findGradleBin(), 'cdvBuildDebug', '--quiet'], { cwd: androidProjectDir, env: androidBuildEnv() });

  const builtApk = join(projectDir, DEBUG_APK_PATH);
  requireFile(builtApk);
  const outputApk = join(outputDir, `${safeFileName(config.project.name)}.apk`);
  await cp(builtApk, outputApk, { force: true });
  logDone(`APK 输出：${outputApk}`);
}

async function readFilesForZip(root: string, folderName: string, htmlFileName: string): Promise<Record<string, Uint8Array>> {
  const files: Record<string, Uint8Array> = {};
  await collect(root);
  return files;

  async function collect(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await collect(fullPath);
      } else if (entry.isFile()) {
        const pathInHtmlDir = relative(root, fullPath).replaceAll('\\', '/');
        const pathInZip = pathInHtmlDir === 'index.html' ? htmlFileName : pathInHtmlDir;
        const zipPath = `${folderName}/${pathInZip}`;
        files[zipPath] = await readFile(fullPath);
      }
    }
  }
}

async function ensureCordovaProject(config: ThaliaConfig, projectDir: string): Promise<boolean> {
  if (existsSync(join(projectDir, 'config.xml'))) return false;
  await mkdir(dirname(projectDir), { recursive: true });
  await run([findCordovaBin(), 'create', projectDir, config.apk.id, config.apk.name], { quiet: true });
  return true;
}

async function prepareCordovaWww(sourceDir: string, wwwDir: string): Promise<void> {
  await rm(wwwDir, { recursive: true, force: true });
  await cp(sourceDir, wwwDir, { recursive: true, force: true });
  await writeFile(join(wwwDir, 'custom_cordova_additions.js'), CORDOVA_ADDITIONS, 'utf8');
  await injectCordovaScripts(join(wwwDir, 'index.html'));
}

async function injectCordovaScripts(indexHtml: string): Promise<void> {
  requireFile(indexHtml);
  const html = (await readFile(indexHtml, 'utf8'))
    .replace(/<script\s+src=["']cordova\.js["']\s+type=["']text\/javascript["']><\/script>\s*/gi, '')
    .replace(/<script\s+src=["']custom_cordova_additions\.js["']\s+type=["']text\/javascript["']><\/script>\s*/gi, '');
  const scripts = '<script src="cordova.js" type="text/javascript"></script>\n<script src="custom_cordova_additions.js" type="text/javascript"></script>\n';
  const firstScript = html.indexOf('<script');
  if (firstScript !== -1) {
    await writeFile(indexHtml, `${html.slice(0, firstScript)}${scripts}${html.slice(firstScript)}`, 'utf8');
    return;
  }
  const headEnd = html.indexOf('</head>');
  if (headEnd !== -1) {
    await writeFile(indexHtml, `${html.slice(0, headEnd)}${scripts}${html.slice(headEnd)}`, 'utf8');
    return;
  }
  await writeFile(indexHtml, `${scripts}${html}`, 'utf8');
}

async function writeCordovaConfig(config: ThaliaConfig, configXml: string): Promise<void> {
  await writeFile(
    configXml,
    `<?xml version='1.0' encoding='utf-8'?>
    <widget id="${escapeXml(config.apk.id)}" version="${escapeXml(config.game.version)}" xmlns="http://www.w3.org/ns/widgets" xmlns:cdv="http://cordova.apache.org/ns/1.0">
        <name>${escapeXml(config.apk.name)}</name>
        <description>${escapeXml(config.project.name)} player package.</description>
        <author email="modloader@example.invalid">${escapeXml(config.project.name)}</author>
        <content src="index.html" />
        <access origin="*" />
        <allow-navigation href="*" />
        <allow-intent href="http://*/*" />
        <allow-intent href="https://*/*" />
        <allow-intent href="market:*" />
        <preference name="AndroidInsecureFileModeEnabled" value="true" />
        <preference name="AndroidLaunchMode" value="singleTask" />
        <preference name="GradlePluginKotlinEnabled" value="true" />
    </widget>
    `,
    'utf8'
  );
}

async function ensureAndroidPlatform(projectDir: string): Promise<boolean> {
  if (existsSync(join(projectDir, ANDROID_PLATFORM_DIR))) return false;
  await run([findCordovaBin(), 'platform', 'add', 'android'], { cwd: projectDir, quiet: true });
  return true;
}

async function ensureCordovaPlugins(projectDir: string): Promise<boolean> {
  let changed = false;
  for (const plugin of CORDOVA_PLUGINS) {
    const pluginId = plugin.split('@')[0];
    if (existsSync(join(projectDir, 'plugins', pluginId))) continue;
    await run([findCordovaBin(), 'plugin', 'add', plugin], { cwd: projectDir, quiet: true });
    changed = true;
  }
  return changed;
}

async function syncAndroidWww(projectDir: string): Promise<void> {
  const source = join(projectDir, 'www');
  const target = join(projectDir, ANDROID_PLATFORM_DIR, 'app/src/main/assets/www');
  await mkdir(target, { recursive: true });
  await cp(source, target, { recursive: true, force: true });
}

async function suppressAndroidJavaWarnings(androidProjectDir: string): Promise<void> {
  await writeFile(
    join(androidProjectDir, 'app/build-extras.gradle'),
    `tasks.withType(JavaCompile).configureEach {
    options.compilerArgs += ['-Xlint:none', '-nowarn']
    options.deprecation = false
    options.warnings = false
}
`,
    'utf8'
  );
}

async function applyApkIcon(androidProjectDir: string): Promise<void> {
  const icon = resolve(APK_ICON_SOURCE);
  if (!existsSync(icon)) return;
  const resDir = join(androidProjectDir, 'app/src/main/res');
  await Promise.all([
    writePng(icon, join(resDir, 'mipmap-ldpi/ic_launcher.png'), 36),
    writePng(icon, join(resDir, 'mipmap-mdpi/ic_launcher.png'), 48),
    writePng(icon, join(resDir, 'mipmap-hdpi/ic_launcher.png'), 72),
    writePng(icon, join(resDir, 'mipmap-xhdpi/ic_launcher.png'), 96),
    writePng(icon, join(resDir, 'mipmap-xxhdpi/ic_launcher.png'), 144),
    writePng(icon, join(resDir, 'mipmap-xxxhdpi/ic_launcher.png'), 192),
    writePng(icon, join(resDir, 'mipmap-ldpi-v26/ic_launcher_foreground.png'), 81),
    writePng(icon, join(resDir, 'mipmap-mdpi-v26/ic_launcher_foreground.png'), 108),
    writePng(icon, join(resDir, 'mipmap-hdpi-v26/ic_launcher_foreground.png'), 162),
    writePng(icon, join(resDir, 'mipmap-xhdpi-v26/ic_launcher_foreground.png'), 216),
    writePng(icon, join(resDir, 'mipmap-xxhdpi-v26/ic_launcher_foreground.png'), 324),
    writePng(icon, join(resDir, 'mipmap-xxxhdpi-v26/ic_launcher_foreground.png'), 432)
  ]);
}

async function writePng(source: string, target: string, size: number): Promise<void> {
  await mkdir(dirname(target), { recursive: true });
  if (platform !== 'win32') {
    await cp(source, target, { force: true });
    return;
  }
  await run(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resolve('src/tools/resize-png.ps1'), source, target, String(size)], { quiet: true });
}

function findCordovaBin(): string {
  const bin = platform === 'win32' ? 'cordova.cmd' : 'cordova';
  const local = resolve('node_modules/.bin', bin);
  return existsSync(local) ? local : bin;
}

function findGradleBin(): string {
  const bin = platform === 'win32' ? 'gradle.bat' : 'gradle';
  const local = join(gradleHome(), 'bin', bin);
  return existsSync(local) ? local : bin;
}

export function apkBuildStatus(): ApkBuildStatus {
  const sdkPath = findAndroidSdk();
  if (!existsSync(sdkPath)) {
    return {
      canBuild: false,
      message: `未找到 Android SDK：${sdkPath}。请设置 ANDROID_HOME 或 ANDROID_SDK_ROOT。`
    };
  }
  const gradle = findGradleBin();
  if (!existsSync(gradle) && gradle !== 'gradle') {
    return {
      canBuild: false,
      message: `未找到 Gradle ${GRADLE_VERSION}：${gradleHome()}。`
    };
  }
  return { canBuild: true };
}

function androidBuildEnv(): Record<string, string | undefined> {
  const sdkPath = findAndroidSdk();
  const javaHome = findAndroidBuildJavaHome();
  const pathAdditions = [join(sdkPath, 'cmdline-tools/latest/bin'), join(sdkPath, 'platform-tools'), join(sdkPath, 'emulator'), join(gradleHome(), 'bin'), join(javaHome ?? '', 'bin')].filter(path =>
    existsSync(path)
  );

  return {
    ANDROID_HOME: sdkPath,
    ANDROID_SDK_ROOT: sdkPath,
    JAVA_HOME: javaHome,
    PATH: buildPath(pathAdditions),
    Path: buildPath(pathAdditions)
  };
}

function buildPath(additions: string[]): string {
  const delimiter = platform === 'win32' ? ';' : ':';
  return `${additions.join(delimiter)}${delimiter}${Bun.env.PATH ?? Bun.env.Path ?? ''}`;
}

function findAndroidSdk(): string {
  return Bun.env.ANDROID_HOME || Bun.env.ANDROID_SDK_ROOT || join(Bun.env.LOCALAPPDATA ?? '', 'Android/Sdk');
}

function gradleHome(): string {
  return resolve('.cache/tools', `gradle-${GRADLE_VERSION}`);
}

function findAndroidBuildJavaHome(): string | undefined {
  const javaHome = Bun.env.JAVA_HOME;
  if (javaHome && javaMajor(javaHome) < 25) return javaHome;

  const androidStudioJbr = 'C:\\Program Files\\Android\\Android Studio\\jbr';
  return existsSync(androidStudioJbr) ? androidStudioJbr : javaHome;
}

function javaMajor(javaHome: string): number {
  try {
    const release = readFileSync(join(javaHome, 'release'), 'utf8');
    const version = release.match(/JAVA_VERSION="(\d+)/)?.[1];
    return version ? Number(version) : 0;
  } catch {
    return 0;
  }
}

function requireDirectory(path: string): void {
  if (!existsSync(path)) throw new Error(`Missing directory: ${path}`);
}

function requireFile(path: string): void {
  if (!existsSync(path)) throw new Error(`Missing file: ${path}`);
}

const CORDOVA_ADDITIONS = `// Wait for the deviceready event before using any of Cordova's device APIs.
// See https://cordova.apache.org/docs/en/latest/cordova/events/events.html#deviceready
document.addEventListener('deviceready', onDeviceReady, false);
function onDeviceReady() {
  // Cordova is now initialized. Have fun!
  // turn on the toaster
  window.Toast = cordova.plugins.rnk.toast;
  // record the last time when back button was pressed
  window.lastBackEvent = 0;
  // save back button from instant seppuku and give it purpose
  document.addEventListener('backbutton', ev => {
    ev.preventDefault();
    // back button can now close opened dialog menus
    if (SugarCube.Dialog.isOpen()) SugarCube.Dialog.close();
    if (window.T && T.currentOverlay) closeOverlay(); // dol-specific
    // if no menus are open, warn that the next back button press in short succession will close the app
    else if (Date.now() > window.lastBackEvent + 3500) {
      Toast.showToast('\\u518d\\u6b21\\u70b9\\u51fb\\u8fd4\\u56de\\u952e\\u9000\\u51fa', Toast.LONG);
      window.lastBackEvent = Date.now();
    }
    // otherwise, quit the app
    else navigator.app.exitApp();
    return false;
  }, false);
}
`;
