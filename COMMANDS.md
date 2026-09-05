# DoL-Thalia 生态命令速查

> 面向 DoL-Thalia、上游源码与模组仓库的开发/构建命令速查。

## 包管理约定

- **DoL-Thalia（本仓库）**：`bun`
- **sugarcube-2-ModLoader 与各模组仓库**：`corepack yarn`
- **sugarcube-2-vrelnir**：`bun` 安装依赖，`node build.js` 构建故事格式

---

## 0. 仓库全景

| 仓库 | 角色 | 来源 |
|---|---|---|
| `MaplebirchLeaf/DoL-Thalia` | 整合包发布工程（本仓库） | GitHub |
| `MaplebirchLeaf/sugarcube-2-ModLoader` | ModLoader 运行时 + 20 个内置模组载体（fork） | GitHub，`thalia` 分支 |
| `Vrelnir/sugarcube-2` | SugarCube2 故事格式源码 | gitgud.io，`new-year-new-rebase` 分支 |
| `Eltirosto/Degrees-of-Lewdity-Chinese-Localization` | 汉化资源：GameOriginalImagePack / ModI18N | GitHub Release |
| `MaplebirchLeaf/SCML-DOL-maplebirchFramework` | maplebirch 框架模组 | GitHub Release |
| 20 个内置模组仓库 | 模组源码 | GitHub，见 §4 |
| `MaplebirchLeaf/sugarcube-2-ModLoaderGui` | 游戏内模组管理 GUI | 内置模组 |
| `Lyoko-Jeremie/ModSubUiAngularJs` | 启用 / 禁用 / 排序 UI | 内置模组 |

---

## 1. 最常用流程

| 场景 | 命令 |
|---|---|
| 新 clone 后初始化 | `git submodule update --init vendor/sugarcube-2-ModLoader` → `bun install` → `bun run prepare:local` |
| 本地快速测试 HTML | `bun run build:local --fast` |
| 正式单文件 HTML | `bun run build:html --preset=chs --version=0.5.11.9 --fast` |
| 全量 release | `bun run build:all --version=0.5.11.9` |
| 仅构建部分 prepare 步骤 | `bun run build:env sugarcube story-format` |
| 已有 dist，跳过 prepare | 在 build 命令后加 `--skip-prepare` |
| 调试时跳过 minify | 在 build 命令后加 `--fast` |

> `build:local` 不内嵌外部图包/i18n；`build:html` 会按 preset 内嵌；`build:all` 用于批量 release。

---

## 2. DoL-Thalia（本仓库）

### 2.1 命令总表

| 命令 | 用途 | 示例 |
|---|---|---|
| `bun install` | 安装根依赖 | `bun install` |
| `bun run prepare:local` | 一次拉取/构建全部上游产物，等价于完整 prepare | `bun run prepare:local` |
| `bun run build:env` | 直接执行 prepare 步骤 | `bun run build:env` |
| `bun run build:local` | 构建本地 HTML，不内嵌外部图包/i18n | `bun run build:local --fast` |
| `bun run build:html` | 构建单文件 HTML，并按 preset 内嵌资源 | `bun run build:html --preset=chs --version=0.5.11.9 --fast` |
| `bun run build:all` | 批量构建 versions × presets × targets | `bun run build:all --version=0.5.11.9 --preset=chs --target=html,zip --fast` |
| `bun run check` | `tsc --noEmit && oxlint && oxfmt --check` | `bun run check` |
| `bun run fix` | `oxlint --fix && oxfmt` | `bun run fix` |
| `bun run site:dev` | 发布站点开发 | `bun run site:dev` |
| `bun run site:build` | 构建发布站点 | `bun run site:build` |
| `bun run site:preview` | 预览发布站点 | `bun run site:preview` |

`build:env` 可指定 prepare 步骤：

```text
sugarcube
modloader
mod-sources
story-format
modloader-tools
builtin-mods
all
vanilla
```

格式开关：

```text
--no-modloader
--no-i10n
--modloader-only
--i10n-only
--plain
```

### 2.2 Build 参数

| 参数 | 适用命令 | 含义 |
|---|---|---|
| `--game=<name>` | `build:local` / `build:html` / `build:all` | 游戏变体，如 `standard` / `dolp`；默认 `standard` |
| `--preset=<name>` / `--config=<name>` | `build:html` / `build:all` | `input/modList.json` 中的组合名 |
| `--version=<ver>` | `build:html` / `build:all` | 单个目标游戏版本 |
| `--versions=<v1,v2>` | `build:all` | 多版本 release |
| `--target=<type>` / `--targets=<...>` | `build:all` | `html` / `zip` / `apk`，可逗号多值 |
| `--html` / `--zip` / `--apk` | `build:all` | target 快捷开关 |
| `--prepare=<steps>` | 三个 build 命令 | 仅执行指定 prepare 步骤，逗号分隔 |
| `--skip-prepare` | 三个 build 命令 | 跳过 prepare，复用已有 `dist` |
| `--fast` | 三个 build 命令 | 跳过 HTML/JS minify，适合调试 |
| `--pure` / `--vanilla` | 三个 build 命令 | 不注入 ModLoader，不内嵌外部包，只生成原版 HTML |
| `--skip-mod-sources` | `build:all` | 跳过 GitHub Release 资产同步 |

