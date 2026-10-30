# 缓存模块选择策略与拒绝回调

日期：2026-10-21。目标为本机 CleanMyMac 5.7.2。接续 [选择类型与错误说明](cleanmymac-errors-re.md)，本轮补齐拒绝回调的一条具体实现，并核实移动设备最新备份的确认条件。仅研究和文档，留白保持 0.9.2。

## 拒绝确认确实调用取消选择

上一轮只能确认拒绝分支在批量更新中调用 Selectable 协议槽 `+0x18`。本轮通过 JunkCleanupRootNode 的具体 witness 表接通：

| 环节 | 地址与证据 |
| --- | --- |
| 拒绝分支 | ModuleCore `0xce6dc` 批量更新闭包 `0x651ec` 调用每项 Selectable witness `+0x18`，沿用第 009 轮证据 |
| 具体协议实现 | JunkCleanupModule 的根节点 witness `0xb4328 + 0x18 → 0x75d3c` |
| 转发 | `0x75d3c → 0x71788`，调用桩 `0x8e4cc` |
| 导入绑定 | 桩槽 `0xb8d50` 绑定 ModuleCore 扩展 `Selectable.deselect()` |
| 公共实现 | ModuleCore `0xd7324 → 0xd7330` 先取 selection，再调用传入函数指针 |
| 底层操作 | 指针来自 GOT `0x174ed8`，绑定 `NodesCore.Selection.deselect()`；此前已核实该方法写入取消选择状态 |
| 关联控件 | `0xd7330` 在父节点存在时，用空 SelectionOption 调用 `updateCurrentSelectionOption` |

因此可以把该槽识别为取消选择操作，补上上一轮方法语义缺口。直接核对的是根节点这份具体 witness；没有逐类验证所有节点的实现完全相同。拒绝后的祖先控件去重／重置仍沿用第 009 轮证据；该链中没有文件移除或提交清理任务。

## 确认策略的具体来源

本轮 JunkCleanupModule 符号表明确列出三份 SelectionConfirmable conformance：

| 对象 | witness 的 getter | 观察到的行为 |
| --- | --- | --- |
| JunkCleanupRootNode | `0xb4138 → 0x6bbf8 → 0x6bbdc` | 返回固定策略值 |
| MobileBackupsGroupModel | `0xb41a8 → 0x6bbdc` | 与根节点复用同一 getter |
| MobileBackupsModel | `0xb4198 → 0x6bdfc → 0x6bcf8` | 按 latest 字段决定是否构造提示 |

`0x6bbdc` 复制常量 `0x952b0`，前两个 64 位字段为 `[0, 1]`，其他字段清零。结合上一轮 coordinator 对编码 1 递归子节点的分支和 parent 字段名称，可将根节点及备份分组对应到父级遍历策略；它们自身不在这个 getter 中构造提示。

这些是本模块导出符号与具体表中的证据，不是整个程序的完整 conformance 清单。不能根据此表断言普通用户缓存完全没有确认机制，其他模块、泛型和运行时配置仍需另查。

## 最新移动设备备份的确认条件

`MobileBackupsModel.selectionConfirmation`（`0x6bcf8`）执行以下逻辑：

1. 获取 MobileBackupsModel 类型元数据，从元数据 `+0x14` 读取字段偏移，再读取模型对应字节。
2. 仅当该字节等于 `1` 时，构造标识 `latest-ios-backup` 及四段本地化文本；否则返回全零的提示存储。
3. SystemJunkScanning 的公共 `MobileBackupsModel.latest.getter`（`0x2e3e0`）使用完全相同的元数据偏移和读取方式，因此可确认检查的是 latest（是否最新）。

结合第 009 轮 coordinator 只提取非空提示，非最新备份不会由这个 getter 提供额外提示。全零结果不应称为 excluded：上一轮已区分“没有提示内容”和“排除遍历”的编码。这也不意味着非最新备份可无条件删除，任务依赖、执行确认和权限检查属于其他层。

getter 调用 `0x8b870`，参数包含 `0x4e / 0x4d / 0x4c / 0x4b`，第三参数为 `0x1e`。此函数调用 `0x8a914` 后进行本地化查询。`0x8a914` 的导出虽然完成，但存在坏指令和未恢复跳转表警告，参数也有误判；未将这些数字直接当成完整文案索引。保留原始结果，不宣称本轮已恢复提示的完整文本。

## 对留白实现的约束

有两条路线：优先保留现有最终预览确认，把确认条件限定到有明确风险证据的项目；另一条是复制每个选择阶段弹窗，但容易增加用户负担，也需要完整分类策略。本轮推荐前者，未新增任何弹窗或备份删除能力。

若将来支持移动设备备份，至少需要先实现“最新”判定的可靠来源、依赖保护和执行前复核。仅找到目标的 latest 字段不能证明留白已具备这些条件，也不能把字段当作授权。

KISS 避免无条件重复弹窗，DRY 复用已有预览入口，SOLID 保持选择与清理执行分离，YAGNI 不新增未经验证的备份清理规则。本轮不修改产品或升级版本。

## 验证与限制

- 10 个定点请求导出完成，按模块／入口排重为 10 个函数；包含转发和一个不可靠的本地化函数，不等于业务测试通过。
- ModuleCore、JunkCleanupModule 原始模块本轮前后 SHA-256 一致；SystemJunkScanning 本轮只读导出汇编核对 latest getter，未记录独立前后哈希，不声称该模块完成前后校验。
- witness 指针由已有 Mach-O 映射读取，结合符号、调用汇编与 dyld 绑定核对。输入切片沿用既有项目，没有重新全量分析。
- 既有 ModuleCore 分析超时和类型恢复限制仍适用；本轮明确增加 `0x8a914` 坏指令／跳转表警告。原目标清理类动态测试 **0**；未操作目标 UI、扫描、删除、授权、特权 IPC 或许可流程。
- 完整知识库、其他分类策略、所有节点的取消选择实现、完整提示文本及重试仍待核实。不能称为完整复刻。

本机证据位于 `output/cleanmymac-re/selection-policy/`，包括函数、索引、日志、`policy-witness.json`、符号表、SystemJunkScanning 汇编和验证摘要；基础汇编及绑定复用前轮资料。关联 [计划](plans/2026-10-21-cleanmymac-selection-policy.md)、[修改记录](change-log.md#change-20261021-011)。
