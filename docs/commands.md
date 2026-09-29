# 构建命令

使用 Bun 1.4.2。首次检出后运行：

```bash
git submodule update --init vendor/sugarcube-2-ModLoader
bun install --frozen-lockfile
bun run build:env
```

## 日常使用

| 想做什么           | 命令                                                            | 产物                                             |
| ------------------ | --------------------------------------------------------------- | ------------------------------------------------ |
| 快速测试当前整合包 | `bun run build:local`                                           | `dist/html/`；复用已准备的工具链，跳过压缩       |
| 检查压缩后的 HTML  | `bun run build:html`                                            | `dist/html/`；复用已准备的工具链，压缩 SugarCube |
| 构建发布包         | `bun run build:zip` / `bun run build:apk` / `bun run build:all` | ZIP、APK 或两者；按需准备依赖                    |

`build:local` 和 `build:html` 使用同一套组合与资源，只差压缩。两者都会把普通 JS/CSS 拆到 HTML 同目录；测试时要保留整个 `dist/html/`。ZIP 仍使用单文件 HTML。

默认游戏版本和组合名在 `thalia.config.toml` 的 `[game]` 中。组合包含哪些模组由 `input/modList.json` 决定；`[mod_sources.*]` 只负责定位或下载模组文件。`modList.json` 可以使用 `{ "base_mods": [...], "presets": [...] }`：`base_mods` 自动加入每个组合，组合内的 `mods` 只列额外模组。旧数组格式仍可用。要加入自己创作的模组，先把 `模组名-游戏版本-版本号.mod.zip` 放进 `input/mods/<游戏版本>/`，再将模组名加入 `base_mods` 或指定组合。没有可供 CI 下载的资源时，将该组合及资源配置留在本地，不加入公开发布配置。

常用参数：

```bash
bun run build:local --preset=chs --version=0.5.12.13
bun run build:html --pure
bun run build:zip --preset=chs --version=0.5.12.13
bun run build:all --game=dolp --version=0.778
```

`--preset` 选择 `input/modList.json` 的组合；`--version` 覆盖游戏版本；`--game=dolp` 选择 DoLP 输入和模组目录。`--pure` 只用于 HTML 构建，表示不注入 ModLoader 和任何模组，与组合名称无关。快速命令默认跳过准备阶段；改动 SugarCube、ModLoader 或内嵌基础模组后，先运行 `bun run build:env`。

## 其他入口

- `bun run check`：类型、lint 与格式检查。
- `bun test ./tests`、`bun run test:native`、`bun run test:audit`、`bun run test:runtime`：分别检查构建逻辑、Java 下载器、Python 发布审计和游戏运行时。
- `bun run audit`：审计 `dist/` 中已有的发布产物。
- `bun run site:dev`、`bun run site:build`、`bun run site:preview`：开发、构建和预览发布站点。
- `bun run fix`：自动修复可修复的 lint 和格式问题。

需要只准备某一步时，运行 `bun run src/commands/prepare.ts <step>`。可选步骤为 `sugarcube`、`modloader`、`mod-sources`、`story-format`、`modloader-tools` 和 `builtin-mods`。发布命令还支持 `--presets=a,b`、`--versions=a,b`、`--target=html|zip|apk`、`--skip-prepare`、`--skip-mod-sources` 和 `--fast`；日常测试无需使用这些开关。

构建阶段和目录职责见[构建流程](build-pipeline.md)，APK 环境见[Android APK 环境](android-build.md)，运行时验证见[运行时验证](runtime-verification.md)。
