# REA 最小试用报告

日期：2026-10-20。留白版本保持 **0.8.5**，本轮没有修改应用功能或重新打包。

## 结论

REA 6.7.0 的独立 CLI 在本机可运行，能辅助获取 macOS 应用的结构、签名和静态证据，适合作为开发调查工具。它不是清理引擎，也不意味着能够一键复刻 CleanMyMac。

本轮实际目标是自有 `release/留白.app`、`dist/` 和由现有清理资格逻辑编译的小型夹具。在 `/Applications/CleanMyMac.app`、`/Applications/CleanMyMac X.app` 未找到目标；没有分析 CleanMyMac 本体，不据此对其内部实现作结论。

## 来源与运行边界

- 上游：[morluto/rea](https://github.com/morluto/rea)，npm 包 `rea-agents@6.7.0`，MIT 许可证。
- 环境：macOS 15.7.7，Node.js 26.3.0，符合该固定版本声明的 Node 范围。
- 使用官方 npm 归档并核对 registry 提供的 SHA-512 完整性；该校验不等于独立验证发布者身份或完整供应链审计。入口及安装相关声明经人工检查，ClawDefender URL 检查通过。
- 归档来源：`https://registry.npmjs.org/rea-agents/-/rea-agents-6.7.0.tgz`。
- 完整性：`sha512-yhIx2ioJYYT1C/tONfYeitC6LhnKmCh+ZwRUOgYuhSc733lGhkkt73zhug9WmLgxoMdKuqIYGCoBfD4fXkOhFw==`。
- 依赖安装到 `output/rea-evaluation/runtime/`，使用 `--ignore-scripts --omit=dev`，没有安装生命周期脚本。没有添加到留白依赖，也没有运行会注册 MCP／技能的 `setup`。
- 运行 CLI 时只传入必要环境变量和试用目录下的缓存配置，不传入模型 API 凭据。独立目录不是操作系统沙箱；本轮选用静态命令，没有目标程序执行、进程注入、网络抓包或系统权限操作。

## 实测结果

| 检查 | 实际结果 | 说明 |
| --- | --- | --- |
| `--help`、`providers --json` | 通过 | CLI 可启动，原生元数据工具及 artifact graph 可用；能力列表可用不代表所有操作都实测过 |
| `inspect-macho` | 通过，约 4.28 秒 | 识别 arm64、64 位、最低 macOS 12.0，列出 14 项动态库依赖，包括 WebKit；不等于函数反编译 |
| `inspect-signature` | 通过，约 2.11 秒 | 标识为 `local.diskcare.desktop`，无 Team ID，指定要求绑定当前 cdhash；此命令展示签名信息，不能替代完整签名校验或系统授权检测 |
| `inspect-artifact` | 通过，约 0.84 秒 | 返回应用包清单及证据引用；只完成 inventory 子步骤，没有还原业务逻辑 |
| `doctor --provider ghidra` | 未就绪，退出码 1 | `GHIDRA_INSTALL_DIR` 未配置；Hopper 和 IDA 也未配置就绪。本轮不自动安装分析器 |
| 完整 `dist/` 静态分析，256 MiB | 部分结果，不能算成功 | CLI 退出码 0，但 JavaScript 工作进程耗尽堆，跳过 1 个 JS 文件，成功解析 0 个 |
| 完整 `dist/` 静态分析，512 MiB | 仍为部分结果 | 提高内存后同样跳过；不能据结果中的零窗口、零 IPC 判断程序没有这些功能，也不能把 Electron 模式检测等同 Tauri 运行事实 |
| 小型逻辑夹具静态分析 | 通过，约 3.26 秒 | 由现有 `cleanupEligibility.ts`／`types.ts` 编译，成功解析 2 个 JS 文件、访问 373 个 AST 节点，未跳过 JS、无解析错误；不等于分析了整个产品 |
| 目标未改动检查 | 通过 | 原生二进制及前端产物分析前后 SHA-256 一致，另运行 `npm run verify:mac`，当前交付包完整签名仍有效 |

这些耗时仅代表本机此次样本，不是性能承诺。完整前端结果明确带有限制和覆盖不完整说明，退出码不能作为唯一成功条件。

## 试用中遇到的问题

1. Python 直取 `raw.githubusercontent.com` 失败，原因为 TLS `UNEXPECTED_EOF_WHILE_READING`；改用官方 npm 包完成验证，没有关闭 TLS 校验。
2. 只解包、不安装依赖时启动报缺少 `zod`；在独立运行目录安装依赖后启动成功。
3. 完整压缩前端在两种内存预算下均未完成 JS 分析；保留两次结果，不提高到无限预算或将部分结果报告成成功。
4. 原生深度分析器未配置，当前不能验证反编译、函数调用链及具体功能还原。没有改变代理配置来规避这一前提。

## 本地复现

已安装的独立 CLI：

```sh
node output/rea-evaluation/runtime/node_modules/rea-agents/scripts/rea.mjs --help
node output/rea-evaluation/runtime/node_modules/rea-agents/scripts/rea.mjs inspect-macho release/留白.app/Contents/MacOS/disk-care --json
node output/rea-evaluation/runtime/node_modules/rea-agents/scripts/rea.mjs inspect-signature release/留白.app --json
node output/rea-evaluation/runtime/node_modules/rea-agents/scripts/rea.mjs inspect-artifact release/留白.app --json
node output/rea-evaluation/runtime/node_modules/rea-agents/scripts/rea.mjs doctor --provider ghidra --json
```

实际试用命令在过滤环境下运行，缓存定向到 `output/rea-evaluation/`；上面的简写直接使用当前 shell 环境，复现时不要额外传入不必要的凭据。不要运行 setup 来替代上述只读命令。

小型夹具通过项目现有 TypeScript 编译器生成，包入口为 `cleanupEligibility.js`。它只是分析样本，不是新增功能，也没有执行编译出的清理逻辑。

## 保存内容与下一步

- 输出：`output/rea-evaluation/macho.json`、`signature.json`、`artifact.json`、`doctor-ghidra.json`。
- 失败／部分结果：`javascript-256.json`、`javascript.json`；正向夹具：`fixture.json`。
- 命令摘要及目标哈希：`run-summary.json`；安装日志和各命令错误日志保存在同目录。
- 独立运行依赖约 139 MiB；包含归档、工具缓存和证据的整个试用目录，当前 `du -sh` 显示约 175M。保留这些内容方便继续使用，已移除多余的解包副本。该目录被 Git 忽略且可能清理，核心结论已保存在本报告。

推荐继续将 REA 用作开发期调查工具，暂不接入留白运行时或全局代理配置。要研究 CleanMyMac 的具体功能，需要先确定本地应用路径，并让原生分析器就绪，再围绕单个功能做有证据的分析。只有拿到实际证据后，才能判断哪些行为值得独立实现。

此选择符合 KISS/YAGNI：复用已有 CLI 而不扩张产品依赖和清理权限；结构检查、深度逻辑分析与产品实现分别验收。

## 2026-10-20 后续检查

用户安装后已定位 CleanMyMac_5.app 5.7.2，完成只读静态检查。此前未找到目标的结论仅对应前次查找；新增证据见 [目标分析报告](cleanmymac-static-analysis.md)。
