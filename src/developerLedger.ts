import type { DeveloperEntry, DeveloperReport } from "./types";

export const developerTools = [["rust", "Rust 项目"], ["yarn", "Yarn"], ["pnpm", "pnpm"], ["poetry", "Poetry"], ["homebrew", "Homebrew"]] as const;
export type ToolId = typeof developerTools[number][0];
export type ToolObservation = { report: DeveloperReport; project: { id: string; path: string } | null };
export type ToolLedger = Partial<Record<ToolId, ToolObservation>>;
export function updateLedger(previous: ToolLedger, ids: ToolId[], report: DeveloperReport, project: ToolObservation["project"]): ToolLedger {
  const next = { ...previous };
  for (const id of ids) next[id] = { report: { ...report, entries: report.entries.filter(entry => entry.tool.toLowerCase() === id) }, project: id === "rust" ? project : null };
  return next;
}
export function byObservedSize(a: DeveloperEntry, b: DeveloperEntry) {
  return (b.allocatedBytes ?? -1) - (a.allocatedBytes ?? -1) || a.name.localeCompare(b.name, "zh-CN", { numeric: true });
}
export function largestSource(observation?: ToolObservation) {
  return observation?.report.entries.slice().sort(byObservedSize).find(entry => entry.allocatedBytes !== null);
}
export function orderedTools(ledger: ToolLedger, order: string) {
  return developerTools.filter(([id]) => ledger[id]).slice().sort(([a, an], [b, bn]) =>
    (order === "size" ? (largestSource(ledger[b])?.allocatedBytes ?? -1) - (largestSource(ledger[a])?.allocatedBytes ?? -1) : 0) || an.localeCompare(bn, "zh-CN"));
}
