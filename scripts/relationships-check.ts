import { relationships, projectId } from "../src/relationships";
import type { ProjectReport } from "../src/types";

function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const project = (path: string) => ({
  path,
  name: "同名项目",
  languages: ["Python"],
  artifacts: [
    {
      name: ".venv",
      bytes: 4096,
      files: 1,
      complete: true,
      recovery: "需重建",
    },
  ],
  evidence: [
    { kind: "model", model: "qwen:7b", source: ".env", message: "配置引用" },
    {
      kind: "model",
      model: "qwen:7b",
      source: "config.yaml",
      message: "配置引用",
    },
    { kind: "process", pid: 42, message: "绝对路径引用" },
    { kind: "process", pid: 42, message: "绝对路径引用" },
    { kind: "model", message: "旧版消息里提到了 phantom:7b" },
  ],
});
const report: ProjectReport = {
  root: "/fixture",
  measuredAt: 1,
  durationMs: 1,
  complete: true,
  cancelled: false,
  issues: 0,
  warnings: [],
  projects: [project("a/app"), project("b/app")],
  baselineAt: null,
  changes: [],
};
const graph = relationships(report);
check(graph.nodes.size === 6, "同名项目和产物分开，共享模型与 PID 去重");
check(graph.edges.length === 6, "重复引用边应合并");
check(
  graph.nodes.has(projectId("a/app")) && graph.nodes.has(projectId("b/app")),
  "按路径识别项目",
);
check(
  ![...graph.nodes.values()].some((n) => n.label.includes("phantom")),
  "不可解析旧消息推断关系",
);
const model = [...graph.nodes.values()].find((n) => n.kind === "model")!;
check(model.artifact === undefined, "不为未测量模型生成大小");
check(
  graph.edges.filter((e) => e.target === model.id).length === 2,
  "共享模型连到两个项目",
);
check(
  graph.edges
    .filter((e) => e.kind === "model")
    .every((e) => e.evidence.length === 2),
  "保留多个配置来源",
);
check(
  graph.edges
    .filter((e) => e.kind === "process")
    .every(
      (e) =>
        graph.nodes.get(e.source)?.kind === "process" &&
        graph.nodes.get(e.target)?.kind === "project",
    ),
  "PID 只指向项目，不推断产物依赖",
);
check(
  graph.edges
    .filter((e) => e.kind === "contains")
    .every((e) => graph.nodes.get(e.source)?.kind === "project"),
  "包含边方向正确",
);
console.log("图数据断言通过：身份、去重、多来源、方向、旧数据兼容与未知占用。");