preset 当前包括：

```text
vanilla
chs
chs-au-f
chs-au-m
chs-au-a
chs-goose-f
chs-goose-m
```

> `--preset` / `--version` 只对 `build:html`、`build:all` 生效。  
> `build:local` 的组合与版本来自 `thalia.config.toml`：`game.default_mod_list`、`game.version` 或 `[games.*]` 变体。

### 2.3 输入 / 输出

| 路径 | 内容 |
|---|---|
| `input/game/*.zip` | 标准版游戏本体，文件名包含版本，如 `0.5.11.9` |
| `input/game-dolp/*.zip` | DoLP 游戏本体，见 §10；已 gitignore |
| `input/mods/<version>/*.mod.zip` | 汉化图包 / i18n / maplebirch 等外部资源 |
| `input/modList.json` | preset 定义：`name` / `title_en` / `title_cn` / `mods` |
| `dist/story-format/sugarcube-2/format.js` | 注入钩子后的 SugarCube 故事格式 |
| `dist/html/` | HTML 构建结果及 ZIP/APK 素材 |

### 2.4 沙箱 / 受限环境

正常本机无需处理。若 `bun` / `corepack` / `yarn` 因临时目录报错，可将以下目录指向工作区内：

```text
BUN_TMPDIR
BUN_INSTALL_CACHE_DIR
COREPACK_HOME
YARN_CACHE_FOLDER
YARN_GLOBAL_FOLDER
```

例如统一放到 `.cache/...`。

根 `package.json` 为 `type: module` 时，`.cache/corepack/package.json` 需要：

```json
{"type":"commonjs"}
```

否则 Yarn 3 的 CJS 包可能被当作 ESM 加载。

---

## 3. `vendor/sugarcube-2-ModLoader`

工作目录：

```text
vendor/sugarcube-2-ModLoader
```

| 目的 | 命令 | 产物 / 说明 |
|---|---|---|
| 检出 ModLoader 子模块 | `git submodule update --init vendor/sugarcube-2-ModLoader` | 在主仓库执行；fork 的 `thalia` 分支 |
| 拉取内置模组源码 | `git submodule update --init --recursive mod/…` | `mod/*/` |
| 安装依赖 | `corepack yarn install` | `nodeLinker: node-modules` |
| 编译 BeforeSC2 | `corepack yarn run ts:BeforeSC2` | `dist-BeforeSC2/*`，含类型 |
| 打包 BeforeSC2 | `corepack yarn run webpack:BeforeSC2` | `dist-BeforeSC2/BeforeSC2.js` |
| 编译 ForSC2 | `corepack yarn run ts:ForSC2` | — |
| 打包构建期工具 | `corepack yarn run webpack:insertTools` | `dist-insertTools/*` |

这些脚本由 DoL-Thalia 的 `modloader-tools` prepare 步骤调用。

关键产物：

- `BeforeSC2.js`：运行时，注入最终 HTML。
- `dist-insertTools/`：构建期工具，如 `insert2html`、`sc2ReplaceTool`、`packModZip`。
- `modList.json`：内置模组清单。
- `mod/*/boot.json`：各模组加载元数据。

---

## 4. `vendor/sugarcube-2-vrelnir`

工作目录：

```text
vendor/sugarcube-2-vrelnir
```

| 目的 | 命令 | 产物 |
|---|---|---|
| 安装依赖 | `bun install` | `node_modules` |
| 重编故事格式 | `node build.js -d -u -b 2` | `build/twine2/sugarcube-2/format.js` |

DoL-Thalia 的 `story-format` prepare 步骤会执行该构建，再将结果处理为 `dist/story-format` 版本，并注入 ModLoader / i18n 启动钩子。

---

## 5. 内置模组

每个 `mod/<Name>` 都是独立 Git 子模块，来源见 `.gitmodules`。

> DoL-Thalia 构建时按需调用；缺少对应脚本时跳过。各模组仓库的 `package.json` 属于上游，不要为整合工程随意修改。

### 5.1 常见脚本

| 命令 | 用途 |
|---|---|
| `corepack yarn run ts:type` | 类型生成；部分仓库不存在 |
| `corepack yarn run build:type` | 类型构建；部分仓库不存在 |
| `corepack yarn run build:ts` | TypeScript → `dist` |
| `corepack yarn run build:webpack` | webpack 打包 |
| `corepack yarn run build` | 模组最终构建 |
| `node ../dist-insertTools/packModZip.js boot.json` | 在模组目录打包 `<name>.mod.zip` |

