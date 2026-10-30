# 文档目录

先看 [项目总进度与下一阶段](progress.md)：区分产品交付、逆向证据和待实施工作。每轮详细变化见 [修改与优化记录](change-log.md)。

| 文档 | 用途 |
| --- | --- |
| [指定应用残留检查设计](plans/2026-10-30-app-residue-inspection.md) | CC Switch 案例、只读识别边界、实施阶段与验收；待实施 |
| [主要目录选择与耗时计划](plans/2026-10-23-scan-scope-timing.md) | 固定根白名单、空集语义、计时、兼容与验收结果 |
| [两项目统一对照评估](reference-comparison-2026-10-23.md) | 主要功能族、源码抽查、官方证据、成本、验收及明确未完成项 |
| [MangoDisk 对照分析](mangodisk-reference.md) | 固定提交的规则、诊断、权限、CI 借鉴及不直接沿用的语义 |
| [诊断、证据与 CI 计划](plans/2026-10-22-diagnostics-evidence-ci.md) | MangoDisk 建议的分步实施及真实权限阻碍 |
| [可执行缓存规则证据](cleanup-rule-evidence.md) | uv／npm／pip 来源、风险、边界与实际验收状态 |
| [空间管理首批计划](plans/2026-10-22-space-browser-delivery.md) | 权限补验、普通目录地图与只读大文件的执行步骤 |
| [能力差距与实施顺序](capability-matrix.md) | 十项推荐能力的现状、缺口、风险和后续批次 |
| [统一实施计划](plans/2026-10-21-delivery-roadmap.md) | 后续默认执行顺序、涉及文件、测试和验收门槛 |
| [AI 宽目录修复计划](plans/2026-10-22-ai-coverage-fix.md) | 有界枚举、部分观测、取消及模型账本兼容验证 |
| [AI 数据规则与兼容范围](ai-data-compatibility.md) | 已实现的路径线索、版本证据、统计限制和实机验收缺口 |
| [AI 工作数据设计](plans/2026-10-21-ai-workspace-data-design.md) | Codex／Claude 数据分类、保护边界、只读账本及分期清理策略 |
| [项目总进度与下一阶段](progress.md) | 当前交付、逆向覆盖、未完成项及下一阶段验收标准 |
| [修改与优化记录](change-log.md) | 所有功能、修复、视觉优化、复测、配置和文档调整的统一历史入口 |
| [记录模板](change-template.md) | 下一轮修改使用的固定字段与完成检查 |
| [产品设计](product-design.md) | 当前产品方向、模块边界、工程原则和演进阶段 |
| [实施计划目录](plans/) | 各轮具体方案、取舍和实施范围；被撤销方案以原文状态为准 |
| [验证记录](verification.md) | 各阶段详细检查、环境、结果与限制，包含历史失败和后续修复 |
| [模型空间账本设计](plans/2026-10-20-model-storage-design.md) | 0.9.0 只读模型共享块与独占占用的设计、取舍及验收边界 |
| [清理依据与核验计划](plans/2026-10-21-cleanup-trust.md) | uv 规则证据、整目录保护、变化复核及扫描／执行状态边界 |
| [缓存模块选择策略](cleanmymac-selection-policy-re.md) | 拒绝确认的取消选择实现、最新移动设备备份提示条件及覆盖边界 |
| [选择类型与错误说明](cleanmymac-errors-re.md) | 选中事件、确认弹窗、默认错误处理器及权限错误分类 |
| [按钮与选择确认](cleanmymac-confirmation-re.md) | footer 主操作绑定、选择事件确认、拒绝处理及留白行为差距 |
| [清理入口与结果界面](cleanmymac-clean-ui-re.md) | 页面首次启动、主操作检查、缓存容器更新和结果数字来源 |
| [清理队列与结果更新](cleanmymac-clean-queue-re.md) | 订阅后启动、取消、部分失败、成功节点筛选与确认入口缺口 |
| [缓存节点到清理器绑定](cleanmymac-cleaner-binding-re.md) | 节点选择、容器路径、任务与移除器的静态连接及动态验证缺口 |
| [缓存知识库执行链](cleanmymac-knowledge-base-re.md) | 真实查询与匹配分支、数据库只读对照和未读出规则的限制 |
| [系统垃圾用户缓存深入逆向](cleanmymac-system-junk-re.md) | 函数级调用、8 组目标类受控验证、清理边界及未还原项 |
| [CleanMyMac 静态分析](cleanmymac-static-analysis.md) | 已安装 5.7.2 的结构、签名和权限线索，以及独立实现的取舍 |
| [REA 工具试用报告](rea-evaluation.md) | 外部逆向分析工具的实测能力、失败与适用边界，不代表已复刻同类产品 |
| [macOS 实机权限验收](manual-permission-check.md) | 必须在真实应用中确认的系统权限流程及用户反馈 |
| [项目协作约定](../AGENTS.md) | 每轮改动同步维护记录的要求 |

维护顺序：开始前阅读相关历史 → 明确本轮范围 → 实施与验证 → 补齐记录及必要设计／测试文档 → 汇报并链接本轮条目。

修改历史集中维护，不在多个文档复制同一份版本清单。详细计划和验证文档保留证据，日志用相对链接关联。
