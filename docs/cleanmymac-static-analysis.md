# CleanMyMac 5.7.2 静态分析

日期：2026-10-20。目标：`/Applications/CleanMyMac_5.app`。使用独立的 rea-agents 6.7.0；留白保持 0.8.5。

## 实测结论

REA 可以建立目标结构与签名证据，当前结果不足以还原扫描算法、删除规则或完整功能。没有启动目标、登录、操作清理、注入进程或更改系统授权。

| 检查 | 观察结果 | 证据与边界 |
| --- | --- | --- |
| 应用清单 | 版本 5.7.2，标识 com.macpaw.CleanMyMac5 | 读取本地 Info.plist；只代表该安装包 |
| 签名信息 | Developer ID Application: MacPaw Way Ltd；Team ID S8EX82NJP6；启用强化运行时 | REA inspect-signature；签名身份不等于运行行为审计 |
| 完整签名 | codesign --verify --deep --strict 退出 0 | 独立校验通过；未做 Gatekeeper、公证或恶意软件判定 |
| Mach-O | x86_64 与 arm64 双架构；所选 arm64 的最低系统元数据为 11.0 | REA inspect-macho；不据此承诺整个产品兼容范围 |
| 应用图谱 | inventory_artifact completed；3559 节点、5770 出现记录、4755 边 | 图谱去重计数，不是功能数量；inspect-artifact 只完成清单子步骤 |
| 检查完整性 | 三个 REA 命令均退出 0；主二进制检查前后 SHA-256 一致 | 仅哈希主二进制，未声称逐文件前后比较整个应用包 |

主二进制 SHA-256：`64ed47f842e3d02755909759ae87b9014fd81c9c6a8cf14ffc808857b6e8848f`。

## 可借鉴的模块线索

以下仅根据应用包名称、目录及主二进制依赖观察；模块存在不证明功能当前可用、订阅可用或规则可靠。

| 本地线索 | 研究方向 | 留白的取舍 |
| --- | --- | --- |
| JunkCleanupModule、UninstallerScanning、ApplicationsModule | 清理与应用关联数据分开分析 | 先做归属与影响解释，再提供可执行动作 |
| SpaceLensModule、SpaceLensUI | 空间浏览与图形展示 | 改进现有空间地图，避免增加重复入口 |
| LocalModelScanning、OrganizeScanning、DownloadsScanning | 本地模型与文件整理 | 优先强化模型、项目产物和依赖证据，这是留白已有方向 |
| PermissionsKit、PermissionsUtils；桌面／文稿／下载／其他应用数据用途声明 | 权限独立管理 | 显示范围、未扫描原因及恢复入口；不能把用途声明当成系统授权 |
| Library/LaunchServices、Library/LoginItems、XPCServices、FinderSync 插件 | 后台、特权和扩展边界 | 当前不增加常驻服务和特权助手，避免为普通扫描引入额外复杂度 |
| ProtectionModule、MalwareScanningRoutines、MalwareRulesRoutines | 防护模块的存在 | 没有规则质量、更新机制和检测能力证据，暂不开发杀毒功能 |

应用清单声明了 NSAppDataUsageDescription、NSDocumentsFolderUsageDescription 等多个用途。签名具有照片库及应用组等授权项。它们都不能证明用户已同意完全磁盘访问，也不能证明不会出现文件夹授权弹窗。本轮没有验证目标的真实授权交互。

## 两条后续路线与推荐

1. **推荐：静态结构线索 + 实际交互观察 + 独立实现。** 先围绕权限入口、扫描结果解释和项目／模型依赖做小范围对比，按留白现有 Rust + Tauri 架构实现，收益直接、维护成本低。交互观察尚未执行。
2. **备选：配置 Ghidra／Hopper／IDA 后定点研究。** 适用于需要解释某个明确原生调用或数据结构的问题，配置与分析成本更高；当前没有配置分析引擎，也没有进行反编译。完整复刻不作为本次试用结论。

原则应用：KISS 复用现有扫描与视图；YAGNI 暂不引入杀毒和特权后台；SOLID 将权限、扫描证据与执行职责分开；DRY 统一归属及风险说明，避免每个模块重复制定安全规则。直接照搬目标的大量框架划分会违背当前项目的简单性，应按实际复杂度拆分。

## 原始证据与复现

本地目录：`output/rea-evaluation/cleanmymac/`。

- signature.json、macho.json、artifact.json：REA 原始结果。
- run-summary.json：目标版本、命令退出码、耗时及前后主二进制哈希。
- metadata-summary.json：目录名称、用途声明、依赖数量及独立签名检查记录。
- 三个 REA 命令分别耗时 3.56、3.58、3.50 秒；入口为 `output/rea-evaluation/runtime/node_modules/rea-agents/scripts/rea.mjs`，子命令为 inspect-signature、inspect-macho、inspect-artifact，携带目标路径及 --json。

原始文件是本地产物，可能随清理移除；本文保留主要事实。工具并非系统沙箱，没有将第三方工具加入产品依赖。本轮仅研究与文档更新，未重新构建或运行业务测试，未复制目标代码或界面素材。

关联：[检查计划](plans/2026-10-20-cleanmymac-static.md)、[前次工具试用](rea-evaluation.md)、[本轮修改记录](change-log.md#change-20261020-002)。

## 2026-10-20 定点框架检查补充

使用同一 REA 6.7.0，对 PermissionsKit、LocalModelScanning、JunkCleanupModule 三个框架运行 inspect-macho，再使用本机 swift-demangle 解码导出符号。三个命令退出码均为 0，三个文件前后 SHA-256 分别一致。未执行框架代码。

| 框架 | 直接依赖数量 | 观测到的导出符号条目 | 关键线索 |
| --- | --- | --- | --- |
| PermissionsKit | 8 | 14 | MPFullDiskAccessAuthorizer；日历、通讯录和照片的独立授权类 |
| LocalModelScanning | 29 | 160 | OllamaDetails 的 manifestURL／blobURLs；LocalModelStoreScanResult 的 blobReferences；模型 sizeBytes／companionBytes／shardURLs |
| JunkCleanupModule | 66 | 368 | 依赖 ScanningCore、CleaningCore、LocalModelScanning；导出项包含分类与详情、错误映射线索 |

REA 对三组导出均标记 exhaustive=false：符号可能因裁剪而不完整。以上数量为观测条目，不是完整 API 数量。Swift 名称解码仅揭示类型与字段，不等于获得函数实现；尤其不能据 blobReferences 就断言计数算法正确、删除安全或支持某个具体模型仓库。

对照留白代码：ScanAccess.tsx 已提供范围与权限说明，ScanCoverage.tsx 已解释不完整结果，projects.rs::installed_models 已读取 Ollama 清单路径识别名称。因此不重复新增权限说明页或模型分类。实际缺口是每个模型的共享文件归属、独占占用和统计完整性，目前 ProjectReport 及关系图没有这些信息。

下一步推荐先实现只读模型空间账本，设计见 [模型空间账本设计](plans/2026-10-20-model-storage-design.md)。保持既有模型只读边界，不从框架符号推导删除规则。

原始证据位于 `output/rea-evaluation/cleanmymac/focused/`：三个框架 JSON、解码导出符号文本及 summary.json。此次未观察实际界面或扫描结果；主程序清理算法仍未知。

## 2026-10-20 后续函数级研究

已配置 Ghidra 并进入用户缓存通用执行链的函数级反编译及受控目标类执行，详见 [深入逆向报告](cleanmymac-system-junk-re.md)。此前仅静态结构的结论保留为对应轮次的历史范围，不能混写成已完全还原。
