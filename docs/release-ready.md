# 汉化发布后通过 Actions 构建

私有仓库 `DoL-Thalia-Assets` 保存维护脚本和哈希清单。三个 BSA ZIP 上传到固定的 `assets` Release，不提交 ZIP，也不创建日期标签。更新素材后运行 `python3 tools/prepare_assets.py --publish` 替换同名附件。

在 DoL-Thalia 的 Actions Secrets 配置 `PRIVATE_MODS_TOKEN`，授予资源仓库只读 Contents 权限。Release 工作流通过 GitHub API 下载私有 Release 附件，再构建和发布整合包。下载缓存记录附件身份和哈希，同名附件替换后会重新下载。

正式汉化发布后，在 DoL-Thalia 的 Actions 中启动 Release 工作流，填写整合包发布标签，例如 `v0.5.12.13` 或 `v0.5.12.13-1003`；DoLP 使用 `vdolp-0.778` 或 `vdolp-0.778-1003`。标签中的游戏版本决定下载和构建版本。标准版先检查官方正式汉化 Release，不存在时停止；内测汉化不会作为此入口的构建来源。

工作流在下载资源前检查标签格式和源码提交。已有标签必须指向当前检出的提交；需要重建旧标签时，在 Actions 的分支／标签选择器中选中该标签。更新源码后发布应使用新标签。ModLoader 使用当前提交记录的子模块版本，SugarCube 固定到指定提交，模组和汉化使用配置中的 Release 标签；未指定汉化标签时，才按游戏版本选择正式 Release。

英文和汉化配置分别构建并读取独立的 SugarCube Story Format。英文保留原版 i10n；包含 `ModI18N` 的汉化配置在 UI 初始化前应用中文 i10n，不以浏览器语言判断。`--skip-prepare` 也只读取对应语言已构建的格式文件，不复用另一语言。

标准版构建基础整合、女性 Goose＋Mysterious、男性 Goose＋Mysterious三种组合的英文与汉化版本，共 6 个 ZIP 和 6 个 APK；DoLP 构建这三种组合的英文版本，共 3 个 ZIP 和 3 个 APK，不使用汉化。上传前逐项检查预期附件清单和产物审计，APK 构建完成后执行签名与对齐验证。Goose＋Mysterious 的图包优先级与实际显示仍待运行样包验证。现有 DoLP 0.778 基于 0.5.12.11，低于当前框架、枯木逢春和归途之书要求的 0.5.12.13，不纳入本次发布；更新兼容的基础游戏后再启动 DoLP 发布。

新 Release 先创建草稿并生成 GitHub 发布说明，全部附件上传成功后才公开；已有公开 Release 只允许从同一源码提交更新附件。发布和 GitHub Pages 部署共用并发锁。普通 main 推送与 PR 会运行独立 CI，检查类型、lint、格式、构建逻辑、审计器和原生下载器。

GitHub Pages 只上传 `dist/site`。ZIP/APK 下载链接指向 Release。工作流先用 `site:play` 显式构建双语在线游戏，再执行 `site:build` 同步元数据并构建页面，最后审计两个在线入口。`site:data` 和 `site:build` 本身不下载或构建游戏。

中文页面的在线游玩链接为 `play/chs/index.html`，英文页面为 `play/en/index.html`，分别使用中文与英文 SugarCube i10n。两个入口均仅包含原版游戏和 20 个 ModLoader 内置模组，不预装 `ModI18N`、美化或其他整合模组；中文入口只汉化 SugarCube UI，剧情没有预装汉化。

本地手动构建时，设置具有资源仓库读取权限的 `GITHUB_TOKEN`，再运行 `bun run build:ready`。默认只构建两个汉化 Goose＋Mysterious ZIP，不上传产物。

## 启动前清单

- 资源仓库的固定 `assets` Release 已包含三个 ZIP 和 `manifest.json`。
- DoL-Thalia 已设置 `PRIVATE_MODS_TOKEN`，权限限定为资源仓库 Contents 只读。本机 `gh` 登录不会自动提供这个 Actions Secret。
- `THALIA_KEYSTORE_BASE64` 已配置，用于 APK 签名。内容为原始密钥库字节的 Base64，兼容两层 Base64 包装；工作流在构建前验证存储密码、私钥密码和别名，仅记录证书 SHA256，不生成替代密钥。
- 正式汉化已发布，构建配置和脚本已提交并推送。
- 手动启动 Release 工作流，选择待发布源码的分支／标签并填写发布标签；成功后公开整合包 Release 并部署 GitHub Pages。

上传或替换美化附件时不要同时启动整合包构建。
