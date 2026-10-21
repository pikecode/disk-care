import {
  artifactSpaces,
  groupSpaces,
  layoutSpaces,
  projectSpaces,
} from "../src/spaceLayout";
import type { SpaceObject } from "../src/spaceLayout";
import type { ProjectReport } from "../src/types";
function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const item = (id: string, bytes: number): SpaceObject => ({
  id,
  label: id,
  kind: "project",
  bytes,
  complete: true,
  tone: "mixed",
});
for (const values of [
  [1],
  [1, 3],
  [9, 3, 2, 1],
  Array.from({ length: 300 }, (_, i) => i + 1),
  [1e18, 1, 2, 3],
]) {
  const nodes = values.map((n, i) => item(String(i), n));
  const rects = layoutSpaces(nodes);
  const total = values.reduce((a, b) => a + b, 0);
  check(rects.length === nodes.length, "所有正权重必须保留");
  check(
    Math.abs(rects.reduce((n, r) => n + r.width * r.height, 0) - 10000) < 1e-7,
    "面积守恒",
  );
  for (let i = 0; i < rects.length; i++) {
    const a = rects[i];
    check(
      a.x >= 0 &&
        a.y >= 0 &&
        a.x + a.width <= 100 + 1e-9 &&
        a.y + a.height <= 100 + 1e-9,
      "不能越界",
    );
    check(
      Math.abs((a.width * a.height) / 10000 - a.item.bytes / total) < 1e-10,
      "面积比例必须对应权重",
    );
    for (const b of rects.slice(i + 1))
      check(
        Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) < 1e-8 ||
          Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) < 1e-8,
        "矩形不能重叠",
      );
  }
  check(
    JSON.stringify(rects) ===
      JSON.stringify(layoutSpaces([...nodes].reverse())),
    "输入顺序不改变布局",
  );
}
check(
  layoutSpaces([
    item("zero", 0),
    item("negative", -1),
    item("nan", NaN),
    item("infinite", Infinity),
  ]).length === 0,
  "非法或零权重不绘制",
);
const many = Array.from({ length: 85 }, (_, i) => item(String(i), i + 1));
const grouped = groupSpaces(many);
check(grouped.length === 31, "30 大项加聚合");
check(grouped.at(-1)?.members?.length === 55, "聚合保留小项目");
check(
  grouped.reduce((n, a) => n + a.bytes, 0) ===
    many.reduce((n, a) => n + a.bytes, 0),
  "聚合权重守恒",
);
const report: ProjectReport = {
  root: "/fixture",
  measuredAt: 1,
  durationMs: 1,
  complete: false,
  cancelled: true,
  issues: 0,
  warnings: [],
  baselineAt: null,
  changes: [],
  projects: ["a/app", "b/app"].map((path) => ({
    path,
    name: "同名",
    languages: ["Rust"],
    artifacts: [
      {
        name: "target",
        bytes: 1024,
        files: 1,
        complete: true,
        recovery: "重建",
      },
    ],
    evidence: [],
  })),
};
const projects = projectSpaces(report);
check(projects[0].id !== projects[1].id, "同名项目按路径区分");
check(
  projects.every((p) => p.bytes === 1024 && !p.complete),
  "部分报告保守标记",
);
check(
  artifactSpaces(report.projects[0], false)[0].bytes === 1024,
  "复用产物观测，不添加模型权重",
);
console.log(
  "空间布局断言通过：面积比例、守恒、边界、无重叠、稳定性、聚合、身份和非法权重。",
);
