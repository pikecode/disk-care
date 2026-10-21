# 0.9.2 未变：历史交付包清理

日期：2026-10-21 10:25。按用户明确指令删除 release 下五个旧版应用备份：0.8.3／0.8.4／0.8.5／0.9.0／0.9.1。删除前核对 Info.plist 版本与 local.diskcare.desktop 标识，目标为直接子目录且不是符号链接。删除后确认五个目录均不存在；当前 release/留白.app 内容哈希未变，0.9.2 完整签名验证通过。

旧包删除前分配占用合计 54,435,840 字节，约 51.9 MiB，不据此承诺磁盘立即释放等量空间。没有停止旧进程或改变权限、用户缓存、研究资料及构建缓存；不运行无关业务测试或重新打包。README、文档链接及 27 条日志编号／索引／六字段检查通过。此前记录中的备份保留是历史事实，现在已按要求删除，不能再作为回退包使用。

明细：output/release-history-cleanup/result.json；见 [20261021-004](change-log.md#change-20261021-004)。

---

# 0.9.2 未变：实机授权状态核对

日期：2026-10-21。用户表示已授权后核对真实系统设置：留白完全磁盘访问条目关闭，直接辅助功能 AXCheckBox 的 AXValue=0、enabled=1；REA 的 null 值不足以判断，已用系统接口交叉核实。磁盘包是 0.9.2，留白 PID 11931 自前一天 17:28 运行，尚未因更新重启，窗口最小化。当前重启提示属于 CleanMyMac.app，未操作。

当前检查进程无法只读打开 TCC 数据库，未提权或修改权限；没有重启、停止进程、扫描、清理或重新打包。未逐项核验文件与文件夹授权，未确认旧进程的界面版本，也未将之前模拟 IPC 和签名有效当作新版已授权的证据。已记录本地观察与限制，文档及修改记录结构检查通过。

详见 [实机检查](manual-permission-check.md)、[20261021-003](change-log.md#change-20261021-003)。

---

# 0.9.2：uv 清理依据、保护与核验

日期：2026-10-21，Apple Silicon macOS。目标是独立规则的实际行为，不以 CleanMyMac 研究代替产品验证。

- Rust 默认测试 50 项通过、7 项忽略；新增四组覆盖元数据同大小修改／新增／根替换／符号链接、保护持久化与损坏设置、覆盖状态与取消保留目标、命令状态与后测分离及旧数据兼容。缓存根被替换为普通文件时明确阻止。格式检查与 Clippy --all-targets -- -D warnings 通过。
- 清理分类 TypeScript 断言通过，补充保护证据与未完成覆盖状态即使其他字段看似合格仍不可预览；旧格式保持兼容。TypeScript／Vite 生产构建通过。
- 四组模拟 IPC 界面通过：新增 cleanup-trust-ui-smoke、原 ui-smoke、cleanup-analysis-ui-smoke、scan-recovery-ui-smoke。验证规则与恢复说明、保护写入失败不丢失清单、保护后禁选／解除需重扫、无自动扫描、覆盖状态、已确认权限拒绝才显示设置入口、确认页依据、跳过及剩余观测、磁盘负变化、旧历史兼容。960 像素最小窗口无横向溢出，完整覆盖用中性色、失败／跳过用提示色；不重复展示已有结构化依据的通用恢复提示。
- 独立临时 uv 缓存通过真实官方命令清理，后测为目录不存在、旁边哨兵内容不变；该测试没有执行 Engine 完整流程。临时 pip 缓存另跑完整扫描→预览→执行→历史保存→单次令牌失效流程，通过，哨兵保留。这验证公共引擎通道，不替代 uv 全链。
- 尝试 uv 引擎完整夹具时，本机存在运行中的 uv 进程，扫描结果被运行进程保护阻止；测试未到达预期的元数据变化分支。没有停止进程或绕过保护。保留独立 ignored 测试 official_uv_engine_flow_in_fixture，要求无关联运行进程后再执行；当前不将其标记通过。默认忽略的其他本机扫描项目未全部重跑。
- 初次界面测试脚本误以为常规扫描有确认勾选、使用了不存在的展开按钮标签；修正为当前真实界面选择器后通过。两项旧界面断言仍期待“清理已完成”，根据新语义调整为“命令均已完成，请查看核验结果”后回归通过，不能据此称目录已清空。
- 最终构建包、暂存包和发布包的完整签名、0.9.2 版本及标识检查通过；0.9.1 备份内容哈希未变且签名有效。文档 UTF-8／本地链接、25 条编号与索引及六字段、版本一致性检查通过。没有清理用户真实缓存、读取用户缓存文件正文、改变系统隐私权限、停止用户程序或引入新依赖。临时签名不保证升级后授权继续保留，系统弹窗仍需独立实机验收。

证据：`output/playwright/cleanup-trust-092.txt`、`ui-smoke-092.txt`、`cleanup-analysis-ui-smoke-092.txt`、`scan-recovery-ui-smoke-092.txt`。截图为模拟数据：`cleanup-trust-092-evidence.png`、`cleanup-trust-092-result.png`。本地编译检查产物在 `output/cleanup-trust/`。

```sh
/Users/peakom/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml
/Users/peakom/.cargo/bin/cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
/Users/peakom/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml core::tests::official_uv_cleanup_in_fixture -- --ignored --exact --nocapture
/Users/peakom/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml core::tests::official_pip_flow_in_fixture -- --ignored --exact --nocapture
```

四组界面脚本按既有 Playwright CLI 的 run-code 方式在独立会话执行，本地 Vite 监听 127.0.0.1:1420；所有清理调用均为模拟 IPC。规则证据目前仅覆盖 uv 默认缓存，其他类别未获得同等元数据／目录后测能力。元数据摘要不能消除最后一次检查后的并发变化，也不证明没有依赖；可用空间是数据卷期间观测，不能证明由某条命令释放。

详见 [实施计划](plans/2026-10-21-cleanup-trust.md)、[修改记录](change-log.md#change-20261021-002)。

---

# 0.9.1 未变：缓存知识库查询链取证

日期：2026-10-21。本轮无产品代码改动或打包。

- 六模块、两个包内资源前后 SHA-256 一致；两个资源副本结束后哈希与记录的源一致。
- 36 行函数导出排重为 32 个模块／函数地址，全部 completed=true；仍保留 Ghidra 类型编码与地址警告，不将完成标记当作语义完全准确。
- 原安装包 FMDB 独立进程四组对照通过：自有库正确密钥读取且拒绝写入、错误密钥失败、两个包内资源副本无密钥读取失败。cipher_version=3.4.2。未调用真实知识库匹配 API，未读出真实规则表。
- CleanMyMac codesign --verify --deep --strict 退出 0；留白 npm run verify:mac 通过，交付仍为 0.9.1。
- 研究脚本语法、文档 UTF-8／本地链接、24 条日志编号及固定字段检查通过。未运行无关 Rust／产品界面测试。

证据与限制见 [本轮报告](cleanmymac-knowledge-base-re.md)、[研究脚本](../scripts/research/cleanmymac/README.md)、[修改记录](change-log.md#change-20261021-001)。

---

# 0.9.1 未变：CleanMyMac 用户缓存核心链深入逆向

日期：2026-10-20。该轮仅研究与文档，没有开发留白功能或重新构建应用。

- 官方 Ghidra 12.1.4 归档 SHA-256 与发布资产一致。首次 doctor 提示缺少 macOS arm64 原生反编译器；从随包源码构建后 doctor 退出 0。没有运行 REA setup、安装全局代理配置或重置系统权限。
- REA 6.7.0 analyze／search／decompile 通过；随后用自有 Ghidra 脚本从本地分析项目导出 22 个选定入口，均标记反编译完成，包含辅助函数与消息桩，不代表全部功能或 22 条规则。保存伪代码及控制流／类型警告；普通移除与废纸篓消息选择子另用 otool 交叉确认。
- 自有原生测试进程链接真实 SystemJunkScanning 框架，执行继承的目标扫描方法；8 组样本通过，覆盖基类／Gradle 自动选择差异、未授权／已授权替身、零大小回退、名称与路径忽略、深入分支的零大小子项。文件服务、知识库与特权状态受限替身替代，不等于真实知识库或 IPC 的端到端验收。7 个新样本文件内容保持原始 fixture。
- 目标本身已运行，辅助功能和录屏预检通过，无需新授权；三次只观察确切目标窗口，节点上限 250／1500／250 均截断。初始与结束都显示已选择 1101 项、21.8 GB；没有点击或新扫描，不将原有结果当成默认规则证据。
- 六个目标框架前后哈希一致，CleanMyMac 完整签名校验通过；留白 0.9.1 交付包 verify:mac 通过。没有执行实际清理、真实特权请求或许可绕过。
- 保留自有研究脚本于 scripts/research/cleanmymac；入口环境与成功／失败退出码检查、文档编码／链接和日志结构校验通过。不运行无关的 Rust／产品 UI 测试或重新打包。

未还原：真实 cmmkb 规则内容、CMPaths 全部展开、分类到清理器绑定、Swift 部分闭包／协议调用、真实文件服务和特权进程行为，以及日志／Xcode／语言等其他类别。结果是用户缓存核心链第一阶段，不是 CleanMyMac 或系统垃圾模块完全还原。

详见 [深入报告](cleanmymac-system-junk-re.md)、[研究复现](../scripts/research/cleanmymac/README.md)、[20261020-006](change-log.md#change-20261020-006)。

---

# 0.9.1 模型账本资源与展示修复验证

日期：2026-10-20；平台：Apple Silicon macOS。release/留白.app 已更新为 0.9.1；release/留白-0.9.0.app 保留备份。

- 首先在独立测试子进程将文件句柄软额度降到 64，构造 200 个模型共享一个块；0.9.0 遍历队列积压目录句柄，复现 Too many open files，测试失败。证据：output/model-storage/low-fd-before.txt。没有改变主测试进程、应用或系统资源额度。
- 改为相对名称队列，从固定清单根逐级 openat + O_NOFOLLOW，修复后同样场景完整识别 200 模型、1 个去重块，全部共享且独占为零。新增另一测试验证根目录被替换仍读取原固定根、中间目录换成链接后拒绝读取。
- Rust 自动测试 46 项通过、6 项默认忽略；Clippy --all-targets -- -D warnings 与 rustfmt --check 通过。本轮未重跑全部忽略项，既有真实项目基线和外部清理工具验收不计为本轮通过。
- 另执行默认模型仓库真实只读检查：complete，1 个模型、734 个文件块、3,975,884,800 字节分配占用、3,973,456,016 字节逻辑大小，读取问题 0。与前次观测一致，不表示可回收量；未读取模型正文或执行删除。
- 四组相关模拟 IPC 界面流程通过：模型账本、项目账本、关系图、扫描授权。模型测试使用 23 模型／123 块，验证文件依据展开前无列表，展开显示 50 条，继续显示 100／123 条，末页没有更多按钮；折叠移除列表，再展开回到 50 条。不完整与停止状态在折叠摘要直接可见。旧数据、分页、搜索、项目焦点跳转、小窗口和没有清理调用检查继续通过。
- TypeScript／Vite、Tauri 原生打包通过。构建包、暂存包、最终发布包的完整签名、标识及 0.9.1 版本校验通过。此次没有重跑无关的全部旧界面和数据布局断言，不引用上轮结果代替。
- 截图已检查，沿用现有界面风格；output/playwright/model-storage-091.png 是模拟数据。日志见 output/playwright/ui-091-summary.json、*-091-result.txt；output/model-storage/tests-091.txt、clippy-091.txt、live-091.txt、build-091.txt、bundle-verification-091.txt。

限制：真实 macOS 授权弹窗仍未验收；完整临时签名不代表系统授权且升级可能要求重新授权。只支持默认模型仓库，扫描不是原子快照，APFS 克隆等物理共享限制保持。较低句柄额度测试证明已修复目录积压，不保证在系统本身资源耗尽时仍可完整扫描。清理与授权范围没有扩大。

记录与方案：[20261020-005](change-log.md#change-20261020-005)、[本轮计划](plans/2026-10-20-model-ledger-hardening.md)。

---

# 0.9.0 只读模型空间账本验证

日期：2026-10-20；平台：Apple Silicon macOS。应用已更新至 release/留白.app，旧版保留为 release/留白-0.8.5.app。

## 自动与实机检查

- cargo test：44 项通过，默认 6 项忽略；另行执行新增默认模型仓库只读检查和既有真实项目扫描，两项均通过。其余外部工具／大范围真实扫描忽略项未重跑，没有真实删除用户数据。
- 新增 7 组自动测试覆盖共享块和重复摘要、硬链接和外部链接、坏清单／缺块／摘要穿越、符号链接／FIFO／超大文件、取消／截止时间／条目限制、不同仓库名称／声明大小错误／路径替换、733 层大型清单及累计读取预算。
- Clippy --all-targets -- -D warnings、rustfmt --check、TypeScript／Vite 生产构建通过。
- 十组 Playwright 界面流程通过：新增模型账本，加上项目账本、关系图、空间地图、扫描授权、扫描恢复、清理分析、分析动作、视觉清晰度及清理确认闭环。全部模拟 IPC；新测试验证完整／部分／目录不存在／旧报告、分页、搜索、项目跳转焦点、小窗口无横向溢出及没有清理调用。
- 既有关系图、空间布局、清理分析三套 TypeScript 断言通过。
- 真实默认仓库只读结果：complete，1 个模型、734 个文件块；去重分配空间 3,975,884,800 字节，逻辑大小 3,973,456,016 字节，读取问题 0。数字只覆盖清单关联文件，不是整个仓库大小或可回收量。原始报告：output/model-storage/live-report.json。
- 真实项目扫描通过：本项目目录识别 4 个项目、4 个产物，完整、读取问题 0，首次 667ms；重复扫描与基线、拒绝 /opt 的断言通过。仅更新应用自身项目基线，没有清理项目。
- Tauri 原生打包通过；构建包、暂存包和最终发布包的完整签名、版本、标识及资源清单校验通过。最终版本 0.9.0，local.diskcare.desktop。

## 失败、修正与限制

首次只读检查发现实际模型清单 150,854 字节、733 个层，超过初始 64 KiB／256 层限制；正确返回部分结果而非零模型。改为单清单 1 MiB／4,096 层，另加累计 8 MiB 和总引用 8,192 限制，补充测试后真实读取通过。没有放宽符号链接或删除边界。

实现期间修正 Progress 的 usize 类型；Clippy 指出的三个测试切片 clone 改为 from_ref。初次界面测试的“无法确认”匹配多个折叠行，收窄断言到首行后通过；去掉等候隐藏说明超时再展开的测试写法。首次 shell 未找到 cargo，后续使用绝对路径；Playwright 包装脚本没有执行位，改为 bash 调用。未改变全局 shell 或工具配置。

没有重置或自动授予权限；此次未验收真实 macOS 授权弹窗。临时签名升级可能要求重新授权，完整签名通过不代表系统已授权。模型目录仅默认仓库；文件关系非原子快照，不能识别全部 APFS 克隆或并发变化。未提供模型删除、杀毒或自定义仓库功能。

证据：output/playwright/ui-090-summary.json、*-090-result.txt、model-storage-090.png；output/model-storage/bundle-verification.txt。部分 UI 日志保存的是执行代码及 CLI 状态；截图与模拟 IPC 不作为真实授权验收。

设计与改动见 [账本设计](plans/2026-10-20-model-storage-design.md)、[实施计划](plans/2026-10-20-model-storage-implementation.md)、[20261020-004](change-log.md#change-20261020-004)。

---

# 0.8.5 未变：三个框架定点检查

日期：2026-10-20。REA inspect-macho 检查 PermissionsKit、LocalModelScanning、JunkCleanupModule 均退出 0；三个框架前后哈希一致。swift-demangle 成功解码导出名称；观测导出 14／160／368 条，均标记不完整。仅静态结构证据，不代表实际清理规则或功能验收。未运行业务测试或重新打包。

见 [补充分析](cleanmymac-static-analysis.md) 与 [20261020-003](change-log.md#change-20261020-003)。模型空间账本目前只有设计，尚未实现或测试。

---

# 0.8.5 未变：CleanMyMac 静态检查

日期：2026-10-20。

已定位 CleanMyMac_5.app 5.7.2，REA 签名、Mach-O、应用清单三个命令退出 0；清单图谱子步骤完成。独立 codesign --verify --deep --strict 退出 0；主二进制前后 SHA-256 一致。未启动目标、清理或改变权限，未验证真实功能和授权交互，未反编译。产品代码与版本未变，没有重新打包或运行业务测试。

证据与局限见 [分析报告](cleanmymac-static-analysis.md)，变更见 [20261020-002](change-log.md#change-20261020-002)。下方未找到应用的描述属于此前试用时的历史结果。

---

# 0.8.5 未变：REA 独立工具试用

日期：2026-10-20。

- 固定 rea-agents 6.7.0，独立安装、禁用生命周期脚本；未运行 setup 或接入产品依赖。
- 留白应用的 Mach-O、签名信息及结构清单检查通过；小型逻辑夹具静态分析通过，2 个 JS 文件、373 个 AST 节点。
- 完整前端压缩包在 256 MiB 和 512 MiB 工作进程堆限制下均未完成 JS 分析，虽然退出码为 0，仍只计为部分结果；Ghidra 诊断未就绪，未进行原生深度反编译。
- 本机常用应用路径未找到 CleanMyMac，没有对该应用内部实现作结论。工具试用不等于功能复刻。
- 原生二进制和前端文件哈希前后相同；npm run verify:mac 仍通过。没有执行目标程序或清理，应用版本与功能未变，未重复业务测试及打包。

完整方法、环境、来源、失败原因与保存位置见 [REA 试用报告](rea-evaluation.md)，本轮变更见 [20261020-001](change-log.md#change-20261020-001)。

---

# 0.8.5 结果页精修验证

日期：2026-10-19。

- 顶部候选总占用保留，分类改数量；缓存建议改紧凑行，恢复影响和 uv 注意事项保持可见；列表状态统一使用 cleanupLabels。
- 九组界面流程通过：扫描确认、异常恢复、清理闭环、分析操作、分析分类、项目账本、关系图、空间图和扩展后的 ui-clarity-smoke.js。
- ui-clarity 增加候选入口联动、空筛选恢复保留选择、取消选择保留筛选、无自动预览清理；960×660 检查取消选择和预览按钮均在窗口内，1180×820 额外断言第一项缓存的预览入口位于首屏并保存截图。
- 清理资格、过期时间、隐藏选择保护、预览确认及执行闭环原回归通过；视觉测试均为模拟 IPC，没有真实删除用户数据。
- TypeScript/Vite、Tauri 原生构建及完整应用包签名校验通过，版本 0.8.5。Rust 业务未改，未重跑 Rust 测试。
- 截图：output/playwright/overview-085.png、results-detail-085.png。旧版 0.8.4 保留供回退。

限制：不涉及真实 macOS 授权复验，临时签名更新可能需要用户重新授权。图形页保留原布局；此次只调整结果页信息层级和交互回退。

---

# 0.8.4 界面清晰度验证

日期：2026-10-19；平台：Apple Silicon macOS。

- 首页改为直接标题与三步操作提示；范围选择卡片化，技术路径、授权教程、统计解释和其他目录占用渐进展开；清理栏仅在选择项目后出现。
- 九组界面检查全部通过：扫描确认、异常恢复、清理闭环、分析操作、分析分类、项目账本、关系图、空间图，以及新增 ui-clarity-smoke.js。
- 新增 1180×820 和 960×660 验证：默认常规扫描无需滚动；扩展扫描展开授权帮助后操作仍在窗口内；取消不启动扫描；确认门槛不变；扫描后更新当前阶段；不自动勾选；无选择时不显示清理栏；无横向溢出或浏览器运行错误。
- 截图：output/playwright/scan-settings-basic-084.png、scan-settings-extended-084.png、overview-084.png。均为模拟 IPC 数据。
- TypeScript/Vite 和 Tauri 原生打包通过；完整应用包临时签名校验通过，版本 0.8.4，标识 local.diskcare.desktop。后续交付继续要求运行 npm run verify:mac。
- 扫描、项目分析、清理资格及删除逻辑未改变，因此没有重跑 Rust 测试；没有新增依赖。所有界面执行调用均模拟，没有真实删除用户数据。

限制：本轮完成的是界面层级整理，不代表真实 macOS 权限问题验收通过；临时签名更新仍可能需要重新授权。复杂关系图和空间图保留原布局。旧版 0.8.3 保留供回退，不自动关闭旧版进程以免打断操作。

---

# 0.8.3 同版本应用包签名修复

日期：2026-10-19。

证据：实机仍有文稿目录授权提示；旧包 codesign --verify --deep --strict 失败，错误为 code has no resources but signature indicates they must be present。它是已确认的交付缺陷，但不能仅凭截图将弹窗直接归因于此。

- 保留 0.8.3 版本及业务逻辑，只对完整应用包重新签名，统一签名标识 local.diskcare.desktop 并封装资源。
- Tauri 配置 signingIdentity 为 -，后续打包使用完整临时签名；新增 npm run verify:mac，只读验证签名、版本、包标识和资源清单。
- 正向验证修复包通过；旧包校验失败可复现；临时副本新增资源及修改 Info.plist 的两个篡改场景均被拒绝。所有负向测试在临时副本完成。
- 原包保留为 release/留白-0.8.3-签名前.app；当前 release/留白.app 已通过完整签名校验。未自动启动第二份应用，以免旧扫描与新包混淆。
- 没有更改文稿扫描范围，没有执行清理、操作钥匙串或修改系统隐私授权。业务代码未修改，未重复 Rust/界面回归或完整原生构建；未来 Tauri 自动签名配置依据官方支持，尚未重跑完整打包。

边界：完整临时签名有效不代表系统权限已经授予，亦不能保证跨构建保留隐私授权。稳定分发身份与公证需要正式 Developer ID。仍需退出旧进程后从当前固定路径重开，再由用户核实系统授权状态和扫描行为。

参考：https://developer.apple.com/documentation/technotes/tn3127-inside-code-signing-requirements 与 https://v2.tauri.app/distribute/sign/macos/ 。

---

# 0.8.3 其他应用数据边界修复验证

日期：2026-10-19；实机系统：macOS 15.7.7。

实机反馈：0.8.2 仍出现“留白.app 想访问其他 App 的数据”，原权限验收不通过。截图不能证明具体目录或完全磁盘访问状态，不将其归因于用户操作。

- 新增共享纯路径边界，访问前跳过常见 Library 应用私有目录；固定规则、递归遍历、目录展开、自定义缓存和项目扫描均使用边界限制。本应用历史与基线仍使用原专用接口，不被扫描边界阻止。
- Rust 37 项通过、5 项手动环境测试忽略；Clippy 所有目标无警告。新增嵌套应用数据不进入统计、直接扫描和展开受阻、自定义缓存受阻、正常缓存不受影响、项目嵌套排除不计作系统错误等断言。
- TypeScript/Vite 构建通过。扫描前确认、异常恢复、项目账本、清理闭环与分析分类五组界面检查通过。异常恢复新增主动排除显示与零读取错误检查。
- 主动跳过使父目录统计不完整，但不增加系统读取错误计数；界面明确未读取不代表占用为零，增加权限不会改变排除策略。
- 交付 0.8.3，保留 0.8.2。没有执行真实清理、重置用户授权或点击系统允许按钮。

限制：已知路径排除不是完整 macOS 权限模型，仍可能遇到其他受保护位置及系统弹窗。Docker、企业微信容器和其他排除目录不再默认分析，因此不能宣称完整磁盘统计。新包仍需实机复验，当前未记录 0.8.3 系统弹窗验收通过。

---

# 0.8.2 集中授权指引验证

日期：2026-10-19；平台：Apple Silicon macOS。

- Rust 34 项测试通过、5 项手动环境测试忽略；新增应用包路径校验，覆盖中文和空格路径、开发可执行文件、伪造包结构。Clippy 所有目标无警告。
- TypeScript/Vite 生产构建通过。
- 四组界面检查通过：扫描前确认、异常恢复、项目账本、清理闭环。扩大 scan-access-ui-smoke.js 覆盖定位成功返回当前应用路径、定位失败提示、打开设置或定位均不标记已授权、无自动扫描、960×660 弹窗可滚动并能访问开始按钮；同时捕获浏览器控制台错误。
- 后端设置入口仅打开固定完全磁盘访问深链，失败回退系统设置主页；应用定位只使用当前进程路径，不接受前端路径参数。未引入新依赖，不读 TCC 数据库，不用文件探测推断授权。
- 原生交付 release/留白.app 为 0.8.2，旧版保留 release/留白-0.8.1.app。

限制：设置深链被系统接受不代表已显示目标页，更不代表已授权；界面保留手动导航路径。未自动点击系统权限开关，未重置权限，真实系统跳转和 Finder 定位仍需在打包应用中验收。尚未配置稳定分发签名，更新后可能再次需要授权。界面回归扫描及清理均使用模拟 IPC，没有删除用户数据。

官方参考：https://developer.apple.com/documentation/security/accessing-files-from-the-macos-app-sandbox?language=objc 。

---

# 0.8.1 完整界面复验

日期：2026-10-19。

- 当前版本生产构建通过；清理分析、关系数据和空间布局三组算法断言通过。
- 八组界面脚本全部通过：scan-access、scan-recovery、ui、project、relationship、space-map、cleanup-analysis、analysis-actions。日志保存在 output/playwright/*-081-final.txt。
- 加强异常恢复测试，同时捕获浏览器控制台错误；独立重跑通过，未发现重复 React key 或运行时错误。
- 所有扫描及删除 IPC 均为模拟，本轮未真实清理缓存，未更改系统隐私授权。Rust 业务逻辑未变，未重复编译 Rust 或原生应用；现有交付包仍为 0.8.1。
- 真实系统权限的最小验收步骤见 docs/manual-permission-check.md。当前未记录真人实机验收结果，不将模拟通过视作系统授权验证通过。

---

# 0.8.1 统计不完整与恢复提示验证

日期：2026-10-19；平台：Apple Silicon macOS。

- 新增 scripts/scan-recovery-ui-smoke.js，通过模拟 IPC 验证扩展根目录明细、失败位置与原始原因展示、设置打开失败反馈、无自动复扫、取消与完整结果切换、没有执行清理。
- 扫描范围确认、清理闭环、项目账本及分析操作四组界面回归通过；修复并列组件 React key 重复造成的旧提示残留，新恢复测试重跑通过。
- 960×660 模拟结果页无横向溢出。测试数据用于验证异常展示，不代表真实目录扫描结果。
- TypeScript/Vite 和 Tauri 原生构建通过；没有新增依赖，Rust 业务行为未修改，因此沿用 0.8.0 的 Rust/Clippy 检查结果，未重跑 Rust 测试。
- release/留白.app 更新到 0.8.1，保留 release/留白-0.8.0.app。

限制：结果说明复用已有读取问题和完整性字段，不把所有错误推断为权限拒绝；不探测系统授权状态。未逐一实测 macOS 首次授权、拒绝后授权和跨版本行为；所有界面扫描和清理调用均为模拟，没有读取用户受保护目录或删除用户数据。

---

# 0.8.0 扫描前权限与范围验证

日期：2026-10-19；平台：Apple Silicon macOS。

- TypeScript/Vite、Tauri 原生应用打包通过，版本 0.8.0，约 10.33 MiB；已核验应用包包含桌面、文稿、下载目录的中文权限用途说明。
- Rust 33 项通过、5 项环境手动测试忽略；Clippy 所有目标无警告。新增测试验证常规扫描只有三个默认缓存，主要目录为空。
- 新增 scripts/scan-access-ui-smoke.js 模拟 IPC 验证：确认前无扫描请求、取消不扫描、常规缺省、扩展需要确认、打开设置不视为授权成功、下次扫描恢复常规。
- 原六组界面回归全部通过：清理闭环、项目账本、关系图、空间图、分析分类及筛选操作；项目扫描先确认目录。执行清理均为模拟，没有删除用户数据。
- 960×660 弹窗边界检查通过；截图 output/playwright/scan-access-080.png。
- 交付 release/留白.app；旧版保留 release/留白-0.7.0.app。

限制：未重置用户 TCC 权限，未在不同系统版本/首次授权/拒绝后重新授权场景逐一实机验证。UI 确认不代表系统授权；常规模式也不保证零权限弹窗。正式分发仍需稳定签名及系统授权回归。

---

# 0.7.0 分析操作验证记录

日期：2026-10-19；平台：Apple Silicon macOS。本轮完善已扫描数据的筛选和处理建议，Rust 扫描与删除接口未修改。

## 检查结果

- `scripts/cleanup-analysis-check.ts` 通过：沿用分类与资格检查，新增五种状态、uv 恢复影响、完整性建议、原始阻碍、模型引用边界、容器卷、个人备份、未知只读规则和零观测处理说明。
- `scripts/analysis-actions-ui-smoke.js` 模拟 IPC 检查通过：概览重置用途并联动清单、双筛选、可见范围全选/取消、保留隐藏选择、只读页禁全选、完整预览原有隐藏选择且不添加其他项、取消不执行、模型/Docker/受阻建议、空筛选、模型到项目账本跳转不自动扫描。
- `scripts/cleanup-analysis-ui-smoke.js` 与 `scripts/ui-smoke.js` 原分析/清理界面回归通过。新操作测试不调用 execute_cleanup；旧闭环中的执行完全模拟，没有删除用户数据。
- 960px 窗口无横向溢出，隐藏选择提示可见，键盘按钮与分类 pressed 状态可用。截图 `output/playwright/analysis-actions-070.png` 展示模拟模型建议、只读禁选及筛选外已有选择提示。
- TypeScript/Vite 生产构建与 Tauri 0.7.0 原生构建通过，app 约 10.33 MiB。没有新增依赖。
- Rust 业务代码、项目空间和关系图算法未变，本轮未重跑 Rust/Clippy、真实扫描及其他图形界面检查；历史覆盖见此前记录。

## 使用与交付

点击概览中的分类卡片可跳到原空间清单。状态筛选与用途筛选叠加；概览入口先重置用途为全部。筛选不会改动选择，全选只影响当前可见合格项。筛选外仍有选择时清理栏会明确提示，预览始终完整列出实际选择。

模型详情的“查看项目账本”仅切页；用户需要自行启动项目扫描以获取当前声明范围内的引用证据。处理建议只使用既有结构与规则事实，不解析中文阻止原因推断身份，不自动杀进程、提权或执行外部管理工具。

0.7.0 已交付 `release/留白.app`，0.6.0 保留为 `release/留白-0.6.0.app` 供回退。已启动并核验原生窗口标题；交付后通过 cargo clean 清除本轮编译产物，并关闭本轮开发预览和测试浏览器。

## 复现

```sh
npm run build
task_output=$(mktemp -d "${TMPDIR:-/tmp}/disk-care-actions-check.XXXXXX")
./node_modules/.bin/tsc --target ES2022 --module commonjs --moduleResolution node --outDir "$task_output" scripts/cleanup-analysis-check.ts
node "$task_output/scripts/cleanup-analysis-check.js"
source "$HOME/.cargo/env"
npm run tauri build -- --bundles app
```

三套界面脚本使用独立 Playwright CLI 会话，通过 `run-code` 传入去掉末尾分号的函数表达式；原始输出保存在 `output/playwright/*070-result.txt`。

## 限制

未新增项目、模型、Docker、个人文件的删除权限；仅 uv/npm/pip 合格缓存可通过原流程确认清理。处理建议不能证明没有依赖或可以完整恢复。占用不等于实际可释放量。没有真实原生端到端删除、签名/公证、Intel 或其他系统验证。

---

# 0.6.0 可清理空间分析验证记录

日期：2026-10-19；平台：Apple Silicon macOS。根据用户纠正，移除未发布的目标输入、组合优化和目标达标判断，改为先分析实际数据。Rust 扫描和删除接口未修改。

## 检查

- `scripts/cleanup-analysis-check.ts` 分类断言通过：仅累计实际合格缓存；受阻、只读、零观测独立分类；uv 排在下载缓存之后且明确恢复影响；重复 ID、空阻止字符串、非法占用、缺工具和统计问题均不开放预览。
- `scripts/cleanup-analysis-ui-smoke.js` 模拟 IPC 检查通过：无目标输入、默认无选择；2 GiB 合格缓存不把另有 43 GiB 的只读/受阻观测凑入清理；阻碍依据、单项预览/取消/确认、实际释放 512 MiB、执行后扫描失效、空候选、扫描过期及 960px 宽度。
- 原 `scripts/ui-smoke.js` 缓存清理流程回归通过：手动选择、预览、取消、执行、失败、历史、扫描失效和目录分页。分析面板与原清单使用同一资格函数和预览方法。
- TypeScript 与 Vite 生产构建通过。Tauri 0.6.0 原生构建通过，约 10.33 MiB；已交付 `release/留白.app` 并核验原生窗口，0.5.0 备份保留。交付后清除本轮编译产物与预览服务。
- 本轮不涉及项目、地图或关系图算法，不重复无关界面和 Rust 业务测试；未删除用户缓存、项目、模型或数据库。界面使用模拟 IPC。

## 复现

```sh
npm run build
task_output=$(mktemp -d "${TMPDIR:-/tmp}/disk-care-analysis-check.XXXXXX")
./node_modules/.bin/tsc --target ES2022 --module commonjs --moduleResolution node --outDir "$task_output" scripts/cleanup-analysis-check.ts
node "$task_output/scripts/cleanup-analysis-check.js"
source "$HOME/.cargo/env"
npm run tauri build -- --bundles app
```

界面脚本以 Playwright CLI `run-code` 执行去掉末尾分号的函数表达式。截图 `output/playwright/cleanup-analysis-060.png` 为模拟分类数据，不是用户真实可回收量。

## 限制

可执行范围仍只有 uv/npm/pip 固定官方命令；其他数据只供分析。合格缓存占用可能受共享硬链接、APFS 克隆、快照和并发活动影响，不能保证全部释放。没有合格数据时不会为了释放量扩大范围；“没有测得正占用”不能证明机器没有其他可处理数据。真实原生启动与模拟界面流程分别核验，不进行原生端到端删除。

---

# 0.5.0 空间地图验证记录

验证日期：2026-10-19；平台：Apple Silicon macOS。本轮只修改前端和版本配置，Rust 扫描、清理及 IPC 结构未修改。

## 自动检查

- `scripts/space-map-check.ts` 布局断言通过：单对象、多对象、300 对象、极端权重；面积比例、合计守恒、无重叠、边界、稳定排序、非法/零输入、聚合权重、同名不同路径项目身份与部分结果标记。
- `scripts/relationships-check.ts` 既有图数据断言继续通过。
- 新增 `scripts/space-map-ui-smoke.js` 模拟 IPC 检查通过：85 项中的 30 个大项加聚合、54 个小项目完整保留及 50 项列表分页、搜索仅过滤列表、键盘展开、逐级/全部返回、零占用入口、恢复条件、精确跳转非首个项目关系、部分/零/空报告及不调用清理接口。
- 浏览器序列化 CSS 百分比存在舍入；当前夹具的面积和为 9999.999324339（目标 10000）。纯布局以严格容差验证，界面检查使用 0.01 面积单位容差。使用内阴影分隔矩形，不给微小项强加边框最小尺寸；微小项可通过文字列表操作。
- 原有关系图、项目账本、缓存清理三套模拟 IPC 脚本全部通过，连同新增地图检查共四套。宽屏详情侧置和 960px 详情下置检查通过，无页面横向溢出；长列表采用独立滚动区域。
- TypeScript/Vite 生产构建与 Tauri 0.5.0 原生构建通过，app 约 10.33 MiB。没有新增运行时依赖。
- Rust 业务代码未修改，本轮未重复运行既有 32 项 Rust 测试、严格 Clippy 或真实全盘扫描；历史结果见 0.4.0 记录。原生构建重新编译了后端及接口。

## 界面与交付

截图：`output/playwright/space-map-050.png`、`space-map-050-min.png`。测试使用模拟报告和模拟 IPC，不删除用户缓存、项目或模型。

0.5.0 位于 `release/留白.app`，已启动并核验原生窗口标题；0.4.0 回退备份为 `release/留白-0.4.0.app`。项目页默认仍为关系图，点击「空间地图」进入面积视图。交付后用 `cargo clean` 清除本轮编译产物，并关闭本轮开发预览和测试浏览器。

## 复现

```sh
npm run build
task_output=$(mktemp -d "${TMPDIR:-/tmp}/disk-care-map-check.XXXXXX")
./node_modules/.bin/tsc --target ES2022 --module commonjs --moduleResolution node --outDir "$task_output" scripts/space-map-check.ts scripts/relationships-check.ts
node "$task_output/scripts/space-map-check.js"
node "$task_output/scripts/relationships-check.js"
source "$HOME/.cargo/env"
npm run tauri build -- --bundles app
```

界面脚本继续使用 Playwright CLI `run-code`，传入去掉末尾分号的函数表达式。运行开发预览后可分别执行 `space-map-ui-smoke.js`、`relationship-ui-smoke.js`、`project-ui-smoke.js` 和 `ui-smoke.js`；各测试用独立会话，结果保存在 `output/playwright/*050-result.txt`。

## 限制

面积仅代表已识别产物观测合计，跨产物/项目硬链接和 APFS 克隆可能重复，不代表完整项目、磁盘占比或可释放量。未计入共享模型、全局缓存或未测量目录，部分结果可能低估。零观测不证明实际无占用。

没有全盘自由布局、通用任意目录树图、额外扫描、自动删除或目标释放量规划。地图与关系切换后地图会回到全部项目；关系跳转会定位已选择的项目。完整交互采用模拟 IPC，未做原生端到端清理、签名/公证、Intel Mac 或其他系统验证。

---

# 0.4.0 关系图验证记录

验证日期：2026-10-19；平台：Apple Silicon macOS。

## 自动检查

- 32 项 Rust 常规测试通过；5 项环境测试默认忽略，本轮手动运行项目只读扫描测试通过。
- 新增旧版 Evidence 兼容测试，验证缺少结构字段时不生成标识；模型证据测试验证 model/source 字段与配置正文不回传。进程证据继续只返回 PID 和路径线索说明。
- `scripts/relationships-check.ts` 数据断言通过：共享模型/PID 去重、同名不同路径项目隔离、同一关联保留多配置来源、连线方向、未知模型大小、旧文字消息不生成节点。
- 严格 Clippy（`--all-targets -- -D warnings`）、TypeScript/Vite 生产构建及 Tauri 原生构建通过，0.4.0 app 约 10.33 MiB。
- `scripts/relationship-ui-smoke.js` 模拟 IPC 界面检查通过：默认关系图、12 个邻居分页、共享模型反查、不同路径同名项目、PID 反查、节点/关系键盘选择、多来源证据、恢复说明、部分占用下限、项目路径搜索、账本切换、部分扫描、旧版证据、空报告及不调用清理接口。
- `scripts/project-ui-smoke.js` 回归通过，另验证关系图项目列表 50/52 项分页；`scripts/ui-smoke.js` 原缓存清理流程回归通过。所有界面清理调用均为模拟 IPC。
- 1440px 三列与 960px 详情下置布局检查通过；960px 无页面横向溢出。截图位于 `output/playwright/relationships-040.png`、`relationships-040-min.png`，分别展示共享模型证据和产物恢复条件。

## 本机验证

- 真实只读扫描自身项目：2 个项目、3 个产物目录、完整且 0 处读取问题，约 223ms。仅代表当前工作目录，不代表全盘速度。
- 0.4.0 已交付至 `release/留白.app` 并启动，原生窗口标题核验通过；0.3.0 保留为 `release/留白-0.3.0.app` 供回退。未删除用户缓存或项目。
- 交付后以 `cargo clean` 清除本轮编译产物，保留独立应用；测试浏览器与开发预览服务在交付前关闭。

## 复现命令

```sh
source "$HOME/.cargo/env"
cargo test --manifest-path src-tauri/Cargo.toml --quiet
cargo test --manifest-path src-tauri/Cargo.toml real_project_scan_smoke -- --ignored --nocapture
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
npm run tauri build -- --bundles app
```

图数据断言无需新依赖：在系统临时目录编译测试，再执行输出文件。以下 `task_output` 仅指本轮生成的测试目录：

```sh
task_output=$(mktemp -d "${TMPDIR:-/tmp}/disk-care-relationships.XXXXXX")
./node_modules/.bin/tsc --target ES2022 --module commonjs --moduleResolution node --outDir "$task_output" scripts/relationships-check.ts
node "$task_output/scripts/relationships-check.js"
```

界面脚本使用既有 Playwright CLI `run-code`，传入去掉末尾分号的函数表达式。日志保存在 `output/playwright/*040-result.txt`。

## 限制

图只表达本次报告中的直接观测，不能证明完整依赖或实时调用；PID 是扫描时身份，不作进程控制入口。模型只支持已安装 Ollama 模型的根部配置引用；模型空间未测量，不推算可回收量。旧版文字证据仍可阅读，但缺少结构字段时不生成关联。

本轮没有全机自由布局、矩形树图、跨扫描关系历史、虚拟环境级进程精确归属、新删除权限或额外运行时依赖。真实后端扫描和原生启动分别核验，完整关系交互使用模拟 IPC；没有原生端到端删除、签名/公证、Intel Mac 或其他系统验证。

---

# 0.3.0 验证记录

验证日期：2026-10-19；平台：Apple Silicon macOS。交付设计第一阶段；项目产物删除与目标空间规划尚未上线。

## 自动检查

- Rust 常规测试 31 项通过（原 21 项与新增项目模块 10 项），5 项依赖本机环境的测试默认忽略。本轮手动运行其中新增项目扫描测试并通过，未重跑旧版 4 项环境测试。
- 新测试覆盖混合/嵌套项目识别、依赖内部伪项目排除、配置大小与符号链接保护、进程路径和模型名边界、敏感正文不回传、恢复限制、取消/超时/深度上限、产物硬链接去重、基线首次/新增/消失/增长/工作目录隔离/损坏/链接保护及部分扫描不覆盖。
- 严格 Clippy（含 `--all-targets -- -D warnings`）通过。
- TypeScript 与 Vite 生产构建通过，Tauri 0.3.0 原生应用构建成功，约 10.31 MiB。
- 原有 `scripts/ui-smoke.js` 模拟 IPC 回归通过：默认不选择、只读禁选、计划确认、取消、成功/失败、历史和扫描失效、目录浏览分页。
- 新增 `scripts/project-ui-smoke.js` 模拟 IPC 检查通过：52 项按 50 项分页、语言筛选、名称/路径搜索、恢复说明、模型证据、基线变化、切页保留报告及工作目录、缓存清理入口、取消/部分结果、后端错误和不触发清理。
- 960px 最小窗口宽度检查通过，无页面横向溢出。截图：`output/playwright/projects-030.png`、`projects-030-min.png`。

## 本机验证

- 对 `~/work/disk-care` 做真实只读扫描，识别 Node 与 Rust 两个项目、3 个产物目录，完整且 0 处读取问题；实测约 212–294ms。该结果只是当前小工作目录的观测，不代表全盘速度。
- 第二次扫描正确读取上次完整基线；带末尾斜线的同一目录归一化后使用同一基线。`/opt` 越界请求被拒绝。
- 基线只含根路径、产物相对路径/大小和时间，权限为 0600；未保存配置正文或进程参数。
- 0.3.0 已复制至 `release/留白.app` 并启动，原生窗口标题核验通过；旧版保留为 `release/留白-0.2.0.app` 供回退。
- 交付后通过 `cargo clean` 清除本次生成的约 4.5 GiB 编译产物，保留独立应用；关闭本轮测试浏览器及开发预览服务。

```sh
source "$HOME/.cargo/env"
cargo test --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml real_project_scan_smoke -- --ignored --nocapture
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
npm run tauri build -- --bundles app
```

界面检查使用 Playwright CLI 的 `run-code`，传入脚本去掉末尾分号后的函数表达式；不把模拟 IPC 打包进应用。脚本日志位于 `output/playwright/`。

## 本阶段限制

未删除用户真实缓存或项目。项目产物目前仅分析；仅识别根部受支持配置、直接子产物和可见进程绝对路径，不能证明全部依赖或可重建性。模型引用仅匹配已安装 Ollama 模型名，不覆盖别名、动态配置和其他模型运行器。完整性指声明范围内的目录与配置观测，不是依赖分析完备证明。

基线仅保留每工作目录最近一次完整观测，最多 20 个目录；部分结果不计算变化。没有多期趋势、自动后台监控、项目删除、目标释放量规划、签名/公证、Intel Mac 或其他系统验证。原生启动与真实核心扫描分别验证；完整交互流程使用模拟 IPC，未对原生窗口执行端到端清理。

---

# 0.2.0 验证记录

验证日期：2026-10-16；平台：Apple Silicon macOS。

## 自动检查

- React/TypeScript 类型检查及 Vite 生产构建通过。
- Rust 常规测试 21 项通过，新增覆盖：版本化 pip 与 npm 脚本识别、普通参数不误报、单卷已用与共享容量分离、负可用量处理、子目录总量、502 个子项分页、分页缓存、未知大目录发现、自定义缓存只读边界、配置链接解析、权限错误完整性、取消与超时。
- 原有路径越界、符号链接保护、硬链接去重、确认过期与单次使用、历史路径保护、命令失败和超时检查仍通过。
- Clippy 严格检查（`-D warnings`）通过。
- Playwright 模拟 IPC 检查通过：默认不选择、只读项禁选、未确认禁执行、取消不执行、成功与失败结果、历史记录、旧扫描失效，以及主要目录入口、200 项分页和继续加载。
- 浏览器示例界面检查通过，清理按钮禁用；不向浏览器开放真实文件访问。
- 0.2.0 原生应用启动与容量读取成功，已核验分段容量图和版本号。

## 本机与临时目录验证

1. 实际扫描原有规则清单和 8 个主要目录通过，约 195 秒。用户目录、系统支持、系统运行数据等存在隐私权限限制，结果显示为部分读取，不承诺全盘无遗漏。
2. 真实 Yarn 缓存的 5157 个子项可返回第一页 200 项及后续分页。
3. uv 官方命令清理临时缓存成功，目录外哨兵文件保留。
4. pip 临时目录完整流程成功：扫描、预览、执行、保存历史、旧扫描失效、凭据不能重复使用；目录外哨兵文件保留。
5. 应用目录 Rust 核心与紧接着执行的 `du -skx` 实测一致：43,750,961,152 字节。`/opt`、`/Library`、数据卷系统目录、共享用户目录和 `/usr/local` 在交叉核对时也一致。

较早的应用目录对照差约 5 MiB，重测一致；其间记录的目录占用有变化。用户目录对照差约 473 MiB，期间正在生成编译产物。这些检查是先后遍历，无法获得文件系统原子快照，不将不同时间的统计差值认定为准确释放量。

4 项依赖本机环境的测试默认忽略，已在本机分别运行：

```sh
cargo test --manifest-path src-tauri/Cargo.toml real_scan_smoke -- --ignored --nocapture
cargo test --manifest-path src-tauri/Cargo.toml real_apps_crosscheck -- --ignored --nocapture
cargo test --manifest-path src-tauri/Cargo.toml official_uv_cleanup_in_fixture -- --ignored --nocapture
cargo test --manifest-path src-tauri/Cargo.toml official_pip_flow_in_fixture -- --ignored --nocapture
```

界面脚本 `scripts/ui-smoke.js` 可将文件内容去掉末尾分号后，作为函数表达式传入 Playwright CLI 的 `run-code`。它仅向测试浏览器注入模拟 IPC，不包含在生产应用中。截图位于 `output/playwright/`。

## 限制

未清理用户真实缓存；未验证所有项目单独配置的缓存、自定义目录自动清理、其他用户与其他卷的完整占用。未做开发者身份签名、公证、Intel Mac 或其他操作系统测试。运行依赖检查无法排除隐藏依赖与检查后的进程变化。
