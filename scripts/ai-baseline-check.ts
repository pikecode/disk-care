import { canBaseline, compareBaseline } from "../src/aiBaseline";
import type { AiReport } from "../src/types";
function assert(ok: boolean, message: string) { if (!ok) throw new Error(message); }
const base: AiReport = { tool: "codex", root: "/home/test/.codex", source: "测试", version: "1", activity: "未知",
  measuredAt: 1, coverage: { status: "complete", permissionDenied: 0, excluded: 0, limited: false, cancelled: false },
  issues: 0, notes: [], logicalBytes: 100, allocatedBytes: 100, items: [] };
assert(canBaseline(base), "完整统计可以设基线");
assert(compareBaseline({ ...base, measuredAt: 2, allocatedBytes: 80 }, base) === -20, "保留负差值");
assert(compareBaseline({ ...base, measuredAt: 2, allocatedBytes: 0 }, base) === -100, "零是有效观测");
for (const change of [{ root: "/other" }, { version: "2" }, { source: "其他" }, { tool: "claude" },
  { issues: 1 }, { allocatedBytes: null }, { logicalBytes: NaN }, { measuredAt: 1 },
  { coverage: { ...base.coverage, status: "limited" as const } },
  { coverage: { ...base.coverage, excluded: 1 } }]) {
  assert(compareBaseline({ ...base, measuredAt: 2, ...change }, base) === null, "不同口径或不完整不能比较");
}
console.log("通过：AI 基线完整性、范围、版本、时间与零／负差值。");
const item = { group: "a", category: "测试", policy: "protected" as const, ruleId: "a", ruleVersion: 1, evidence: "测试", impact: "保护", logicalBytes: 1, allocatedBytes: 1, files: 1, modifiedAt: null, cleanupEligible: false as const };
const classified = { ...base, items: [item] };
assert(compareBaseline({ ...classified, measuredAt: 2, items: [{ ...item, ruleVersion: 2 }] }, classified) === null, "分类规则变化拒绝比较");
assert(compareBaseline({ ...classified, measuredAt: 2, items: [{ ...item, policy: "unknown" }] }, classified) === null, "保护策略变化拒绝比较");