### 5.2 内置模组仓库

| 模组 | 仓库 |
|---|---|
| ModLoaderGui | `MaplebirchLeaf/sugarcube-2-ModLoaderGui` |
| ModSubUiAngularJs | `Lyoko-Jeremie/ModSubUiAngularJs` |
| ConflictChecker | `Lyoko-Jeremie/ConflictCheckerAddon` |
| BeautySelectorAddon | `MaplebirchLeaf/DoL_BeautySelectorAddonMod` |
| CheckGameVersion | `Lyoko-Jeremie/Degrees-of-Lewdity_Mod_CheckGameVersion` |
| CheckDoLCompressorDictionaries | `Lyoko-Jeremie/Degrees-of-Lewdity_Mod_CheckDoLCompressorDictionaries` |
| TweeReplacerLinker | `Lyoko-Jeremie/TweeReplacerLinkerAddon` |
| TweeReplacer | `Lyoko-Jeremie/Degrees-of-Lewdity_Mod_TweeReplacer` |
| I18nTweeReplacer | `Lyoko-Jeremie/I18nTweeReplacerMod` |
| I18nTweeList | `Lyoko-Jeremie/I18nTweeListAddonMod` |
| I18nScriptList | `Lyoko-Jeremie/I18nScriptListAddonMod` |
| ReplacePatch | `Lyoko-Jeremie/Degrees-of-Lewdity_Mod_ReplacePatch` |
| TweePrefixPostfixAddon | `Lyoko-Jeremie/TweePrefixPostfixAddonMod` |
| Diff3WayMerge | `MaplebirchLeaf/Mod_Diff3WayMerge` |
| DoLTimeWrapperAddon | `Lyoko-Jeremie/DoLTimeWrapperAddonMod` |
| ModdedClothesAddon | `Lyoko-Jeremie/DoL_ModdedClothesAddon` |
| ModdedHairAddon | `Lyoko-Jeremie/DoL_ModdedHairAddon` |
| ModdedFeatsAddon | `Lyoko-Jeremie/DoL_ModdedFeatsAddon` |
| SweetAlert2Mod | `Lyoko-Jeremie/SweetAlert2Mod` |
| DoLLinkButtonFilter | `Lyoko-Jeremie/DoLLinkButtonFilter` |

---

## 6. 外部 Release 资源

| 仓库 | 资产命名 | 用途 |
|---|---|---|
| `Eltirosto/Degrees-of-Lewdity-Chinese-Localization` | `GameOriginalImagePack-<ver>.mod.zip` / `ModI18N-<ver>-chs-<n>.mod.zip` | 原版图包 + 汉化 |
| `MaplebirchLeaf/SCML-DOL-maplebirchFramework` | `maplebirch-<ver>-v<n>.mod.zip` | maplebirch 框架 |

`syncModSources` 会根据 preset 关键字将资产下载到：

```text
input/mods/<version>/
```

运行时通过：

```text
window.modDataValueZipListIndexDB
```

导入 IndexedDB，并按 bundled / readonly 资源处理。

当前只有上述两个仓库提供构建期 Release 资产；其余 20 个内置模组直接从源码子模块构建，不依赖各自上游 Release。

---

## 7. ModLoaderGui 单独构建

工作目录：

```text
vendor/sugarcube-2-ModLoader/mod/ModLoaderGui
```

| 目的 | 命令 |
|---|---|
| 安装依赖 | `corepack yarn install` |
| 编译 TS | `corepack yarn run build:ts` |
| webpack 打包 | `corepack yarn run build:webpack` |
| 重打包 `.mod.zip` | `node ../../dist-insertTools/packModZip.js boot.json` |

也可直接回到 DoL-Thalia 重跑：

```bash
bun run src/commands/prepare.ts builtin-mods
```

---

## 8. 游戏内模组覆盖 / 更新

当前行为：

- ModLoaderGui 可将 `.mod.zip` 导入 IndexedDB。
- 禁用 / 启用 / 排序继续使用 ModSubUi 的 enable-order UI。
- 移除列表通过 `listSideLoadModNameCanUnload` 过滤 readonly 模组。
- GUI 不新增额外配置项。

同名覆盖语义：

- 导入与内置同名的新版本后，**导入版优先，并在重启后继续生效**。
- 内置默认模组为 readonly：不可删除，但可禁用 / 启用。

实现机制：

- IndexedDB pinned 键：`modDataIndexDBZipPinned`
- `addMod()`：导入同名内置模组时自动 pin。
- `syncBundledModList()`：不会覆盖或清理已 pin 的用户版本。
- `resetBundledModToDefault(name)`：恢复内置默认版本。

API 原则：

