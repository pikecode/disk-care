# 应用关联账本与卸载前后观测

目标：扩大有明确依据的只读检查来源，展示用途和归属边界，保存卸载前观测供用户主动复查。

采用精确应用标识路径规则v2：现有Caches／Application Support／Preferences加Logs和Saved Application State/<id>.savedState。全部沿用同一个30秒／20,000条目／200候选／12层预算，不模糊搜索产品名、不扫描容器和共享组。每来源说明影响，独占状态未知。系统目录约定仅为路径线索，不是可删除证明。

替代方案：按厂商／应用名模糊搜索可覆盖更多，但误归属和共享风险较大，推迟。KISS／DRY复用遍历与历史机制；SOLID分离观测、对比和执行；YAGNI不做插件库、全盘索引或批量删除。

## 实施

1. app_residue.rs新增两个精确来源、规则版本、应用副本路径和来源影响，补路径与预算测试。
2. 卸载预览只捕获当前已保存且五分钟内、目标标识和应用副本路径匹配的报告摘要，不触发扫描。摘要保存规则版本、时间、来源状态、是否观测到根与完整来源的占用；不存候选正文或定位令牌。
3. 预览、结果及卸载历史保存可选before字段，兼容旧历史。保存仍有100条／1MiB边界，失败不能误报卸载结果。
4. UI显示五类来源、用途和关联依据。历史或卸载结果可主动选择基线复查；同标识／规则且复查晚于卸载才比较逐来源存在状态，未知／部分状态不能当成消失。占用不换算释放量。
5. 单元验证新来源、链接及预算、摘要绑定／失效／旧历史兼容；纯函数验证版本／时间／身份与缺失／部分状态；模拟复查闭环。统一检查、构建／签名及临时包原生往返测试，不卸载已有软件。

## 执行能力门槛

第三项“经过验证的缓存处理”仍受统一路线图M3／M6约束：当前系统权限矩阵未闭环，精确Caches路径也不能证明缓存可重建和独占。本轮增加缓存影响说明但不接通通用候选删除。既有uv／npm／pip固定规则保持独立；容器／厂商目录、共享归属及新删除规则仍为未完成项，不把它们计入交付。

来源：Apple File System Programming Guide（Application Support与Caches目录约定）及Apple应用状态恢复资料。官方文档支持目录用途，具体精确路径匹配作为本项目规则假设，结果中明示不保证全覆盖。

参考：[Apple目录用途](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/MacOSXDirectories/MacOSXDirectories.html)、[窗口恢复接口](https://developer.apple.com/documentation/appkit/nswindowrestoration)。Saved Application State和Logs的精确标识路径作为启发式候选，不保证应用采用该命名；不会读取恢复内容。
