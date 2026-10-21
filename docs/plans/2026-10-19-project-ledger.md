# 项目空间账本实施计划

> 按本文逐项实施；用户已授权在当前会话继续开发，无需再次选择执行方式。仓库尚未初始化 Git，不创建提交或 worktree。

**Goal:** 交付设计文档第一阶段，展示项目产物占用、影响证据和完整扫描变化，并连接既有缓存清理闭环。

**Architecture:** 新增 Rust projects 模块，复用 core 测量、任务互斥和取消；Tauri 提供只读命令。React 新增独立项目页与状态，原扫描和清理 API 保持兼容。

**Tech Stack:** Rust、Tauri 2、React 19、TypeScript、现有 CSS，无新增运行时依赖。

---

## 任务 1：规则、测量与证据

文件：新增 src-tauri/src/projects.rs；修改 src-tauri/src/core.rs。

1. 用临时目录测试 Node/Rust/Python 混合、嵌套项目发现、链接拒绝、产物统计和配置读取边界。
2. 实现有界发现，复用分配块测量，跳过产物内部的项目发现。
3. 测试进程绝对路径边界和模型标识边界，再实现只返回脱敏证据。
4. `cargo test --manifest-path src-tauri/Cargo.toml projects`：所有测试通过，不读取测试外的私密配置，不删除用户内容。

## 任务 2：基线与后端集成

文件：projects.rs、core.rs、src-tauri/src/lib.rs。

1. 测试变化计算、损坏基线、符号链接、取消不覆盖、工作目录隔离。
2. 将命令接入 Engine 的任务锁；扫描进度使用独立事件 project-progress。
3. 基线按工作目录保存至应用数据目录，原子替换；保存失败作为报告警告返回。
4. 所有测试及 `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings` 通过。

## 任务 3：项目页与缓存闭环入口

文件：src/types.ts、src/api.ts、src/ProjectLedger.tsx、src/App.tsx、src/style.css。

1. 添加接口、导航与项目目录输入、扫描/停止、进度和错误状态。
2. 展示项目产物、恢复条件、证据类型、部分结果与上次扫描变化；初次扫描明确没有基线。
3. 从项目页跳转缓存清理，已有扫描不重复执行；无扫描时由用户启动。
4. `npm run build` 通过；界面验证并发任务禁用、空/失败/部分报告、默认不清理、切页不丢结果。

## 任务 4：验收与交付

文件：README.md、docs/verification.md、版本配置及 release/留白.app。

1. 跑全套 Rust 测试、严格 Clippy 与前端构建。
2. 本机工作目录只读扫描，不把用户项目清理作为测试。
3. 模拟 IPC 浏览器验证和原生构建、启动检查。
4. 回填实测结果与限制，版本升级至 0.3.0；第二阶段保持明确未实施。

## 执行状态

- [x] 产品设计与实施计划落盘。
- [x] 项目扫描和证据。
- [x] 基线与 Tauri 集成。
- [x] 项目页与缓存入口。
- [x] 验证、构建与文档回填。


## 实施结果（2026-10-19）

第一阶段已完成，版本 0.3.0；31 项常规测试、1 项本机只读扫描、严格 Clippy、前端/原生构建及两套模拟 IPC 界面检查通过。本机自身项目扫描约 212–294ms；最小 960px 宽度检查通过。未新增运行时依赖。旧版应用保留为可回退备份。

第一阶段未扩展项目产物删除权限；第二、三阶段的执行边界见 `docs/product-design.md`，不把只读账本描述为可执行项目清理。详细限制及复现命令见 `docs/verification.md`。
