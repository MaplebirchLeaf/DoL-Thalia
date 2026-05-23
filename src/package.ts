import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { platform } from 'node:process';
import { unzipSync, zipSync } from 'fflate';
import type { ThaliaConfig } from './config';
import { logDone, logInfo } from './log';
import { run } from './process';
import { type ReleasePreset, readDefaultReleasePreset } from './release-presets';
import { buildReleaseAssetName, escapeXml, safeFileName } from './release-utils';

const GRADLE_VERSION = '8.14.2';
const GRADLE_DISTRIBUTION_URL = `https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip`;
const ANDROID_PLATFORM_DIR = 'platforms/android';
const RELEASE_UNSIGNED_APK_PATH = `${ANDROID_PLATFORM_DIR}/app/build/outputs/apk/release/app-release-unsigned.apk`;
const APK_ICON_SOURCE = 'input/icon.png';
const APK_KEYSTORE = 'input/signing/DoL-Thalia.keystore';
const APK_KEY_ALIAS = 'dol-thalia';
const APK_KEY_PASSWORD = 'android';
const CORDOVA_PLUGINS = ['cordova-plugin-save-dialog@2.0.1', 'cordova-plugin-rnk-toast@0.0.1'];

export interface ApkBuildStatus {
  canBuild: boolean;
  message?: string;
}

export async function buildPlayerZip(config: ThaliaConfig, releasePreset?: ReleasePreset): Promise<void> {
  const htmlDir = dirname(resolve(config.paths.output_html));
  const outputZipDir = dirname(resolve(config.paths.output_zip));
  const preset = releasePreset ?? (await readDefaultReleasePreset(config.game.default_mod_list));
  const releaseDate = Bun.env.THALIA_RELEASE_DATE as string;
  requireDirectory(htmlDir);
  await mkdir(outputZipDir, { recursive: true });
  const assetBaseName = buildReleaseAssetName(config.project.name, config.game.version, preset.name, releaseDate);
  const outputZip = join(outputZipDir, `${assetBaseName}.zip`);
  const folderName = assetBaseName;
  const files = await readFilesForZip(htmlDir, folderName, `${assetBaseName}.html`);
  await writeFile(outputZip, zipSync(files, { level: 6 }));
  logDone(`ZIP 输出：${outputZip}`);
}

