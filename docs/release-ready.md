# 汉化发布后通过 Actions 构建

私有仓库 `DoL-Thalia-Assets` 保存维护脚本和哈希清单。三个 BSA ZIP 上传到固定的 `assets` Release，不提交 ZIP，也不创建日期标签。更新素材后运行 `python3 tools/prepare_assets.py --publish` 替换同名附件。

在 DoL-Thalia 的 Actions Secrets 配置 `PRIVATE_MODS_TOKEN`，授予资源仓库只读 Contents 权限。Release 工作流通过 GitHub API 下载私有 Release 附件，再构建和发布整合包。下载缓存记录附件身份和哈希，同名附件替换后会重新下载。

正式汉化发布后，在 DoL-Thalia 的 Actions 中启动 Release 工作流，填写整合包发布标签，例如 `v0.5.12.13`。标准版会先检查官方正式汉化 Release，不存在时立即停止。内测汉化不会作为此入口的构建来源。

标准版构建六套组合的英文与汉化 ZIP/APK。DoLP 采用六套英文组合，不使用汉化。Goose＋Mysterious 的图包优先级与实际显示仍待运行样包验证，当前 DoLP 基础版本与模组最低版本也仍需验证。

本地手动构建时，设置具有资源仓库读取权限的 `GITHUB_TOKEN`，再运行 `bun run build:ready`。默认只构建两个汉化 Goose＋Mysterious ZIP，不上传产物。

## 启动前清单

- 资源仓库的固定 `assets` Release 已包含三个 ZIP 和 `manifest.json`。
- DoL-Thalia 已设置 `PRIVATE_MODS_TOKEN`，权限限定为资源仓库 Contents 只读。本机 `gh` 登录不会自动提供这个 Actions Secret。
- `THALIA_KEYSTORE_BASE64` 已配置，用于 APK 签名。
- 正式汉化已发布，构建配置和脚本已提交并推送。
- 手动启动 Release 工作流并填写 `v0.5.12.13`，成功后生成整合包 Release 并部署 GitHub Pages。

上传或替换美化附件时不要同时启动整合包构建。
