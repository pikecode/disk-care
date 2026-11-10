import {
  analyzeCleanup,
  cleanupAdvice,
  cleanupLabels,
  groupCleanup,
} from "../src/cleanupEligibility";
import type { Item } from "../src/types";
function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const item = (id: string, bytes: number, extra: Partial<Item> = {}): Item => ({
  id,
  bytes,
  name: id,
  category: "开发缓存",
  path: `/fixture/${id}`,
  complete: true,
  issues: 0,
  blocked: null,
  command: "官方命令",
  files: 1,
  impact: "需下载",
  details: [],
  ...extra,
});
const result = analyzeCleanup([
  item("uv", 10),
  item("npm", 3),
  item("pip", 0),
  item("docker", 1000),
]);
check(
  result.occupied === 13 && result.available.length === 2,
  "只累计实际可执行缓存，不追逐目标",
);
check(result.available[0].id === "npm", "先列下载缓存并保留 uv 影响提示");
check(
  result.readonly.length === 1 && result.empty.length === 1,
  "只读与零观测分别说明",
);
check(
  analyzeCleanup([item("npm", 3), item("npm", 3)]).available.length === 0,
  "重复标识拒绝",
);
for (const extra of [
  { blocked: "运行中" },
  { blocked: "" },
  { complete: false },
  { issues: 1 },
  { command: null },
  { bytes: -1 },
  { bytes: NaN },
  { bytes: Infinity },
])
  check(
    analyzeCleanup([item("uv", 1, extra)]).blocked.length === 1,
    "不确定项不开放预览",
  );
check(analyzeCleanup([]).occupied === 0, "没有可执行数据时为零，不扩范围");
check(Object.keys(cleanupLabels).length === 5, "覆盖全部及四种处理状态");
check(
  cleanupAdvice(item("uv", 1), "available").message.includes("临时工具环境"),
  "uv 说明恢复影响",
);
check(
  cleanupAdvice(item("pip", 1, { complete: false }), "blocked").title ===
    "先完成检查",
  "按完整性事实给建议",
);
check(
  cleanupAdvice(
    item("uv", 1, { blocked: "arbitrary-language" }),
    "blocked",
  ).message.includes("原始原因"),
  "不解析错误文本猜测身份",
);
check(
  cleanupAdvice(item("ollama", 1), "readonly").message.includes(
    "未发现引用不代表",
  ),
  "模型保留依赖边界",
);
check(
  cleanupAdvice(item("docker", 1), "readonly").message.includes("业务数据"),
  "数据卷不建议目录删除",
);
check(
  cleanupAdvice(item("downloads", 1), "readonly").message.includes("备份"),
  "个人文件先核对用途",
);
check(
  cleanupAdvice(item("other", 1), "readonly").message.includes("未开放清理"),
  "未知规则保持只读",
);
check(
  cleanupAdvice(item("pip", 0), "empty").title === "没有测得正占用",
  "零观测不推广结论",
);
const protectedUv = item("uv", 1024);
protectedUv.evidence = {
  ruleId: "dev.uv-cache",
  version: 1,
  source: "固定路径",
  scope: "整个缓存根目录",
  recovery: "需要重新下载",
  protected: true,
};
check(
  analyzeCleanup([protectedUv]).blocked.length === 1,
  "保护证据单独阻止预览，不能依赖界面文字",
);
for (const status of [
  "denied",
  "pending",
  "limited",
  "cancelled",
  "skipped",
  "absent",
  "failed",
] as const) {
  const incompleteUv = item("uv", 1024);
  incompleteUv.coverage = {
    status,
    permissionDenied: 0,
    excluded: 0,
    limited: false,
    cancelled: false,
  };
  check(
    analyzeCleanup([incompleteUv]).blocked.length === 1,
    `覆盖状态 ${status} 不能作为完整结果参与清理`,
  );
}
console.log(
  "清理分析断言通过：缓存资格、阻碍、只读、零观测、排序、重复和非法数据。",
);

const intentItems = [item("npm", 10), item("pip", 0), item("uv", 20, { blocked: "运行中" }),
  item("downloads", 100), item("yarn", 20), item("pnpm", 0), item("ollama", 200), item("docker", 300),
  item("jetbrains", 40), item("npx", 50), item("wework", 60), item("unknown-rule", 999),
  item("poetry", 0, { complete: false }), item("gradle", NaN)];
const grouped = groupCleanup(analyzeCleanup(intentItems));
check(grouped.clean.map(i => i.id).join() === "npm", "意图分组不得增加可清理规则");
check(grouped.view.map(i => i.id).join() === "downloads,yarn", "只对已知只读规则开放查看分组");
check(grouped.empty.map(i => i.id).join() === "pip,pnpm", "完整零值单列，未访问不能混入");
for (const id of ["uv", "ollama", "docker", "jetbrains", "npx", "wework", "unknown-rule", "poetry", "gradle"])
  check(grouped.keep.some(i => i.id === id), `${id}应保留且无清理权限`);
check(Object.values(grouped).flat().length === intentItems.length, "每项必须且仅能进入一个意图分组");
for (const status of ["pending", "denied", "limited", "cancelled", "skipped", "failed", "absent"] as const) {
  const unconfirmed = item("downloads", 0, { coverage: { status, permissionDenied: 0, excluded: 0, limited: false, cancelled: false } });
  check(groupCleanup(analyzeCleanup([unconfirmed])).keep.length === 1, "非完整来源不能称为未发现占用或用途已确认");
}
const protectedDownload = item("downloads", 10, { evidence: { ruleId: "fixture", version: 1, source: "测试", scope: "测试", recovery: "测试", protected: true } });
check(groupCleanup(analyzeCleanup([protectedDownload])).keep.length === 1, "显式保护优先于可查看规则");
console.log("通过：处理意图的完整分区、未知／敏感保护、零与未访问区别及原清理资格保持。");

for (const extra of [{permissionDenied: 1}, {excluded: 1}, {limited: true}, {cancelled: true}]) {
  const contradictory = item("downloads", 100, { coverage: { status: "complete", permissionDenied: 0, excluded: 0, limited: false, cancelled: false, ...extra } });
  check(groupCleanup(analyzeCleanup([contradictory])).keep.length === 1, "状态与标记冲突时默认保留");
}
