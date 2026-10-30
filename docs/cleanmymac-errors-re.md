# 选择确认类型与默认错误说明

日期：2026-10-21。目标为本机 CleanMyMac 5.7.2，接续 [按钮与选择确认](cleanmymac-confirmation-re.md)。本轮仅静态研究和文档补证，留白版本保持 0.9.2。

## 选择状态与确认策略

通过 Mach-O 文件映射和 Swift 类型描述读取字段，获得下列原始名称：

| 模块／类型 | 类型描述地址 | 字段描述地址 | 字段顺序 |
| --- | --- | --- | --- |
| NodesCore.SelectionState | `0x1f728` | `0x205f4` | mixed、selected、deselected |
| ModuleCore.SelectionConfirmation | `0x1541dc` | `0x14b460` | leaf、parent、excluded |

读取时检查了文件映射、字段记录尺寸 12 字节及字段数量边界。字段顺序不能单独证明带关联值枚举的运行时编码。

SelectionState 的值又由 NodesCore 汇编交叉核实：`select()` 的 `0x7fcc–0x7fe4` 写入状态字节 `1`，`deselect()` 的 `0x816c–0x8170` 写入 `2`，默认状态入口 `0x15b0` 返回 `2`。结合上轮 `0xce630` 仅接受字节 `1`，可确认该确认事件筛选的是 selected（选中）状态，而非所有选择变化。

ModuleCore `0xce24c` 是 coordinator 激活前的节点收集过程：读取节点确认策略后，编码 `1` 分支递归遍历孩子，编码 `2` 分支返回空集合，其余分支只收集符合 Selectable 的当前节点。与 parent／excluded／leaf 字段含义一致；这里是字段与分支的静态对应推断，尚未对每种目标节点实际赋值进行动态验证。没有声明所有缓存节点都属于 leaf，也没有恢复各分类的具体确认文案。

上轮拒绝分支仍调用 `0x651ec` 的 Selectable 协议槽 `+0x18`。本轮额外检查 `DeselectAllSelectionControlOption.select`（`0xd06c8`）：它走 `0xd0c3c → 0xd08bc`，通过 selection getter 后调用 `Selection.deselect`，而不是同一个协议槽。因此不能拿“取消全选”路径直接证明拒绝分支的槽方法名。扫描 NodesCore 本地 conformance 表没有命中对应具体表，保留未决；这不代表协议没有实现。

## 确认弹窗

`ModuleCore.AlertSelectionConfirmationPresenter.confirm`（`0xccbdc → 0xccbe0`）：

1. 创建 NSAlert，设置标题；说明文本非空时才设置说明。
2. 调用 SharedUI 的 `addCancelButton(withTitle:)` 和 `addConfirmButton(withTitle:)`，文本来自 ConfirmationPrompt。
3. 对确认按钮设置 `hasDestructiveAction = true`。
4. 调用 `ModalSheetPresenter.shared.run(alert:)`，将它的返回值与 `1` 比较，生成确认布尔结果。

调用桩 `0x1252ec / 0x1252f8 / 0x124ab8 / 0x124aac` 已映射到以上导入名称；标题字段也可与现有 getter 符号对应。未追入 SharedUI 的按钮响应映射，不将返回值 `1` 解释为原生 NSAlert 默认按钮序号，也未验证视觉样式与键盘默认焦点。

## 默认错误处理器及说明键

`0x26c8` 和 `0x10ec8 CleanupLocalizedErrorMapper.init` 构造的默认处理器顺序为下表；构造器的 `includeDefaultHandlers` 决定是否使用默认列表，随后还处理调用者传入的处理器数组。未以此断言所有调用处均启用默认处理器或相同优先级。

