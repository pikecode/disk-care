import type { Item } from "./types";

const supported = new Set(["uv", "npm", "pip"]);
export type CleanupFilter =
  "all" | "available" | "blocked" | "readonly" | "empty";
export const cleanupLabels: Record<CleanupFilter, string> = {
  all: "全部状态",
  available: "可预览",
  blocked: "暂不可处理",
  readonly: "仅供分析",
  empty: "零观测",
};
export function analyzeCleanup(items: Item[]) {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
  const available: Item[] = [],
    blocked: Item[] = [],
    readonly: Item[] = [],
    empty: Item[] = [];
  for (const item of items) {
    if (!supported.has(item.id)) {
      readonly.push(item);
      continue;
    }
    if (
      counts.get(item.id) !== 1 ||
      item.blocked !== null ||
      item.evidence?.protected === true ||
      (item.coverage != null && item.coverage.status !== "complete") ||
      !item.command ||
      !item.complete ||
      item.issues !== 0 ||
      !Number.isFinite(item.bytes) ||
      item.bytes < 0
    )
      blocked.push(item);
    else if (item.bytes === 0) empty.push(item);
    else available.push(item);
  }
  available.sort(
    (a, b) =>
      Number(a.id === "uv") - Number(b.id === "uv") ||
      b.bytes - a.bytes ||
      a.id.localeCompare(b.id),
  );
  return {
    available,
    blocked,
    readonly,
    empty,
    occupied: available.reduce((n, item) => n + item.bytes, 0),
  };
}
export const cleanupCandidates = (items: Item[]) =>
  analyzeCleanup(items).available;

export function cleanupAdvice(
  item: Item,
  state: Exclude<CleanupFilter, "all">,
) {
  if (state === "available")
    return {
      title: "先了解恢复影响",
      message:
        item.id === "uv"
          ? "可能包含缓存内的临时工具环境。请先核对用途和运行依赖，再决定是否预览；不能仅凭缓存名称判断无用。"
          : "清理后安装依赖可能需要重新下载、访问私有源或构建。请确认网络与恢复条件，再决定是否预览。",
    };
  if (state === "empty")
    return {
      title: "没有测得正占用",
      message:
        "本次完整观测未测得正占用。若数据位于其他位置，请核对工具配置；不要据此推断整台机器没有可处理数据。",
    };
  if (state === "blocked")
    return !item.complete || item.issues > 0
      ? {
          title: "先完成检查",
          message:
            "重新扫描；若仍有读取失败，请核对目录权限与正在写入的数据。本工具不会自动提权。",
        }
      : {
          title: "先核对阻止原因",
          message:
            "按上方原始原因处理后重新扫描。若涉及运行程序，先保存工作再自行处理；本工具不会自动终止进程。",
        };
  if (item.id === "ollama")
    return {
      title: "先确认模型用途",
      message:
        "到项目账本检查已发现的模型配置引用，再通过 Ollama 管理模型。未发现引用不代表无人使用，也不证明可以删除。",
    };
  if (item.id === "docker")
    return {
      title: "先识别容器数据对象",
      message:
        "通过 Docker 区分镜像、容器与数据卷。数据卷可能含业务数据，不能按应用目录直接删除。",
    };
  if (item.id === "downloads")
    return {
      title: "个人文件逐项判断",
      message:
        "先浏览内容，确认来源、用途及备份，再自行整理。体积大或较久未修改不代表无用。",
    };
  return {
    title: "先确认用途与恢复方式",
    message:
      "此规则未开放清理，可先只读浏览目录并核对用途。仅供分析不等于不再使用。",
  };
}
