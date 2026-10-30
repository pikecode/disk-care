# MangoDisk 对照分析与借鉴建议

日期：2026-10-22。留白基线 0.9.4。参考仓库 pikecode/MangoDisk，提交 `032e1e140dec2e28d0bef3232f3f2197cbd4a4d9`；该仓库是 harry0703/MangoDisk 的分叉。本轮仅作静态分析，不修改产品行为、不移植代码、不增加删除规则。

## 定位与差异

MangoDisk 是跨 macOS／Windows／Linux 的磁盘与系统工具集合，README 声明包括清理、重复文件、空间图、卸载、启动项、维护、资源监控及 AI 解释。留白目前集中在 macOS 开发缓存、项目产物关系、模型与 AI 工作数据的可审核分析。功能声明不能作为实机有效或安全的证明。

两者后端均为 Rust + Tauri 2；MangoDisk 前端是 Vue，留白是 React，不建议为参考它切换框架。MangoDisk 使用 core、platform、cli、privileged 和 protocol 等工作区成员，适配其跨平台与多入口范围；留白尚无必要复制完整工程结构。

来源：[仓库说明](https://github.com/pikecode/MangoDisk)、[工作区配置](https://github.com/pikecode/MangoDisk/blob/032e1e140dec2e28d0bef3232f3f2197cbd4a4d9/Cargo.toml)、[构建检查](https://github.com/pikecode/MangoDisk/blob/032e1e140dec2e28d0bef3232f3f2197cbd4a4d9/package.json)。

## 值得借鉴的实现

| 顺序 | 参考实现与事实 | 留白当前状态 | 建议及验收 |
| --- | --- | --- | --- |
| P0 | 不完整扫描组件展示前 50 条失败详情、路径、原因和原始错误，提供复制路径、日志及显式重扫 | AI 目前主要是问题计数及去重说明；普通扫描有覆盖统计和访问引导 | 增加有界结构化诊断，区分拒绝、链接、深度、条目、时间和变化；有路径定位但不读取正文，不把所有不完整状态引向授权 |
| P0 | 权限服务加载历史观察不会探测受保护路径；记录明确后端访问受限信号及时间 | 已禁止把阅读引导视为授权；M3 尚待实机 | 固定包完成授权／拒绝／取消／重启矩阵；历史观察只能表示上次扫描，不证明全局授权 |
| P1 | 规则具备版本、风险、适用条件、验证状态、日期及来源，构建阶段校验；普通规则与专用清理器分开 | uv 有规则证据，其他缓存仍可补齐；仅三类可执行缓存 | 先补 npm／pip 的证据和回归。清理规则数量增加后再评估 TOML 化，不先建设通用规则框架 |
| P1 | GitHub Actions 定义多系统静态检查、测试及原生构建，前端有组件与逻辑测试 | 已有 `npm run check`，没有仓库内 CI 工作流 | 先接 macOS 单平台 CI，锁定依赖并运行现有检查，避免直接复制四平台矩阵或所有依赖 |
| P2 | 存储分析入口和项目产物规则提供其他产品流程参考 | 已有项目空间地图与只读目录浏览，未开放任意文件删除 | 可评估只读大文件列表及普通目录空间图；重复内容识别需要读取正文，应另行设计和选择范围 |

实现证据：[不完整扫描界面](https://github.com/pikecode/MangoDisk/blob/032e1e140dec2e28d0bef3232f3f2197cbd4a4d9/src/pages/cleanup/components/md-incomplete-scan-guidance.vue)、[权限服务](https://github.com/pikecode/MangoDisk/blob/032e1e140dec2e28d0bef3232f3f2197cbd4a4d9/src/lib/services/settings/macos-permission-service.ts)、[规则规范](https://github.com/pikecode/MangoDisk/blob/032e1e140dec2e28d0bef3232f3f2197cbd4a4d9/src-tauri/crates/mangodisk-core/rules/README.md)、[CI 工作流](https://github.com/pikecode/MangoDisk/blob/032e1e140dec2e28d0bef3232f3f2197cbd4a4d9/.github/workflows/cross-platform-check.yml)。

## AI 清理的具体线索

`ai.claude-code-cache` 仅匹配 `~/.claude/cache` 下第一层名为 `changelog.md` 的文件，默认不选中，推荐选中；规则注明 Claude Code 2.1.261 的复现和官方说明来源。它没有提供“清空整个 .claude”的理由。这是一条可调研线索，并不等于已在留白验收；未来需独立核对官方来源、本机版本、身份／并发变化、失败行为和恢复条件，且不得跨过 M3／M6 门槛。

来源：[具体规则](https://github.com/pikecode/MangoDisk/blob/032e1e140dec2e28d0bef3232f3f2197cbd4a4d9/src-tauri/crates/mangodisk-core/rules/filesystem/macos/ai/ai.claude-code-cache.toml)。本轮未核实其引用的官方页面或复现该版本，因此不认定可以启用。

## 不直接沿用的行为

- 空间分析删除入口明确以用户确认时的当前文件／目录为授权对象，扫描元数据主要用于结果计量；即使扫描后正常变化，也未必拒绝删除。留白已有预览／执行复核和变化重扫约定，不采用这套不同的授权语义。
- 同一入口的 `released_bytes` 来自候选的 `expected_displayed_bytes`。这不能作为系统实际释放量的证明；留白继续分开报告目录观测变化和磁盘可用空间变化。
- 工作树与项目产物删除需要单独的 Git 归属、受版本控制内容、嵌套仓库、密钥及活动写入保护；参考项目存在相关规范，并不授权留白删除工作树或 AI 资料。
- 不为扩功能引入提权辅助进程、启动项修改、自动关闭程序、常驻资源监控或联网 AI。现有需求无需这些能力。

来源：[空间分析删除源码](https://github.com/pikecode/MangoDisk/blob/032e1e140dec2e28d0bef3232f3f2197cbd4a4d9/src-tauri/crates/mangodisk-core/src/storage/analysis/deletion.rs)、[项目规则约束](https://github.com/pikecode/MangoDisk/blob/032e1e140dec2e28d0bef3232f3f2197cbd4a4d9/src-tauri/crates/mangodisk-core/rules/README.md)。这些是设计取舍差异，不是本轮确认的漏洞结论。

## 路线选择

方案一（推荐）：保持 Rust／Tauri／React 和现有安全边界，依次完成 M3 实机验证、有界诊断、规则证据统一及 macOS CI。改动可控，能复用现有模块；短期功能覆盖不如综合工具广。

方案二：以 MangoDisk 为基础扩展综合跨平台工具。适合目标明确改为卸载／维护／多平台的独立项目；涉及框架迁移、数据兼容、权限与发布体系重建，当前不推荐。

KISS／YAGNI：先补可诊断性与验证，不复制功能规模。DRY：复用 Coverage、现有确认流程和统一检查。SOLID：诊断采集与提示展示分开，清理执行保持专用边界。

仓库声明为 GPL-3.0-only；本轮未复制源码。若后续计划复用实现，应先核对 LICENSE 和目标交付方式，不能将其当作宽松许可证代码直接并入。

## 本轮验证及限制

通过 GitHub API 固定提交并读取具体文件，同时查看网页和原始文件。浅克隆因 GitHub 443 连接超时失败，raw 文件下载出现 TLS EOF，降级 GitHub Contents API 后读取成功。参考副本保存在忽略的 `output/references/`，不是产品依赖。

没有安装、构建或运行 MangoDisk，没有执行其清理命令，没有验证界面截图或测量性能，也没有运行留白构建／产品测试（本轮仅文档）。后续以具体工作包复现，而不是把开源实现直接视为已验收能力。

## 2026-10-23 补充评估入口

本轮重新核对HEAD仍为上述提交，扩展抽查重复文件、卸载预检、空间会话、启动项策略、维护目录与AI接口；结果见[两项目统一评估](reference-comparison-2026-10-23.md)。本文保留2026-10-22历史基线，不能把其中“留白尚未具备”的描述当作0.9.7现状。完整源码、真实性能及所有删除分支仍未验收。
