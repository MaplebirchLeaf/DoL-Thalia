import { existsSync } from 'node:fs';
import { chmod, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { platform } from 'node:process';
import { unzipSync, zipSync } from 'fflate';
import type { ThaliaConfig } from '../core/config';
import { downloadFile } from '../core/download';
import { logDone, logInfo } from '../core/log';
import { run } from '../core/process';
import { type ReleasePreset, readReleasePreset } from '../release/presets';
import { buildReleaseAssetName, buildReleaseDate, escapeXml, safeFileName } from '../release/utils';
import { resizePngFile } from '../tools/png-resize';
import { splitHtmlAssets } from './split-html-assets';

const ANDROID_PLATFORM_DIR = 'platforms/android';
const RELEASE_UNSIGNED_APK_PATH = `${ANDROID_PLATFORM_DIR}/app/build/outputs/apk/release/app-release-unsigned.apk`;
const APK_ICON_SOURCE = 'input/icon.png';
const APK_KEYSTORE = 'input/signing/DoL-Thalia.keystore';
const APK_KEY_ALIAS = 'dol-thalia';
const APK_KEY_PASSWORD = 'android';
interface CordovaPluginSource {
  files?: string[];
  id: string;
  source: string;
}

const CORDOVA_PLUGINS: CordovaPluginSource[] = [
  { id: 'cordova-plugin-save-dialog', source: 'cordova-plugin-save-dialog@2.0.1' },
  { id: 'cordova-plugin-rnk-toast', source: 'cordova-plugin-rnk-toast@0.0.1' },
  {
    id: 'thalia-native-download',
    source: resolve('cordova-plugins/thalia-native-download'),
    files: ['package.json', 'plugin.xml', 'www/NativeDownload.js', 'src/android/NativeDownloadPlugin.java', 'src/android/DownloadArchive.java']
  }
];

export interface ApkBuildStatus {
  canBuild: boolean;
  message?: string;
}

export async function buildPlayerZip(config: ThaliaConfig, releasePreset?: ReleasePreset): Promise<void> {
  const htmlDir = dirname(resolve(config.paths.output_html));
  const outputZipDir = dirname(resolve(config.paths.output_zip));
  const preset = releasePreset ?? (await readReleasePreset(config.game.default_mod_list, config.paths.mod_list));
  const releaseDate = buildReleaseDate(config.game.release_date ?? config.game.version);
  if (!existsSync(htmlDir)) throw new Error(`Missing directory: ${htmlDir}`);
  await mkdir(outputZipDir, { recursive: true });
  const assetBaseName = buildReleaseAssetName(config.project.name, config.game.version, preset.name, releaseDate);
  const outputZip = join(outputZipDir, `${assetBaseName}.zip`);
  const folderName = assetBaseName;
  const files = await readFilesForZip(htmlDir, folderName, `${assetBaseName}.html`);
  await writeFile(outputZip, zipSync(files, { level: 6 }));
  logDone(`ZIP output: ${outputZip}`);
}

export async function buildApk(config: ThaliaConfig, releasePreset?: ReleasePreset): Promise<void> {
  const htmlDir = dirname(resolve(config.paths.output_html));
  const projectDir = resolve(config.paths.cordova_project);
  const androidProjectDir = join(projectDir, ANDROID_PLATFORM_DIR);
  const outputDir = resolve(config.paths.output_apk_dir);
  const preset = releasePreset ?? (await readReleasePreset(config.game.default_mod_list, config.paths.mod_list));
  const releaseDate = buildReleaseDate(config.game.release_date ?? config.game.version);
  if (!existsSync(htmlDir)) throw new Error(`Missing directory: ${htmlDir}`);
  const status = apkBuildStatus(config);
  if (!status.canBuild) throw new Error(status.message);
  await mkdir(outputDir, { recursive: true });
  await ensureGradle(config);
  const projectCreated = await ensureCordovaProject(config, projectDir);
  await prepareCordovaWww(htmlDir, join(projectDir, 'www'));
  const configChanged = await writeCordovaConfig(config, join(projectDir, 'config.xml'));
  const platformReset = await resetAndroidPlatformIfPackageChanged(config, projectDir);
  const platformCreated = await ensureAndroidPlatform(config, projectDir);
  const pluginsChanged = await ensureCordovaPlugins(projectDir);
  if (projectCreated || configChanged || platformReset || platformCreated || pluginsChanged || !existsSync(join(androidProjectDir, 'app/src/main/assets/www/cordova.js'))) {
    await run(createCordovaCommand(['prepare', 'android']), { cwd: projectDir, quiet: true });
  }
  await syncAndroidWww(projectDir);
  await applyApkIcon(androidProjectDir);
  await applyBlackLaunchTheme(androidProjectDir);
  await run(createCordovaCommand(['build', 'android', '--release', '--', '--packageType=apk']), {
    cwd: projectDir,
    env: createAndroidBuildEnvironment(config),
    quiet: true
  });
  const unsignedApk = join(projectDir, RELEASE_UNSIGNED_APK_PATH);
  if (!existsSync(unsignedApk)) throw new Error(`Missing file: ${unsignedApk}`);
  const outputApk = join(outputDir, `${buildReleaseAssetName(config.project.name, config.game.version, preset.name, releaseDate)}.apk`);
  await signApk(config, unsignedApk, outputApk);
  logDone(`APK output: ${outputApk}`);
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
  await run(createCordovaCommand(['create', projectDir, config.apk.id, config.apk.name]), { quiet: true });
  return true;
}

async function prepareCordovaWww(sourceDir: string, wwwDir: string): Promise<void> {
  // Regenerate Cordova www per build so APK assets match the latest HTML output.
  await rm(wwwDir, { recursive: true, force: true });
  await cp(sourceDir, wwwDir, { recursive: true, force: true });
  await writeFile(join(wwwDir, 'custom_cordova_additions.js'), CORDOVA_ADDITIONS, 'utf8');
  await prepareCordovaHtml(join(wwwDir, 'index.html'));
  await splitHtmlAssets(join(wwwDir, 'index.html'));
}

async function prepareCordovaHtml(indexHtml: string): Promise<void> {
  if (!existsSync(indexHtml)) throw new Error(`Missing file: ${indexHtml}`);
  const html = (await readFile(indexHtml, 'utf8'))
    .replace(/<script\s+src=["']cordova\.js["']\s+type=["']text\/javascript["']><\/script>\s*/gi, '')
    .replace(/<script\s+src=["']custom_cordova_additions\.js["']\s+type=["']text\/javascript["']><\/script>\s*/gi, '')
    .replace(/<meta\s+name=["']thalia-mod-dependency-proxy["'][^>]*>\s*/gi, '')
    .replace(/<meta\s+name=["']thalia-mod-download-transport["'][^>]*>\s*/gi, '');
  const transport = '<meta name="thalia-mod-download-transport" content="native">\n';
  const scripts = '<script src="cordova.js" type="text/javascript"></script>\n<script src="custom_cordova_additions.js" type="text/javascript"></script>\n';
  const firstScript = html.indexOf('<script');
  if (firstScript !== -1) {
    await writeFile(indexHtml, `${html.slice(0, firstScript)}${transport}${scripts}${html.slice(firstScript)}`, 'utf8');
    return;
  }
  const headEnd = html.indexOf('</head>');
  if (headEnd !== -1) {
    await writeFile(indexHtml, `${html.slice(0, headEnd)}${transport}${scripts}${html.slice(headEnd)}`, 'utf8');
    return;
  }
  await writeFile(indexHtml, `${transport}${scripts}${html}`, 'utf8');
}

async function writeCordovaConfig(config: ThaliaConfig, configXml: string): Promise<boolean> {
  // Keep the shell minimal: the game is bundled locally, with plugins for Android affordances.
  const content = `<?xml version="1.0" encoding="utf-8"?>
  <widget id="${escapeXml(config.apk.id)}" version="${escapeXml(config.game.version)}" xmlns="http://www.w3.org/ns/widgets" xmlns:cdv="http://cordova.apache.org/ns/1.0">
    <name>${escapeXml(config.apk.name)}</name>
    <content src="index.html" />
    <access origin="*" />
    <allow-navigation href="*" />
    <preference name="AndroidLaunchMode" value="singleTask" />
    <preference name="AndroidInsecureFileModeEnabled" value="true" />
    <preference name="loadUrlTimeoutValue" value="0" />
    <preference name="GradlePluginKotlinEnabled" value="true" />
  </widget>
  `;
  const previous = existsSync(configXml) ? await readFile(configXml, 'utf8') : '';
  if (previous === content) return false;
  await writeFile(configXml, content, 'utf8');
  return true;
}

async function ensureAndroidPlatform(config: ThaliaConfig, projectDir: string): Promise<boolean> {
  const version = config.apk.toolchain.cordova_android;
  const packageJson = join(projectDir, 'node_modules/cordova-android/package.json');
  if (existsSync(packageJson)) {
    const installed = JSON.parse(await readFile(packageJson, 'utf8')) as { version?: string };
    if (installed.version === version && existsSync(join(projectDir, ANDROID_PLATFORM_DIR))) return false;
    await run(createCordovaCommand(['platform', 'remove', 'android']), { cwd: projectDir, quiet: true });
  }
  await run(createCordovaCommand(['platform', 'add', `android@${version}`]), { cwd: projectDir, quiet: true });
  return true;
}

async function resetAndroidPlatformIfPackageChanged(config: ThaliaConfig, projectDir: string): Promise<boolean> {
  const androidProjectDir = join(projectDir, ANDROID_PLATFORM_DIR);
  const gradleConfigPath = join(androidProjectDir, 'cdv-gradle-config.json');
  if (!existsSync(gradleConfigPath)) return false;
  const gradleConfig = JSON.parse(await readFile(gradleConfigPath, 'utf8')) as { PACKAGE_NAMESPACE?: string };
  if (gradleConfig.PACKAGE_NAMESPACE === config.apk.id) return false;
  await run(createCordovaCommand(['platform', 'remove', 'android']), { cwd: projectDir, quiet: true });
  return true;
}

async function ensureCordovaPlugins(projectDir: string): Promise<boolean> {
  let changed = false;
  for (const plugin of CORDOVA_PLUGINS) {
    const installed = join(projectDir, 'plugins', plugin.id);
    if (existsSync(installed) && (!plugin.files || (await pluginFilesMatch(plugin.source, installed, plugin.files)))) continue;
    if (existsSync(installed)) await run(createCordovaCommand(['plugin', 'remove', plugin.id]), { cwd: projectDir, quiet: true });
    await run(createCordovaCommand(['plugin', 'add', plugin.source]), { cwd: projectDir, quiet: true });
    changed = true;
  }
  return changed;
}

async function pluginFilesMatch(sourceDir: string, installedDir: string, files: string[]): Promise<boolean> {
  for (const file of files) {
    const source = join(sourceDir, file);
    const installed = join(installedDir, file);
    if (!existsSync(installed) || !(await readFile(source)).equals(await readFile(installed))) return false;
  }
  return true;
}

async function syncAndroidWww(projectDir: string): Promise<void> {
  const source = join(projectDir, 'www');
  const target = join(projectDir, ANDROID_PLATFORM_DIR, 'app/src/main/assets/www');
  await mkdir(target, { recursive: true });
  await cp(source, target, { recursive: true, force: true });
}

async function signApk(config: ThaliaConfig, unsignedApk: string, outputApk: string): Promise<void> {
  const keystore = resolve(APK_KEYSTORE);
  await ensureApkKeystore(keystore);
  const alignedApk = join(dirname(outputApk), `${safeFileName('DoL-Thalia')}.aligned.apk`);
  await run([resolveAndroidBuildTool(config, 'zipalign'), '-f', '-p', '4', unsignedApk, alignedApk], { quiet: true });
  await run(
    [
      resolveAndroidBuildTool(config, 'apksigner'),
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
  await run([resolveAndroidBuildTool(config, 'apksigner'), 'verify', '--verbose', outputApk], { quiet: true });
  await run([resolveAndroidBuildTool(config, 'zipalign'), '-c', '-p', '4', outputApk], { quiet: true });
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
  await Promise.all([
    rm(join(resDir, 'values/cdv_colors.xml'), { force: true }),
    rm(join(resDir, 'values/cdv_themes.xml'), { force: true }),
    rm(join(resDir, 'values-night/cdv_colors.xml'), { force: true }),
    rm(join(resDir, 'values-v34/cdv_colors.xml'), { force: true }),
    rm(join(resDir, 'values-night-v34/cdv_colors.xml'), { force: true })
  ]);

  const colors = `<resources xmlns:tools="http://schemas.android.com/tools">
    <color name="cdv_background_color">#000000</color>
    <color name="cdv_splashscreen_background">#000000</color>
  </resources>
  `;
  await Promise.all([
    writeXml(join(resDir, 'values/colors.xml'), colors),
    writeXml(
      join(resDir, 'values/themes.xml'),
      `<resources xmlns:tools="http://schemas.android.com/tools">
        <style name="Theme.App.SplashScreen" parent="Theme.SplashScreen">
          <item name="windowSplashScreenBackground">@color/cdv_splashscreen_background</item>
          <item name="windowSplashScreenAnimatedIcon">@drawable/empty_splash_icon</item>
          <item name="windowSplashScreenAnimationDuration">0</item>
          <item name="postSplashScreenTheme">@style/Theme.Cordova.App.DayNight</item>
          <item name="android:windowOptOutEdgeToEdgeEnforcement" tools:targetApi="35">true</item>
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
  await resizePngFile(source, target, size);
}

function createCordovaCommand(args: string[]): string[] {
  const localCli = resolve('node_modules/cordova/bin/cordova');
  if (existsSync(localCli)) return ['node', localCli, ...args];
  return [findCordovaBin(), ...args];
}

function findCordovaBin(): string {
  const bin = platform === 'win32' ? 'cordova.cmd' : 'cordova';
  const local = resolve('node_modules/.bin', bin);
  return existsSync(local) ? local : bin;
}

function resolveAndroidBuildTool(config: ThaliaConfig, tool: 'apksigner' | 'zipalign'): string {
  const suffix = platform === 'win32' ? (tool === 'apksigner' ? '.bat' : '.exe') : '';
  const name = `${tool}${suffix}`;
  const buildToolsDir = join(findAndroidSdk(), 'build-tools');
  return join(buildToolsDir, config.apk.toolchain.build_tools, name);
}

function gradleHome(config: ThaliaConfig): string {
  return resolve('.cache/android-toolchain', `gradle-${config.apk.toolchain.gradle}`);
}

// Keep Gradle's dependency cache inside .cache so an APK build never scatters
// hundreds of megabytes into the developer's home directory. Without this the
// location silently depends on the machine, and the cache cannot be cleaned
// together with the rest of .cache.
function gradleUserHome(): string {
  return resolve('.cache/gradle-user-home');
}

function findGradleExecutable(config: ThaliaConfig): string {
  const executable = platform === 'win32' ? 'gradle.bat' : 'gradle';
  return join(gradleHome(config), 'bin', executable);
}

async function ensureGradle(config: ThaliaConfig): Promise<void> {
  const executable = findGradleExecutable(config);
  if (existsSync(executable)) return;

  const version = config.apk.toolchain.gradle;
  const archive = resolve('.cache/android-toolchain/downloads', `gradle-${version}-bin.zip`);
  const downloadUrl = `https://services.gradle.org/distributions/gradle-${version}-bin.zip`;
  logInfo(`Downloading Gradle ${version}`);
  await downloadFile(downloadUrl, archive);

  const files = unzipSync(await readFile(archive));
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith('/')) continue;
    const output = resolve('.cache/android-toolchain', name);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, data);
  }
  if (platform !== 'win32') await chmod(executable, 0o755);
}

export function apkBuildStatus(config: ThaliaConfig): ApkBuildStatus {
  const javaMajor = detectJavaMajorVersion();
  if (javaMajor !== config.apk.toolchain.java) {
    return {
      canBuild: false,
      message: `JDK ${config.apk.toolchain.java} is required, found ${javaMajor ?? 'none'}. Set JAVA_HOME to a JDK ${config.apk.toolchain.java} installation.`
    };
  }
  const sdkPath = findAndroidSdk();
  if (!existsSync(sdkPath)) {
    return {
      canBuild: false,
      message: `Android SDK not found: ${sdkPath}. Set ANDROID_HOME or ANDROID_SDK_ROOT.`
    };
  }
  const platformPackage = `platforms;android-${config.apk.toolchain.sdk}`;
  if (!existsSync(join(sdkPath, 'platforms', `android-${config.apk.toolchain.sdk}`))) return missingSdkPackage(platformPackage);
  const buildToolsPackage = `build-tools;${config.apk.toolchain.build_tools}`;
  if (!existsSync(join(sdkPath, 'build-tools', config.apk.toolchain.build_tools))) return missingSdkPackage(buildToolsPackage);
  return { canBuild: true };
}

function missingSdkPackage(packageName: string): ApkBuildStatus {
  return {
    canBuild: false,
    message: `Android SDK package not found: ${packageName}. Install it with sdkmanager "${packageName}".`
  };
}

function createAndroidBuildEnvironment(config?: ThaliaConfig): Record<string, string | undefined> {
  const sdkPath = findAndroidSdk();
  const javaHome = findAndroidBuildJavaHome();
  const pathAdditions = [join(sdkPath, 'cmdline-tools/latest/bin'), join(sdkPath, 'platform-tools'), ...(config ? [join(gradleHome(config), 'bin')] : []), join(javaHome ?? '', 'bin')].filter(path =>
    existsSync(path)
  );

  return {
    ANDROID_HOME: sdkPath,
    ANDROID_SDK_ROOT: sdkPath,
    GRADLE_USER_HOME: gradleUserHome(),
    JAVA_HOME: javaHome,
    PATH: prependPathEntries(pathAdditions),
    Path: prependPathEntries(pathAdditions)
  };
}

function detectJavaMajorVersion(): number | undefined {
  const javaHome = findAndroidBuildJavaHome();
  const java = javaHome ? join(javaHome, 'bin', platform === 'win32' ? 'java.exe' : 'java') : 'java';
  const result = Bun.spawnSync([java, '-version'], { stderr: 'pipe', stdout: 'pipe' });
  if (result.exitCode !== 0) return undefined;
  const output = `${result.stdout.toString()}${result.stderr.toString()}`;
  const version = output.match(/version "(?:1\.)?(\d+)/)?.[1];
  return version ? Number(version) : undefined;
}

function prependPathEntries(additions: string[]): string {
  const delimiter = platform === 'win32' ? ';' : ':';
  return `${additions.join(delimiter)}${delimiter}${Bun.env.PATH ?? Bun.env.Path ?? ''}`;
}

function findAndroidSdk(): string {
  if (Bun.env.ANDROID_HOME) return Bun.env.ANDROID_HOME;
  if (Bun.env.ANDROID_SDK_ROOT) return Bun.env.ANDROID_SDK_ROOT;
  if (platform === 'win32') return join(Bun.env.LOCALAPPDATA ?? homedir(), 'Android/Sdk');
  if (platform === 'darwin') return join(homedir(), 'Library/Android/sdk');
  return join(homedir(), 'Android/Sdk');
}

function findKeytoolBin(): string {
  const javaHome = findAndroidBuildJavaHome();
  const keytool = platform === 'win32' ? 'keytool.exe' : 'keytool';
  const candidate = javaHome ? join(javaHome, 'bin', keytool) : '';
  return candidate && existsSync(candidate) ? candidate : keytool;
}

function findAndroidBuildJavaHome(): string | undefined {
  if (Bun.env.JAVA_HOME) return Bun.env.JAVA_HOME;
  const androidStudioJbr = 'C:\\Program Files\\Android\\Android Studio\\jbr';
  return existsSync(androidStudioJbr) ? androidStudioJbr : undefined;
}

const CORDOVA_ADDITIONS = `
document.addEventListener('deviceready', () => {
  let lastBackEvent = 0;
  const { rnk, saveDialog } = cordova.plugins;
  const browserSaveAs = window.saveAs;
  const Toast = window.Toast = rnk.toast;

  if (saveDialog) window.saveAs = (blob, name) => blob instanceof Blob
    ? saveDialog.saveFile(blob, name).catch(error => {
      if (/cancelled/i.test(String(error))) return;
      console.error('[DoL-Thalia] Save failed:', error);
      Toast.showToast('Save failed', Toast.LONG);
    })
    : browserSaveAs?.(blob, name);

  document.addEventListener('backbutton', ev => {
    ev.preventDefault();
    const dialog = window.SugarCube?.Dialog;
    if (dialog?.isOpen()) dialog.close();
    else if (window.T?.currentOverlay) closeOverlay();
    else if (Date.now() > lastBackEvent + 3500) {
      Toast.showToast('再次点击返回键退出', Toast.LONG);
      lastBackEvent = Date.now();
    } else navigator.app.exitApp();
  }, false);
}, false);
`;
