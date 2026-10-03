# 构建流程

DoL-Thalia 把工具链准备和成品组装分开。正式 Release 会按需执行全部阶段，本地 HTML 命令可以复用缓存。

```text
上游仓库与本地输入
  -> Story Format / ModLoader 工具 / 基础模组
  -> 游戏 HTML
  -> 注入 ModLoader 与基础模组
  -> 注入组合需要的外部模组
  -> 可选压缩
  -> HTML / ZIP / APK
```

## 输入来源

| 输入                 | 默认位置或来源                                              |
| -------------------- | ----------------------------------------------------------- |
| 标准版游戏 ZIP       | `input/game/`                                               |
| DoLP 游戏 ZIP        | `input/game-dolp/`                                          |
| 外部模组缓存         | `input/mods/<version>/`                                     |
| DoLP 外部模组缓存    | `input/mods-dolp/<version>/`                                |
| 发布组合定义         | `input/modList.json`；可用 `base_mods` 声明各组合共享的模组 |
| ModLoader 与基础模组 | `vendor/sugarcube-2-ModLoader` Git submodule                |
| SugarCube            | `thalia.config.toml` 中配置的上游仓库                       |
| 可下载的外部模组     | `[mod_sources.*]`                                           |

`input/game/`、`input/game-dolp/`、`input/mods/`、`input/mods-dolp/` 和 `input/signing/` 都是本地私有输入，不会提交到 Git。标准版缺少匹配的本地游戏 ZIP 时，构建器优先读取 Vrelnir 官方站点的对应版本普通发行包。站点不提供指定版本时，再下载并编译官方对应版本源码；DoLP 缺少本地包时，从官方 GitGud Release 按版本只下载 `DoLP_Vanilla`，不使用发行方预装美化的包。

## 两类模组

基础模组来自 ModLoader 的 `modList.json`。`builtin-mods` 阶段构建这些子模块，HTML 阶段将生成的 `.mod.zip` 直接嵌入游戏。

外部模组由发布组合引用，并通过 `[mod_sources.*]` 定位。构建器优先复用版本目录中名称、扩展名和版本匹配的本地文件；本地缺失时才使用 URL 或 GitHub Release 下载。没有本地文件，也没有下载来源时，构建会失败。

`--pure` 和 `--vanilla` 是开发参数，表示完全不注入 ModLoader。它们与发布组合名称无关。

## HTML、ZIP 与 APK

- HTML 是所有发布目标的基础产物，默认写入 `dist/html/index.html`。
- ZIP 收集 HTML 目录，重命名入口 HTML，并写入 `dist/zip/`。
- APK 把同一 HTML 目录复制进 Cordova 工程，应用图标和启动主题，然后使用 Android 工具链构建、对齐并签名。

`build:html`、网页游玩页和 APK 会在注入完成后，将 SugarCube 的普通脚本及连续的游戏样式拆到 HTML 同目录下的固定名称文件；检测到 ModLoader 前置脚本时也会拆出。外链仍按原位置同步执行；Twine 用户脚本、用户样式与内嵌模组数据保持内联，供 ModLoader 读取。发布 ZIP 保留原来的单文件 HTML 入口。拆分只改变文件组织，不会减少 ZIP/APK 中需要携带的数据总量。

20 个 ModLoader 基础模组已经内嵌在 HTML 和 APK 中，运行时不会下载。缺失依赖需要按模组 `downloadUrl` 下载时，HTML/ZIP 使用 `THALIA_MOD_PROXY_URL` 配置的代理处理浏览器 CORS；APK 会移除该代理配置，通过内置 Android 下载器直连 GitHub Release，因此不会消耗 Cloudflare Worker 请求。APK 原生下载仅接受 HTTPS GitHub Release 的 `.mod.zip` 文件，不会在失败时自动回退到 Worker。

APK 下载先写入应用私有临时文件，再以 256 KiB 分块传入 WebView，避免 Java 和桥接层同时持有整份 ZIP。单份下载上限为 128 MiB，支持进度和取消，完成、失败或页面重置后清理临时文件。最终安装仍需在 WebView 中解析 ZIP，因此该上限不是应用总内存上限。

