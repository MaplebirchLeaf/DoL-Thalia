# DoL-Thalia

简体中文 | [English](README.md)

[![游戏](https://img.shields.io/badge/Game-Degrees%20of%20Lewdity-purple)](https://gitgud.io/Vrelnir/degrees-of-lewdity)
[![汉化](https://img.shields.io/badge/CHS-Localization-red)](https://github.com/Eltirosto/Degrees-of-Lewdity-Chinese-Localization)
[![ModLoader](https://img.shields.io/badge/SC2-ModLoader-blue)](https://github.com/MaplebirchLeaf/sugarcube-2-ModLoader)
[![发布版](https://img.shields.io/github/v/release/MaplebirchLeaf/DoL-Thalia?label=release)](https://github.com/MaplebirchLeaf/DoL-Thalia/releases/latest)

DoL-Thalia 是一个面向 [Degrees of Lewdity](https://gitgud.io/Vrelnir/degrees-of-lewdity) 的构建与发布工具。它将游戏本体、SugarCube、定制版 ModLoader、汉化资源和可选美化包组合成可游玩的 HTML、ZIP 与 Android APK。

这是非官方第三方项目，不由 Degrees of Lewdity 原作者、汉化组或整合内容的模组作者维护或背书。

## 下载与游玩

可以在 [DoL-Thalia Hub](https://maplebirchleaf.github.io/DoL-Thalia/) 比较不同组合，也可以直接前往 [GitHub Releases](https://github.com/MaplebirchLeaf/DoL-Thalia/releases) 下载。

- **ZIP：** 解压后使用浏览器打开其中的 HTML 文件。Release ZIP 是完整游戏包，不要作为 ModLoader 模组导入。
- **APK：** 安装到 Android 设备游玩。更新或卸载前请先导出存档。
- **在线版：** 适合快速使用，可能只提供默认组合。

浏览器和 Android WebView 的存档依赖本地站点数据。清理浏览器数据、卸载 APK、切换版本或更换设备前，请先在游戏内导出存档。

## 问题反馈

如果问题涉及汉化内容，请先在汉化仓库发布的版本或汉化在线版中复现。

- 汉化原版也有相同问题时，优先向汉化项目反馈。
- 只有 DoL-Thalia 出现问题时，在本仓库反馈。
- 问题来自特定可选模组或美化包时，先查看对应项目的说明。

反馈时请附上游戏版本、preset、包类型、运行平台和完整复现步骤。

## 开发环境

基本要求：

- [Bun](https://bun.sh/) 1.4.2 或更高版本
- Git
- 用于 Cordova 和上游 ModLoader 构建工具的 Node.js 20.17+ 或 22.9+
- 仅在构建 APK 时需要 JDK 17 和 Android SDK 35

克隆仓库并安装依赖：

```bash
git clone https://github.com/MaplebirchLeaf/DoL-Thalia.git
cd DoL-Thalia
git submodule update --init vendor/sugarcube-2-ModLoader
bun install --frozen-lockfile
```

首次准备本地工具链，然后执行快速开发构建：

```bash
bun run build:env
bun run build:local
```

标准版可以使用放在 `input/game/` 下的游戏 ZIP。没有匹配的本地 ZIP 时，标准版构建可以下载并编译配置中的上游游戏版本。DoLP 游戏包需要放在 `input/game-dolp/` 下。

## 常用命令

| 命令                  | 用途                                                        |
| --------------------- | ----------------------------------------------------------- |
| `bun run build:env`   | 准备 SugarCube、ModLoader、Story Format、构建工具和内置模组 |
| `bun run build:local` | 使用已有环境快速构建本地 HTML                               |
| `bun run build:html`  | 为指定版本和 preset 快速构建 HTML                           |
| `bun run build:zip`   | 执行完整正式构建并生成 ZIP                                  |
| `bun run build:apk`   | 执行完整正式构建并生成 APK                                  |
| `bun run build:all`   | 构建 HTML、ZIP 和 APK 正式产物                              |
| `bun run check`       | 执行 TypeScript、lint 和格式检查                            |
| `bun run site:dev`    | 启动本地发布站点                                            |
| `bun run site:build`  | 构建发布站点                                                |

示例：

```bash
bun run build:html --preset=chs --version=0.5.12.10
bun run build:zip --preset=vanilla --version=0.5.12.10
bun run build:apk --preset=chs --version=0.5.12.10
bun run build:local --game=dolp
```

命令参数、构建流程、私有模组源和 Android SDK 配置见[文档索引](docs/README.md)。

## 目录结构

| 路径                 | 职责                                          |
| -------------------- | --------------------------------------------- |
| `src/commands/`      | 命令入口与参数解析                            |
| `src/builders/`      | Story、ModLoader、HTML、ZIP 和 APK 构建阶段   |
| `src/sources/`       | 游戏、模组和上游源码同步                      |
| `input/modList.json` | 发布组合定义                                  |
| `thalia.config.toml` | 游戏变体、来源、输出路径和 Android 工具链版本 |
| `site/`              | DoL-Thalia Hub 源码与发布数据                 |

生成的文件位于 `dist/`，本地缓存和生成的 Cordova 工程位于 `.cache/`。

## 相关项目

- [Degrees of Lewdity](https://gitgud.io/Vrelnir/degrees-of-lewdity)
- [Degrees of Lewdity 汉化项目](https://github.com/Eltirosto/Degrees-of-Lewdity-Chinese-Localization)
- [Thalia ModLoader 分支](https://github.com/MaplebirchLeaf/sugarcube-2-ModLoader)
- [maplebirchFramework](https://github.com/MaplebirchLeaf/SCML-DOL-maplebirchFramework)
- [DoL-Lyra](https://github.com/DoL-Lyra/Lyra)

## 许可

仓库代码使用 [MIT License](LICENSE)。发布包中的游戏内容、汉化数据、模组和美术资源仍分别遵循各自上游项目的许可与条款；适用部分另见 [LICENSE-CC-BY-NC-SA-4.0](LICENSE-CC-BY-NC-SA-4.0)。
