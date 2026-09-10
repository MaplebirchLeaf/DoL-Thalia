# Android APK 构建环境

DoL-Thalia 的 Android 工具链版本统一记录在 `thalia.config.toml` 的 `[apk.toolchain]`：

| 工具                       | 固定版本                                              |
| -------------------------- | ----------------------------------------------------- |
| Cordova Android            | 14.0.1                                                |
| JDK                        | 17                                                    |
| Android SDK Platform       | 35 (`platforms;android-35`)                           |
| Android SDK Build Tools    | 35.0.0 (`build-tools;35.0.0`)                         |
| Android Command-line Tools | 15859902                                              |
| Gradle                     | 8.13，由构建脚本下载并用于生成 Cordova Gradle wrapper |

构建脚本会检查 JDK、SDK Platform 和 Build Tools，并把配置指定的 Gradle 下载到忽略的 `.cache/android-toolchain`。缺少项目时，`bun run build:apk` 会直接显示应传给 `sdkmanager` 的包名。

版本依据：

- [cordova-android 14.0.1 README](https://github.com/apache/cordova-android/blob/14.0.1/README.md#requirements)
- [cordova-android 14.0.1 默认构建配置](https://github.com/apache/cordova-android/blob/14.0.1/framework/cdv-gradle-config-defaults.json)
- [Android sdkmanager 官方说明](https://developer.android.com/tools/sdkmanager)
- [Android Command-line Tools 官方下载页](https://developer.android.com/studio#command-tools)

## Linux

先安装 JDK 17、`curl` 和 `unzip`。Debian/Ubuntu 可执行：

```bash
sudo apt update
sudo apt install -y openjdk-17-jdk curl unzip
```

下载 Android Command-line Tools，并安装仓库要求的 SDK 包：

```bash
export ANDROID_SDK_ROOT="$HOME/Android/Sdk"
export ANDROID_HOME="$ANDROID_SDK_ROOT"
export JAVA_HOME="/usr/lib/jvm/java-17-openjdk-amd64"

curl -L "https://dl.google.com/android/repository/commandlinetools-linux-15859902_latest.zip" \
  -o /tmp/android-command-line-tools.zip
mkdir -p "$ANDROID_SDK_ROOT/cmdline-tools"
unzip -q /tmp/android-command-line-tools.zip -d "$ANDROID_SDK_ROOT/cmdline-tools"
mv "$ANDROID_SDK_ROOT/cmdline-tools/cmdline-tools" "$ANDROID_SDK_ROOT/cmdline-tools/latest"

export PATH="$JAVA_HOME/bin:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$ANDROID_SDK_ROOT/platform-tools:$PATH"
yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"
```

把上面的 `JAVA_HOME`、`ANDROID_HOME`、`ANDROID_SDK_ROOT` 和 `PATH` 配置追加到 shell 启动文件，例如 `~/.bashrc`。

## macOS

安装 JDK 17：

```bash
brew install openjdk@17
```

下载 Command-line Tools。下面的命令会按 Apple Silicon 或 Intel 自动选择安装包：

```bash
export ANDROID_SDK_ROOT="$HOME/Library/Android/sdk"
export ANDROID_HOME="$ANDROID_SDK_ROOT"
export JAVA_HOME="$(/usr/libexec/java_home -v 17)"

case "$(uname -m)" in
  arm64) tools_arch="mac_arm64" ;;
  x86_64) tools_arch="mac_x86_64" ;;
  *) echo "Unsupported macOS architecture: $(uname -m)" >&2; exit 1 ;;
esac

curl -L "https://dl.google.com/android/repository/commandlinetools-${tools_arch}-15859902_latest.zip" \
  -o /tmp/android-command-line-tools.zip
mkdir -p "$ANDROID_SDK_ROOT/cmdline-tools"
unzip -q /tmp/android-command-line-tools.zip -d "$ANDROID_SDK_ROOT/cmdline-tools"
mv "$ANDROID_SDK_ROOT/cmdline-tools/cmdline-tools" "$ANDROID_SDK_ROOT/cmdline-tools/latest"

export PATH="$JAVA_HOME/bin:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$ANDROID_SDK_ROOT/platform-tools:$PATH"
yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"
```

## Windows PowerShell

先安装 JDK 17：

```powershell
winget install EclipseAdoptium.Temurin.17.JDK
```

重新打开 PowerShell，然后安装 Android Command-line Tools 和 SDK 包：

```powershell
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
$archive = "$env:TEMP\android-command-line-tools.zip"

Invoke-WebRequest `
  -Uri "https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip" `
  -OutFile $archive
New-Item -ItemType Directory -Force "$sdk\cmdline-tools" | Out-Null
Expand-Archive -Force $archive "$sdk\cmdline-tools"
Move-Item -Force "$sdk\cmdline-tools\cmdline-tools" "$sdk\cmdline-tools\latest"

[Environment]::SetEnvironmentVariable("ANDROID_HOME", $sdk, "User")
[Environment]::SetEnvironmentVariable("ANDROID_SDK_ROOT", $sdk, "User")
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:Path = "$sdk\cmdline-tools\latest\bin;$sdk\platform-tools;$env:Path"

sdkmanager.bat --licenses
sdkmanager.bat "platform-tools" "platforms;android-35" "build-tools;35.0.0"
```

如果 `JAVA_HOME` 没有由安装器自动设置，把它指向 Temurin 17 的安装目录，并重新打开终端。

## 检查与构建

```bash
java -version
sdkmanager --list_installed
bun run build:apk --version=0.5.12.10
```

GitHub Actions 使用同一组固定值：JDK 17、Android 35 和 Build Tools 35.0.0，并通过 `sdkmanager` 补齐 SDK 包。签名仍使用仓库 Secret `THALIA_KEYSTORE_BASE64`。
