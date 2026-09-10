# 私有模组源

不适合提交到 DoL-Thalia 的模组和美化资源可以放在另一个私有 GitHub 仓库的 Release 中。GitHub Actions 使用单独的只读令牌获取这些文件。

私有 Release 仍然是云端存储。资源不能离开本地机器时，这种方案不适用，只能本地构建并手动上传成品。

## 配置资源

每个 `[mod_sources.*]` 对应一个可被发布组合引用的来源：

```toml
[mod_sources."example-pack"]
repository = "owner/private-assets"
asset_keywords = ["example-pack"]
asset_extensions = [".zip"]
```

- `repository` 使用 `owner/repository` 格式。
- `asset_keywords` 是 Release 资产文件名必须包含的字符串，可以配置多个。
- `asset_extensions` 限制允许的文件扩展名。
- `release_tag` 可固定 Release；省略时读取 latest Release。
- `asset_urls` 可直接指定下载地址。配置它时不会查询 `repository`。
- `<variant>_repository` 可以为游戏变体覆盖仓库；空字符串表示该变体跳过该来源。

资源文件名应包含关键词。文件名同时包含当前游戏版本时优先选中该版本；否则会回退到没有匹配版本限制的候选。一个关键词匹配多个候选时构建会失败，避免静默选错资源。

## 创建只读令牌

为自动构建创建 fine-grained personal access token：

1. Repository access 只选择保存资源的私有仓库。
2. Repository permissions 设置 `Contents: Read-only`。
3. 在 DoL-Thalia 仓库的 Actions secrets 中保存为 `PRIVATE_MODS_TOKEN`。

默认的 `${{ github.token }}` 只针对当前工作流仓库授权，不能假定它可以读取另一个私有仓库。

## 传给构建器

当前同步器从 `GITHUB_TOKEN` 环境变量读取令牌，因此构建步骤需要显式映射：

```yaml
- name: Build release assets
  run: bun run build:all --game="$THALIA_GAME" --version="$THALIA_GAME_VERSION"
  env:
    GITHUB_TOKEN: ${{ secrets.PRIVATE_MODS_TOKEN || github.token }}
```

仓库工作流已经使用这一映射。配置了 `PRIVATE_MODS_TOKEN` 时读取授权的私有资源仓库；没有配置时回退到 `${{ github.token }}`，公开模组源仍可正常构建。
不要把令牌写进 `thalia.config.toml`、脚本、Release 文件名或日志。不要在来自 fork 的不受信任工作流中暴露这个 Secret。

## 构建前验证

先在本地使用同类令牌验证单个组合：

```bash
GITHUB_TOKEN=<token> bun run build:html --preset=<name> --version=<version>
```

确认日志完成模组源同步，并检查 `input/mods/<version>/` 中下载的文件。再执行正式 ZIP 或 APK 构建。

若 Release 元数据可读取但资产下载返回 404，应检查令牌是否选择了正确仓库、是否具有 Contents 读取权限，以及资产 URL 是否需要通过 GitHub Release Asset API 下载。公开 Release 不代表私有仓库的资产可以匿名访问。