> 不修改上游接口签名；不为了 fork 功能在 `ModLoadController` 增加薄透传。需要时直接调用 `IndexDBLoader` 静态 API。

---

## 9. 验证与性能基线

基线版本：`0.5.11.9`，快照日期：`2026-09-05`。

### 构建确定性

以下命令连续构建两次，产物字节一致：

```bash
bun run build:html --preset=chs --version=0.5.11.9 --skip-prepare --fast
```

记录的 SHA-256：

```text
56096e75…
```

### 启动埋点

DevTools Console 会输出：

```text
[DoL-Thalia boot] modloader-start
[DoL-Thalia boot] modloader-init-done
[DoL-Thalia boot] preload-done
[DoL-Thalia boot] modloader-failed-fallback
```

每条记录包含：

- 当前阶段增量：`+N.NNs`
- 启动累计：`(cum X.XXs)`

### Headless 冒烟测试

建议通过 HTTP 服务访问；`file://` 会导致 RemoteLoader 的 `fetch` 报错，但该错误会被捕获。

```bash
chrome-headless-shell \
  --headless \
  --no-sandbox \
  --enable-logging=stderr \
  --user-data-dir=<dir> \
  http://127.0.0.1:<port>/index.html
```

通过基准：

- 三段主要启动标记全部到达。
- 无 `Uncaught`。
- 2026-09-05 引擎级验证通过。

### 当前载荷快照

`dist/html/index.html` 未 minify 时约 **98.3 MB**。

主要载荷：

| 项目 | 大小 |
|---|---:|
| 20 个内置模组 | 约 6.4 MB |
| GameOriginalImagePack | 约 13.1 MB，20,723 文件 |
| ModI18N | 约 13.5 MB；其中 `i18n.json` 解压约 66.9 MB |
| maplebirch | 约 0.18 MB |

正式发行时再压缩 script 块。

---

## 10. DoLP 变体构建

| 项 | 值 |
|---|---|
| 输入 | `input/game-dolp/DoLP_Vanilla_v0.775.zip` |
| 版本匹配 | 文件名包含 `0.775` |
| 本地构建 | `bun run build:local --game=dolp --skip-prepare --fast` |
| 仅 HTML release | `bun run build:all --game=dolp --target=html --skip-prepare --fast` |
| 变体定义 | `thalia.config.toml` 的 `[games.dolp]` |
| 输出 | `dist/html/index.html`；每次构建前自动清空 |

DoLP 输入包包含约 3 万张图片，构建后会复制到：

```text
dist/html/img/
```

`[games.dolp]` 主要配置：

```text
version
source_html
mods_dir
default_mod_list
```

### DoLP 汉化源

配置项：

```text
mod_sources.chinese-localization.dolp_repository
```

当前为空，表示构建 DoLP 时跳过该汉化源。

未来汉化发布后，将其设置为：

```text
owner/repo
```

即可由现有流程自动拉取。
## 11. 发布资产命名（GitHub Releases 契约）

网页下载链接按下列规则**自动拼写**（site/src/releases.ts），发布时 tag 与资产名必须严格匹配，否则下载会 404。

### 版本串（网页数据，来自仓库 tag，去前缀 v 后存储）
| 系列 | 版本串 | Release tag 示例 |
|---|---|---|
| 标准 DoL | `0.5.11.9-0701` | `v0.5.11.9-0701` |
| DoLP | `dolp-0.775-0701` | `vdolp-0.775-0701` |

规则：版本串 = `[dolp-](可选)游戏版本(-YYYY 日期 可选)`；同仓库同 Releases 页，靠前缀区分系列。

### 资产名
| 系列 | 资产名 | 示例 |
|---|---|---|
| 标准 | `DoL-Thalia-<game>-<preset>-<YYYY>.<zip/apk>` | `DoL-Thalia-0.5.11.9-chs-0701.zip` |
| DoLP | `DoL-Thalia-dolp-<game>-<preset>-<YYYY>.<zip/apk>` | `DoL-Thalia-dolp-0.775-vanilla-0701.zip` |

- preset = input/modList.json 的 `name`（vanilla / chs / chs-au-f / chs-au-m / chs-au-a / chs-goose-f / chs-goose-m），DoL 与 DoLP **共用同一组合集**；
- 示例下载 URL：`https://github.com/MaplebirchLeaf/DoL-Thalia/releases/download/vdolp-0.775-0701/DoL-Thalia-dolp-0.775-vanilla-0701.zip`。

### 更新数据
- `bun run site:build`（或 `SYNC_SKIP_ONLINE_PLAY=1 bun run site-build-data` 只更新数据）会从本仓库 tags 重生成 `site/data/versions.json`，preset 双语标题来自 input/modList.json。
- 发布新版本 = 打 tag + 按上表命名上传资产，站点无需硬编码链接。