正式构建默认压缩 SugarCube 主脚本。`--fast` 只用于本地排查或快速验证，不应作为最终发布质量的默认值。

## 缓存与清理

`.cache/` 整体是纯缓存：删除任意子目录都不会损坏仓库，构建会自行重建缺失内容。它不进入 Git，可以随时整体删除来回收空间（完整 APK 工具链可达数 GB）。

| 目录                           | 内容                                        | 删除后                       |
| ------------------------------ | ------------------------------------------- | ---------------------------- |
| `.cache/build/`                | 依赖安装与内嵌模组构建指纹                  | 重新安装依赖并重建内嵌模组   |
| `.cache/apk/`                  | 生成的 Cordova Android 工程                 | 重新创建工程并执行 `prepare` |
| `.cache/android-toolchain/`    | 构建脚本下载的 Gradle 发行包                | 重新下载 Gradle              |
| `.cache/gradle-user-home/`     | Gradle 依赖缓存，由 `GRADLE_USER_HOME` 指向 | 重新下载 Android 依赖        |
| `.cache/html/`、`.cache/site/` | HTML 组装与标准版源码编译的中间产物         | 重新组装或重新编译           |

`.cache/gradle-user-home/` 显式写入构建环境，因此 APK 构建不会把依赖写进用户主目录，缓存也能随 `.cache` 一并清理。

`dist/` 是最终构建产物，不是缓存：完整、未限定范围的本地 `build:all` 会清理旧 ZIP 和 APK 输出；限定版本、组合或目标时会保留其他产物。

## 本地与 GitHub Actions

GitHub Actions 只能读取已检出的仓库、公开下载源、构建 Secret 和显式授权的私有仓库，不能访问开发者电脑中的 `input/` 文件。需要私有外部资源时，使用[私有模组源](private-mod-sources.md)；若资源不能上传到任何云端位置，必须在本地构建并手动发布产物。

HTML/ZIP 的 Worker 地址通过仓库 Actions Variable `THALIA_MOD_PROXY_URL` 配置，本地使用忽略的 `.env` 中的同名变量。它不是访问令牌；地址会随网页产物分发。工作流在发布前检查构建代码、原生下载和三个运行时子仓库的回归测试。

常用入口和参数见[命令参考](commands.md)，APK 环境见[Android APK 环境](android-build.md)。

## 站点与在线游戏

`site:data` 只同步组合和 GitHub Release 元数据。`site:build` 执行 `site:data` 后用 Vite 构建站点，使用已有的 `site/public/` 文件；这两个命令不会下载或构建游戏。`site:play` 显式构建 `play/en/index.html` 和 `play/chs/index.html`，Release 工作流按 `site:play` → `site:build` → 在线产物审计的顺序部署 Pages。

两个在线入口均为原版游戏加 20 个 ModLoader 内置模组，中英文使用各自的 SugarCube i10n。中文入口只汉化 SugarCube UI，不预装剧情汉化 `ModI18N` 或其他外部模组。

## 语言职责

TypeScript 的 `src/core/`、`src/sources/` 和 `src/builders/` 负责配置、来源与构建，`src/release/plan.ts` 和 `protocol.ts` 为构建、工作流和站点提供同一发布计划及标签／附件协议。Vue/TypeScript 页面只呈现数据；Python 的 `tools/audit_release.py` 独立只读审计成品归档；Java 的 Cordova 插件负责原生下载与 WebView 桥接。功能按职责放置，既有实现语言保持不变。

## 当前发布组合

标准版使用 `input/modList.json`，提供基础整合、女性 Goose＋Mysterious、男性 Goose＋Mysterious三种组合的英文与汉化版本，共 6 套配置。DoLP 使用 `input/modList-dolp.json`，提供这三种组合的英文版本，不包含 ModI18N。女性 Goose、男性 Goose 和 Mysterious 的素材源仍用于组合包。
