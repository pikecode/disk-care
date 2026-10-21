# 模型空间账本实施计划

目标：完成只读默认 Ollama 模型空间测量及项目引用展示，不增加删除操作。

架构：复用项目扫描任务锁、取消标志及进度通道，独立 model_storage.rs 负责有界解析和文件归属；ProjectReport 增加可选 modelStorage，兼容旧报告。界面沿用现有账本和关系图。

技术栈：Rust 标准库、既有 libc／serde_json、React／TypeScript；不增加依赖。

1. 新建 src-tauri/src/model_storage.rs，先写共享块、硬链接、缺块、坏清单、摘要穿越、符号链接、取消和限额测试；运行 cargo test model_storage 并确认缺少实现时失败。
2. 增加只读扫描与汇总；通过目录文件描述符相对打开并禁止跟随链接，限定清单大小、条目数、目录深度及截止时间；再次执行定向测试。
3. 修改 core.rs 和 projects.rs，对接任务与进度，替换原模型名称发现避免重复扫描；保持项目基线语义，模型完整性独立表达。
4. 修改 types.ts，新增 ModelStorage.tsx；ProjectLedger 展示可折叠模型账本，ScanAccess 说明固定目录；关系图接入已测量模型信息，不把模型空间计入项目。
5. 新增 scripts/model-storage-ui-smoke.js，使用模拟 IPC 验证完整／部分／空报告、项目引用和无删除调用；回归现有项目、关系图、扫描授权流程。
6. 执行 cargo test、Clippy、npm run build、真实默认目录只读测试。升级 0.9.0，保留既有发布包，Tauri 构建与完整签名校验后交付。补齐文档与 20261020-004 日志，明确模拟与实机边界。

原则：KISS 复用任务而不增加服务；YAGNI 只支持默认仓库只读；SOLID 解析与清理执行分离；DRY 统一模型元数据，复用结构化项目证据。工作目录没有 Git 元数据，不创建虚假提交或 worktree；直接在当前目录实施并保留既有交付。

完成状态：已交付 0.9.0；完整结果及失败修正见 [本轮记录](../change-log.md#change-20261020-004) 与 [验证记录](../verification.md)。

格式参考：[Ollama v0.6.8 清单源码](https://github.com/ollama/ollama/blob/v0.6.8/server/manifest.go)，用于核对 schemaVersion／config／layers 及默认清单布局，不当作最新功能保证；实际兼容性以本机清单与测试为准。上游 main 路径两次返回 404，改查固定版本，并通过真实新清单验证 733 层场景。
