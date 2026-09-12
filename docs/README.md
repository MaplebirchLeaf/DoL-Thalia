# DoL-Thalia 文档

这里保存构建和维护仓库所需的技术文档。玩家下载、游玩和反馈说明位于仓库根目录的中英文 README。

- [命令参考](commands.md)：日常构建命令、参数和常见用法。
- [构建流程](build-pipeline.md)：构建阶段、输入来源、产物和缓存边界。
- [私有模组源](private-mod-sources.md)：从私有 GitHub Release 获取不适合提交到本仓库的资源。
- [Android APK 环境](android-build.md)：固定工具链版本、SDK 下载和安装方法。
- [运行时验证](runtime-verification.md)：回归命令、包体变化和性能测量边界。

配置入口是仓库根目录的 `thalia.config.toml`。发布组合由 `input/modList.json` 定义；文档只说明配置机制，不重复维护组合内容。
