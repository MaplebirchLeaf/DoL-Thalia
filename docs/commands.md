# 命令参考

DoL-Thalia 使用 Bun 1.4.2。首次检出仓库后执行：

```bash
git submodule update --init vendor/sugarcube-2-ModLoader
bun install --frozen-lockfile
bun run build:env
```

## 根命令

| 命令                   | 用途                                                   |
| ---------------------- | ------------------------------------------------------ |
| `bun run build:env`    | 准备 SugarCube、ModLoader、Story Format 和内嵌基础模组 |
| `bun run build:local`  | 使用已准备的环境快速生成本地 HTML                      |
| `bun run build:html`   | 为指定游戏版本和组合生成 HTML                          |
| `bun run build:zip`    | 执行正式流程并生成 ZIP                                 |
| `bun run build:apk`    | 执行正式流程并生成 APK                                 |
| `bun run build:all`    | 生成 HTML、ZIP 和 APK                                  |
| `bun run check`        | 检查 TypeScript、lint 和格式                           |
| `bun test ./tests`     | 检查构建缓存和原生下载桥接逻辑                         |
| `bun run test:native`  | 在 JDK 17 上验证下载分块、取消和文件清理               |
| `bun run test:runtime` | 运行 ModLoader、GUI 和 BSA 的运行时回归测试            |
| `bun run fix`          | 自动修复可修复的 lint 和格式问题                       |
| `bun run site:dev`     | 启动发布站点开发服务器                                 |
| `bun run site:build`   | 生成站点数据并构建发布站点                             |
| `bun run site:preview` | 预览已经构建的站点                                     |

根目录的 `build:local` 和 `build:html` 已包含 `--skip-prepare --fast`，适合使用现有缓存迭代。`build:zip`、`build:apk` 和 `build:all` 是正式入口，会准备依赖并压缩最终脚本。

## HTML 参数

以下参数适用于 `src/commands/build-html.ts`，其中大部分也适用于 `build:html`：

| 参数                   | 作用                                                |
| ---------------------- | --------------------------------------------------- |
| `--game=<name>`        | 选择 `thalia.config.toml` 中的游戏变体              |
| `--version=<version>`  | 覆盖当前游戏版本                                    |
| `--preset=<name>`      | 选择 `input/modList.json` 中的组合                  |
| `--config=<name>`      | `--preset` 的兼容别名                               |
| `--fast`               | 跳过最终 JavaScript 压缩                            |
| `--skip-prepare`       | 不重新准备工具链和内嵌基础模组                      |
| `--prepare=<steps>`    | 只运行指定 prepare 阶段，使用逗号分隔               |
| `--pure` / `--vanilla` | 不注入 ModLoader、内嵌基础模组和外部 IndexedDB 模组 |

示例：

```bash
bun run build:html --preset=<name> --version=<version>
bun run src/commands/build-html.ts --game=dolp --preset=<name> --version=<version>
```

`build:local` 使用配置中的 `game.version` 和 `game.default_mod_list`，不读取 CLI 的 `--preset`。

## Release 参数

以下参数适用于 `build:zip`、`build:apk`、`build:all` 和 `src/commands/build-release.ts`：

| 参数                         | 作用                                     |
| ---------------------------- | ---------------------------------------- |
| `--game=<name>`              | 选择游戏变体                             |
| `--version=<version>`        | 构建一个版本                             |
| `--versions=<a,b>`           | 构建多个版本                             |
| `--preset=<name>`            | 构建一个组合                             |
| `--presets=<a,b>`            | 构建多个组合                             |
| `--config` / `--configs`     | preset 参数的兼容别名                    |
| `--target=<target>`          | 只生成 `html`、`zip` 或 `apk`            |
| `--targets=<a,b>`            | 生成多个目标                             |
| `--html` / `--zip` / `--apk` | 目标参数的快捷写法                       |
| `--fast`                     | 跳过最终 JavaScript 压缩                 |
| `--skip-prepare`             | 复用现有 SugarCube、ModLoader 和模组产物 |
| `--skip-mod-sources`         | 不同步外部模组资源                       |

正式构建示例：

```bash
bun run build:zip --preset=<name> --version=<version>
bun run build:apk --preset=<name> --version=<version>
bun run build:all --game=dolp --version=<version>
```

显式执行 `build:apk` 时，缺少 JDK 或 Android SDK 会直接失败并给出缺少的版本。未限定目标的完整 `build:all` 在当前机器不能构建 APK 时会跳过 APK，并继续生成其他目标。

## Prepare 阶段

可以只准备一个或多个阶段：

```bash
bun run src/commands/prepare.ts sugarcube modloader story-format modloader-tools builtin-mods
```

| 阶段              | 作用                                        |
| ----------------- | ------------------------------------------- |
| `sugarcube`       | 同步 SugarCube 上游仓库                     |
| `modloader`       | 同步 ModLoader 上游仓库                     |
| `mod-sources`     | 同步配置中的外部模组资源                    |
| `story-format`    | 构建注入启动逻辑的 Story Format             |
| `modloader-tools` | 构建 ModLoader HTML 注入和打包工具          |
| `builtin-mods`    | 同步、构建并打包 ModLoader 清单中的基础模组 |

`all` 使用全部默认阶段。`pure` 或 `vanilla` 会生成不含 ModLoader hook 的 Story Format。Story Format 还支持 `--no-modloader`、`--no-i10n`、`--modloader-only`、`--i10n-only` 和 `--plain`。

`builtin-mods` 会校验源码、依赖和产物指纹，只重建受影响的模组。依赖安装使用锁文件；已初始化的模组保留当前 Git 检出，只有缺失的子模块才会初始化。需要切换版本时先显式更新子模块，再运行 prepare。

## 何时跳过步骤

- 只修改 DoL-Thalia 的 HTML 组装代码：使用 `build:html` 或 `build:local`。
- 修改 SugarCube、ModLoader 或基础模组：先运行对应 prepare 阶段。
- 外部 Release 资源没有变化：正式构建可加 `--skip-mod-sources`。
- 首次构建、更新子模块或排查缓存问题：不要使用跳过参数。

需要强制重建内嵌模组时，删除 `.cache/build/` 后重新执行 `builtin-mods`；无需删除本地游戏、模组或 SDK。运行时回归测试需要先完成 `build:env`，以准备各子仓库的依赖。测试内容和性能证据见[运行时验证](runtime-verification.md)。

构建阶段和目录职责见[构建流程](build-pipeline.md)。