export async function buildApk(config: ThaliaConfig, releasePreset?: ReleasePreset): Promise<void> {
  const htmlDir = dirname(resolve(config.paths.output_html));
  const projectDir = resolve(config.paths.cordova_project);
  const androidProjectDir = join(projectDir, ANDROID_PLATFORM_DIR);
  const outputDir = resolve(config.paths.output_apk_dir);
  const preset = releasePreset ?? (await readDefaultReleasePreset(config.game.default_mod_list));
  const releaseDate = Bun.env.THALIA_RELEASE_DATE as string;
  requireDirectory(htmlDir);
  const status = apkBuildStatus();
  if (!status.canBuild) throw new Error(status.message);
  await mkdir(outputDir, { recursive: true });
  await ensureGradle();
  logInfo('准备 Cordova 工程');
  const projectCreated = await ensureCordovaProject(config, projectDir);
  await prepareCordovaWww(htmlDir, join(projectDir, 'www'));
  const configChanged = await writeCordovaConfig(config, join(projectDir, 'config.xml'));
  const platformReset = await resetAndroidPlatformIfPackageChanged(config, androidProjectDir);
  const platformCreated = await ensureAndroidPlatform(projectDir);
  const pluginsChanged = await ensureCordovaPlugins(projectDir);
  if (projectCreated || configChanged || platformReset || platformCreated || pluginsChanged || !existsSync(join(androidProjectDir, 'app/src/main/assets/www/cordova.js'))) {
    logInfo('刷新 Cordova 平台');
    await run(cordovaCommand(['prepare', 'android']), { cwd: projectDir, quiet: true });
  }
  logInfo('同步 Web 资源');
  await syncAndroidWww(projectDir);
  await applyApkIcon(androidProjectDir);
  await applyBlackLaunchTheme(androidProjectDir);
  await suppressAndroidJavaWarnings(androidProjectDir);
  logInfo('打包 Android Release');
  await run([findGradleBin(), 'cdvBuildRelease', '--quiet'], {
    cwd: androidProjectDir,
    env: androidBuildEnv(),
    quiet: true
  });
  const unsignedApk = join(projectDir, RELEASE_UNSIGNED_APK_PATH);
  requireFile(unsignedApk);
  const outputApk = join(outputDir, `${buildReleaseAssetName(config.project.name, config.game.version, preset.name, releaseDate)}.apk`);
  await signApk(unsignedApk, outputApk);
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
  await run(cordovaCommand(['create', projectDir, config.apk.id, config.apk.name]), { quiet: true });
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

async function writeCordovaConfig(config: ThaliaConfig, configXml: string): Promise<boolean> {
  const content = `<?xml version="1.0" encoding="utf-8"?>
  <widget id="${escapeXml(config.apk.id)}" version="${escapeXml(config.game.version)}" xmlns="http://www.w3.org/ns/widgets" xmlns:cdv="http://cordova.apache.org/ns/1.0">
    <name>${escapeXml(config.apk.name)}</name>
    <content src="index.html" />
    <access origin="*" />
    <allow-navigation href="*" />
    <preference name="AndroidLaunchMode" value="singleTask" />
    <preference name="GradlePluginKotlinEnabled" value="true" />
  </widget>
  `;
  const previous = existsSync(configXml) ? await readFile(configXml, 'utf8') : '';
  if (previous === content) return false;
  await writeFile(configXml, content, 'utf8');
  return true;
}

async function ensureAndroidPlatform(projectDir: string): Promise<boolean> {
  if (existsSync(join(projectDir, ANDROID_PLATFORM_DIR))) return false;
  await run(cordovaCommand(['platform', 'add', 'android']), { cwd: projectDir, quiet: true });
  return true;
}

async function resetAndroidPlatformIfPackageChanged(config: ThaliaConfig, androidProjectDir: string): Promise<boolean> {
  const gradleConfigPath = join(androidProjectDir, 'cdv-gradle-config.json');
  if (!existsSync(gradleConfigPath)) return false;
  const gradleConfig = JSON.parse(await readFile(gradleConfigPath, 'utf8')) as { PACKAGE_NAMESPACE?: string };
  if (gradleConfig.PACKAGE_NAMESPACE === config.apk.id) return false;
  await rm(androidProjectDir, { recursive: true, force: true });
  return true;
}

async function ensureCordovaPlugins(projectDir: string): Promise<boolean> {
  let changed = false;
  for (const plugin of CORDOVA_PLUGINS) {
    const pluginId = plugin.split('@')[0];
    if (existsSync(join(projectDir, 'plugins', pluginId))) continue;
    await run(cordovaCommand(['plugin', 'add', plugin]), { cwd: projectDir, quiet: true });
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

async function signApk(unsignedApk: string, outputApk: string): Promise<void> {
  const keystore = resolve(APK_KEYSTORE);
  await ensureApkKeystore(keystore);
  const alignedApk = join(dirname(outputApk), `${safeFileName('DoL-Thalia')}.aligned.apk`);
  await run([findBuildTool('zipalign'), '-f', '-p', '4', unsignedApk, alignedApk], { quiet: true });
  await run(
    [
      findBuildTool('apksigner'),
      'sign',
      '--ks',
      keystore,
      '--ks-pass',
      `pass:${APK_KEY_PASSWORD}`,
      '--key-pass',
      `pass:${APK_KEY_PASSWORD}`,
      '--ks-key-alias',
      APK_KEY_ALIAS,
      '--out',
      outputApk,
      alignedApk
    ],
    { quiet: true }
  );
  await rm(alignedApk, { force: true });
}

async function ensureApkKeystore(keystore: string): Promise<void> {
  if (existsSync(keystore)) return;
  await mkdir(dirname(keystore), { recursive: true });
  await run(
    [
      findKeytoolBin(),
      '-genkeypair',
      '-v',
      '-keystore',
      keystore,
      '-storepass',
      APK_KEY_PASSWORD,
      '-keypass',
      APK_KEY_PASSWORD,
      '-alias',
      APK_KEY_ALIAS,
      '-keyalg',
      'RSA',
      '-keysize',
      '2048',
      '-validity',
      '10000',
      '-dname',
      'CN=DoL Thalia, OU=Thalia, O=MaplebirchLeaf, L=Hong Kong, ST=Hong Kong, C=CN'
    ],
    { quiet: true }
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

async function applyBlackLaunchTheme(androidProjectDir: string): Promise<void> {
  const resDir = join(androidProjectDir, 'app/src/main/res');
  const colors = `<resources>
    <color name="cdv_background_color">#000000</color>
    <color name="cdv_splashscreen_background">#000000</color>
  </resources>
  `;
  await Promise.all([
    ...['values', 'values-night', 'values-v34', 'values-night-v34'].map(dir => writeXml(join(resDir, dir, 'cdv_colors.xml'), colors)),
    writeXml(
      join(resDir, 'values/cdv_themes.xml'),
      `<resources>
        <style name="Theme.App.SplashScreen" parent="Theme.SplashScreen">
          <item name="windowSplashScreenBackground">@color/cdv_splashscreen_background</item>
          <item name="windowSplashScreenAnimatedIcon">@drawable/empty_splash_icon</item>
          <item name="windowSplashScreenAnimationDuration">0</item>
          <item name="postSplashScreenTheme">@style/Theme.Cordova.App.DayNight</item>
        </style>
        <style name="Theme.Cordova.App.DayNight" parent="Theme.AppCompat.DayNight.NoActionBar">
          <item name="android:windowBackground">@color/cdv_background_color</item>
          <item name="android:statusBarColor">@android:color/black</item>
          <item name="android:navigationBarColor">@android:color/black</item>
        </style>
      </resources>
      `
    ),
    writeXml(
      join(resDir, 'drawable/empty_splash_icon.xml'),
      `<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
        <size android:width="1dp" android:height="1dp" />
        <solid android:color="@android:color/transparent" />
      </shape>
      `
    )
  ]);
}

async function writeXml(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
}

async function writePng(source: string, target: string, size: number): Promise<void> {
  await mkdir(dirname(target), { recursive: true });
  if (platform !== 'win32') {
    await cp(source, target, { force: true });
    return;
  }
  await run(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resolve('src/tools/resize-png.ps1'), source, target, String(size)], { quiet: true });
}

function cordovaCommand(args: string[]): string[] {
  const localCli = resolve('node_modules/cordova/bin/cordova');
  if (existsSync(localCli)) return ['node', localCli, ...args];
  return [findCordovaBin(), ...args];
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

function findBuildTool(tool: 'apksigner' | 'zipalign'): string {
  const suffix = platform === 'win32' ? (tool === 'apksigner' ? '.bat' : '.exe') : '';
  const name = `${tool}${suffix}`;
  const buildToolsDir = join(findAndroidSdk(), 'build-tools');
  const versions = existsSync(buildToolsDir) ? readdirSync(buildToolsDir).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : [];
  for (const version of versions.reverse()) {
    const candidate = join(buildToolsDir, version, name);
    if (existsSync(candidate)) return candidate;
  }
  return name;
}

export function apkBuildStatus(): ApkBuildStatus {
  const sdkPath = findAndroidSdk();
  if (!existsSync(sdkPath)) {
    return {
      canBuild: false,
      message: `Android SDK not found: ${sdkPath}. Set ANDROID_HOME or ANDROID_SDK_ROOT.`
    };
  }
  return { canBuild: true };
}

async function ensureGradle(): Promise<void> {
  if (existsSync(findGradleBin())) return;
  const toolsDir = resolve('.cache/tools');
  const zipPath = join(toolsDir, `gradle-${GRADLE_VERSION}-bin.zip`);
  await mkdir(toolsDir, { recursive: true });
  logInfo(`Downloading Gradle ${GRADLE_VERSION}`);
  await downloadGradle(zipPath);
  const files = unzipSync(await readFile(zipPath));
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith('/')) continue;
    const output = join(toolsDir, name);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, data);
  }
  await rm(zipPath, { force: true });
}

async function downloadGradle(output: string): Promise<void> {
  try {
    const response = await fetch(GRADLE_DISTRIBUTION_URL);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    await writeFile(output, new Uint8Array(await response.arrayBuffer()));
  } catch (error) {
    await rm(output, { force: true });
    if (platform === 'win32') {
      await run(
        [
          'powershell',
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri $args[0] -OutFile $args[1]",
          GRADLE_DISTRIBUTION_URL,
          output
        ],
        { quiet: true }
      );
      return;
    }
    await run(['curl', '-L', GRADLE_DISTRIBUTION_URL, '-o', output], { quiet: true });
  }
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

function findKeytoolBin(): string {
  const javaHome = findAndroidBuildJavaHome();
  const keytool = platform === 'win32' ? 'keytool.exe' : 'keytool';
  const candidate = javaHome ? join(javaHome, 'bin', keytool) : '';
  return candidate && existsSync(candidate) ? candidate : keytool;
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

const CORDOVA_ADDITIONS = `
document.addEventListener('deviceready', () => {
  let lastBackEvent = 0;
  window.Toast = cordova.plugins.rnk.toast;
  document.addEventListener('backbutton', ev => {
    ev.preventDefault();
    const dialog = window.SugarCube && window.SugarCube.Dialog;
    if (dialog && dialog.isOpen()) dialog.close();
    else if (window.T && window.T.currentOverlay) closeOverlay();
    else if (Date.now() > lastBackEvent + 3500) {
      window.Toast.showToast('再次点击返回键退出', window.Toast.LONG);
      lastBackEvent = Date.now();
    } else navigator.app.exitApp();
  }, false);
}, false);
`;