| 默认顺序 | 处理器 | witness 的处理入口 | 说明分支 |
| --- | --- | --- | --- |
| 1 | ControllableCancelledErrorHandler | `0x1030c` | 编号 `16` → `error_description_stopped_generic` |
| 2 | FilesRemovalTaskErrorHandler | `0x103c4` | 编号 `6` → `error_description_file_generic`，或 `8` → `error_description_file_write_no_permission` |
| 3 | PrivilegedFileRemoverErrorHandler | `0x109c4` | 编号 `7` → `error_description_file_was_not_authorized` |
| 4 | ItemRemovalTaskErrorHandler | `0x10660` | 编号 `9` → `error_description_item_generic` |

四个类型由构造函数的类引用和符号表共同确认；处理入口来自 conformance descriptor 指向的 witness 表 `+0x18`，详见本机 `handler-witness.json`。本轮没有读取或复制完整本地化资源文案；键名证明错误说明的分类，不代表最终语言内容。

文件错误分类调用 `0x10400`。其中可确认的一条分支是 NSError 的 domain 为 NSCocoaErrorDomain 且 code 为 `0x201`（513）时返回真，选择权限不足说明；另外还尝试转换到 CleaningCore.FileRemoverError，其内部关联值解释尚未完全恢复，不把判断条件缩减成只有 NSError 513。

`0x103c4` 的伪 C 错把分支条件表达成输入字段位；汇编 `0x103d8–0x103e8` 明确测试 `0x10400` 返回值，再选择编号 `6/8`，以汇编为准。随后 `0x121b68 → 0x120964` 选取说明键并调用本地化格式化。这里只恢复错误描述，没有发现此链提交重试、申请授权或执行文件操作。

## 对留白的意义

推荐继续保留当前“重新扫描 → 预览 → 确认”的执行入口，优先用明确错误类型改善逐项结果解释。另一方案是自动重试失败项，操作更少，但必须先保证路径、快照、权限和任务依赖重新核验；目前证据不足，不实施自动重试。不能按中文错误字符串猜测系统授权状态，也不能把取消、权限失败和普通失败混为一类。

KISS／DRY：复用现有逐项结果组件与预览校验；SOLID：错误说明与执行分离；YAGNI：不因发现目标类名而新增未验证清理规则。本轮无产品代码变动，不将研究结果记为功能交付。

## 证据与限制

- 本轮 19 个不同入口全部导出完成，包含类型访问器、转发和未用于业务结论的辅助函数；导出完成不是业务测试通过。
- ModuleCore、JunkCleanupModule 的原始二进制本轮前后 SHA-256 一致。NodesCore 为本轮另行提取的 arm64 切片，保存其哈希；未声称拥有该模块整文件的独立前后采样。
- `handler-methods.json` 是尝试按固定类偏移取方法的未成立假设，包含零和数据地址，不用于结论；使用 conformance witness 解析纠正。两份空的 Selectable conformance 搜索结果保留，未据此推断协议不存在。
- 沿用既有 Ghidra 项目；前轮 ModuleCore 自动分析超时、ObjC 分析器异常、类型恢复误差继续适用。没有执行目标真实 UI、扫描、删除、授权、特权 IPC 或许可流程，目标清理类动态测试为 **0**。
- 未恢复完整规则库、所有节点的确认策略赋值、拒绝协议槽具体实现、错误重试和完整安全检查。尚不能称为完整逆向或功能等价。

本机证据：`output/cleanmymac-re/clean-errors/` 中的各批函数、日志、类型字段、witness 表、哈希及验证摘要；基础汇编及导入映射复用 `clean-queue/`、`cleaner-binding/`。关联 [计划](plans/2026-10-21-cleanmymac-errors.md)、[本轮记录](change-log.md#change-20261021-010)。

## 后续补证（2026-10-21）

[第 011 轮](cleanmymac-selection-policy-re.md) 通过缓存模块根节点 witness 接通拒绝槽到 Selection.deselect，补上方法语义缺口，并核实最新移动设备备份的提示条件。未逐类验证所有节点实现；完整规则与重试仍未恢复。
