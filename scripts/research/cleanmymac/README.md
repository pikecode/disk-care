# CleanMyMac 用户缓存执行链研究脚本

仅用于本机 5.7.2 研究，不进入留白应用。源码由本轮编写；目标反编译结果只保存在 output 中。结论与限制见 [研究报告](../../../docs/cleanmymac-system-junk-re.md)。

- `run_rea.py`：固定本项目独立 REA／Ghidra 安装，过滤服务凭据环境；失败保留退出码与日志。不运行 setup。
- `DumpFunctions.java`：Ghidra 脚本，导出显式选择的最多 31 个函数，每个反编译限 30 秒；输出完成状态及调用／入口引用。文件名应保持与 Java 类名一致。
- `CacheFixture.m`：链接原安装包的扫描类，使用自有临时样本和受限测试替身验证 8 组行为。只验证扫描判断，不执行清理；不使用真实知识库或特权服务。

在项目根运行；需保持目标版本及报告中哈希一致，工具目录存在。路径对应当前安装位置，不适用于其他版本地址。

```sh
python3 scripts/research/cleanmymac/run_rea.py doctor-recheck doctor --provider ghidra
/usr/bin/clang -fobjc-arc -framework Foundation \
  -F /Applications/CleanMyMac_5.app/Contents/Frameworks \
  -framework SystemJunkScanning \
  -Wl,-rpath,/Applications/CleanMyMac_5.app/Contents/Frameworks \
  scripts/research/cleanmymac/CacheFixture.m \
  -o output/cleanmymac-re/system-junk/cache-fixture
output/cleanmymac-re/system-junk/cache-fixture \
  /Users/peakom/work/disk-care/output/cleanmymac-re/system-junk
```

样本每次在指定输出目录新建 UUID 子目录，不覆盖现有数据；不自动删除样本。文件大小为确定性替身返回值，不是真实文件测量。授权布尔也是替身，不能表示机器授权状态。程序中的断言若失败，应保留输出定位原因，不通过真实清理来补测。

独立 Ghidra 的构建记录在 output/cleanmymac-re/system-junk/ghidra-native-build.log。发布包缺少 macOS arm64 原生反编译器，实际在其 Decompiler/src/decompile/cpp 目录运行：

```sh
make -j4 ghidra_opt 'CXX=/usr/bin/clang++ -std=c++11' \
  'ARCH_TYPE=-arch arm64' 'ADDITIONAL_FLAGS=-mmacosx-version-min=12.0' OSDIR=mac_arm_64
```

随后将生成的 ghidra_opt 复制到独立安装的 Decompiler/os/mac_arm_64/decompile，并赋执行位；没有替换系统工具或重置 Gatekeeper 状态。详细命令与后续导出日志保存在研究输出目录，原始目标文件不写入。

## 2026-10-21 知识库续篇

详见 [知识库报告](../../../docs/cleanmymac-knowledge-base-re.md)。新增 DatabaseReadProbe.m（自有加密库与包内资源副本的只读对照）、FindKnowledgeStrings.java（字符串静态引用）和 analyze_batch.py（固定本地分析项目导出）。它们不进入应用运行时。

DumpFunctions 的普通地址要求为函数入口；`@0x1001a6e50` 表示查找该指令所属函数。索引同时保存 requestedAddress 和实际 address。这个语法不会创建新函数，也不保证反编译类型准确。

在项目根运行，使用已有 main 项目及固定版本切片：

```sh
python3 scripts/research/cleanmymac/analyze_batch.py CleanMyMac_5 process 0x1001a78c0
/usr/bin/clang -fobjc-arc -framework Foundation \
  -F /Applications/CleanMyMac_5.app/Contents/Frameworks -framework FMDB \
  -Wl,-rpath,/Applications/CleanMyMac_5.app/Contents/Frameworks \
  scripts/research/cleanmymac/DatabaseReadProbe.m \
  -o output/cleanmymac-re/knowledge-base/database-read-probe
output/cleanmymac-re/knowledge-base/database-read-probe \
  /Users/peakom/work/disk-care/output/cleanmymac-re/knowledge-base
```

探针只写新 UUID 目录中的自有样本；包内两个资源先复制，再只读打开。UPDATE 拒绝测试只针对自建数据库。探针未执行真实知识库匹配对象，无密钥失败不等于已恢复任何真实规则。批次导出会更新同名输出，保留原始证据时应另存；不要对已有同名项目重复 import。FindKnowledgeStrings.java 的脚本参数为输出 JSON 路径，仅遍历已定义字符串，空引用不证明未使用。
