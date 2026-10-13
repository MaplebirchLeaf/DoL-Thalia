# DoL 0.5.12.13 临时战斗补丁

来源：[Vrelnir/degrees-of-lewdity !4962](https://gitgud.io/Vrelnir/degrees-of-lewdity/-/merge_requests/4962/diffs)。`upstream.diff` 保留此次取得的完整上游差异，游戏代码与文本归原作者所有。

仅用于原版 **0.5.12.13**。构建时修改提取出的 HTML，不修改原版 ZIP，不用于 DoLP。`game.combat_backport` 控制是否启用。

## 修复范围

- `base.js`：`DefineMacro` 在异常后也恢复原来的 `_args`。
- `combat.js`：统一按当前战斗行解析 NPC，对场景、具名 NPC、普通 NPC 分别选择宏，安全传递参数。
- `Widgets Ejaculation`：拆出公共、普通 NPC 及发言组件，补上缺失 NPC 判断，每行清理临时状态。
- 新增 Avery、Whitney 的独立组件，保留 0.5.12.13 对应文本。
- `Widgets Ejaculation-WALL`：补上发言输出。
- `Widgets Combat Man-Combat`：反应和发言均传递当前 `_n`，修复固定选中第 0 行的问题。

## 与上游差异

合并请求的父版本不是发布版 0.5.12.13，不能直接覆盖全部文件：

- 发布版已经把 `namedNpcComments`、`namedNpcReaction` 移到 `combat.js`。这里替换现有实现，避免重复注册。父版本中删除 `named-npcs-speech.twee` 的变更无需重复执行。
- 发布版没有父版本的 `speech.js` 发言池系统，因此不引入该系统，也不应用对应优化。
- 普通 NPC 分支沿用发布版原文、条件与变量，仅提取为组件并调整缩进。父版本新增的对话与玩具分支不随此补丁导入，发布版的原有条件继续保留。
- 类型声明和编辑器配置不进入运行时补丁。

## 汉化适配

ModI18N 必须按补丁后的 HTML 重绑定目标与位置。原来位于 `Widgets Ejaculation` 的部分文本已移动到 Avery、Whitney 组件，宏边界和缩进也有变化。不能继续使用旧目标与旧位置，不应让旧翻译片段覆盖回已修复的逻辑。

适配后的汉化仅用于启用此补丁的构建，其他游戏版本和 DoLP 仍使用各自汉化来源。

## 校验

`payload.json` 记录各目标的修改前后 SHA-256。所有目标通过检查后才返回完整结果，内容不匹配即终止构建。重复应用会核对已修复内容，返回相同 HTML。

`fixtures/vanilla.html.gz` 仅包含原版 ZIP 中受影响的脚本和段落，供离线回归测试。其余 HTML 的脚本、段落、资源和存档不会由本补丁改写。

```sh
bun test tests/combat-backport.test.ts
```

测试覆盖版本源校验、重复应用、未修改区域、组件边界、NPC 行选择、场景优先级、参数引用及异常后的 `_args` 恢复。测试与构建通过不等同于完整游戏内战斗复测。
