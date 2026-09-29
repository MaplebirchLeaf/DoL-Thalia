# 运行时验证

从仓库根目录执行：

```bash
bun run check
bun test ./tests
bun run test:native
bun run test:runtime
bun run audit
```

`test:native` 使用 `JAVA_HOME` 中的 JDK 17，自动在临时目录编译和清理测试。`test:runtime` 分别在 ModLoader、ModLoaderGui 和 BeautySelectorAddon 目录运行测试；首次执行前需要完成 `bun run build:env`。

## 产物审计

`bun run audit` 调用 `tools/audit_release.py`（只需 Python 3 标准库，无第三方依赖），以只读方式核对 `dist/` 中的成品，验证构建成功本身不能证明的不变量：

- HTML：内嵌基础模组确实以合法 base64 编码，且每份载荷都能作为 ZIP 解压并通过 CRC 校验。
- ZIP：包体可读、全部成员通过 CRC、存在 HTML 入口。
- APK：可解析为 ZIP、包含 `AndroidManifest.xml` 与 `classes.dex`、存在 v2/v3 签名块、未压缩条目满足 4 字节对齐。签名块存在性检查不等同于密码学签名验证。

也可以单独指定目标：`python3 tools/audit_release.py --html <文件>`、`--zip <文件>`、`--apk <文件>`。全部通过时退出码为 0，任一失败为 1，便于接入 CI。

该脚本把内嵌模组 ZIP 校验、APK 签名块存在性和条目对齐检查变为可重复执行的检查。正式发布前仍需使用 `apksigner verify` 验证签名；对齐结果可用 `zipalign -c -p 4` 独立复核。

## 验证范围

- ModLoader：widget 回调分派、ZIP 元信息、旧记录迁移、并发更新、分片完整性、写入失败恢复、图片请求去重和日志上限。
- GUI：依赖名称、别名和版本校验，循环依赖，取消、配额失败和部分安装结果，临时档案清理与并行安装隔离，以及日志和版本标识更新。
- BSA：异步图片覆盖顺序、原生 DOM 创建参数兼容、备用图片、请求去重、缓存淘汰，以及升级和卸载后的图片缓存清理。
- Android 下载：进度、分块桥接、取消、异常返回、下载限额、截断响应、URL 和重定向校验、临时文件清理。
- 构建缓存：源码、依赖和产物变化触发失效，生成文件不会反过来污染源码指纹。

运行时测试使用真实 IndexedDB 接口的内存实现和受控 DOM 对象，便于稳定复现并发情况；它们不能代替 Android WebView 和桌面浏览器的实际游玩测试。

GUI 将待安装 ZIP 暂存为 IndexedDB Blob，依赖规划只保留元信息和记录 ID；完整验证依赖图后，每次读取一个档案安装。成功、失败、取消均关闭并删除本次暂存库，避免完整 ZIP 沿递归调用栈累积。正式保存若因配额等原因中途失败，界面仍会列出已保存的模组。

## 包体与资源操作

以下是本轮修改前后本地构建的 JavaScript 字节数，包含由生产构建和删除内联 source map 带来的变化；不是同一压缩条件下的算法性能比较。

| 文件                     |    修改前 |    修改后 |
| ------------------------ | --------: | --------: |
| ModLoader `BeforeSC2.js` | 4,673,946 | 1,818,608 |
| GUI 主包                 | 5,422,123 |   729,576 |
| BSA 主包                 | 1,963,137 |    99,157 |

BSA 的可复现基准位于其子仓库，运行 `bun run benchmark:images`：100 个并发同图请求从 100 次 IndexedDB 读取和 data URL 转换降为各 1 次；200 张缓存图片的清理从读取 300 条含图片值的游标记录降为 0 条，改用键和索引。详细方法见该子仓库的 `docs/runtime-performance.md`。

Android 下载核心能够在 Java `-Xmx16m` 下流式写入并分块读取 32 MiB 测试档案。该结果只说明下载核心不需要整包 Java 堆内存，不代表 WebView 解压和游戏运行只需 16 MiB。

本轮完整构建 20 个内嵌模组后，立即重复 `bun run src/commands/prepare.ts builtin-mods`，结果为 `rebuild 0, reuse 20`，本机耗时约 0.63 秒。这个数值仅是缓存命中的构建耗时，不是游戏启动时间。

## 设备验证

本轮使用浏览器打开正式构建的 0.5.11.9 HTML：进入欢迎页和设置页，打开 GUI 后 20 个模组均显示为本地加载，日志为 `0 error, 0 warning`。通过 GUI 安装不含脚本的测试 ZIP 成功，随后移除测试条目，旁加载列表恢复为空。最终 ZIP/APK 另行核对了全部内嵌模组的 ZIP 哈希和 APK 签名、对齐结果。

低性能手机重点观察启动峰值内存、连续切换 passage 的卡顿、快速换装时旧图片回写、下载取消后重试，以及模组更新期间重载。桌面端同时检查并发请求合并是否仍保持加载速度。

图片 LRU 使用字节预算；旧接口显式要求长期缓存的图片仍遵守原有契约，因此不能把 LRU 预算当作整个游戏的内存上限。本轮没有新增 `window` 配置变量，也没有设备帧率或整机内存的实测结论。
