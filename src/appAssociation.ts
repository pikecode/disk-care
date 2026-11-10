import type { AppCatalog, ResidueReport, UninstallRecord } from "./types";

export function compareAssociation(record: UninstallRecord, report: ResidueReport) {
  const before = record.before;
  if (!record.success || !before || before.measuredAt > record.at || !report.ruleVersion || before.ruleVersion !== report.ruleVersion || record.bundleId !== report.target || report.measuredAt <= record.at) return null;
  return before.sources.map(previous => {
    const current = report.sources.find(source => source.path === previous.path);
    const wasPresent = previous.present ? true : previous.status === "absent" ? false : null;
    const present = current?.candidates.some(item => item.path === current.path) ? true : current?.coverage.status === "absent" ? false : null;
    return {
      path: previous.path, name: previous.name,
      status: wasPresent === null || present === null ? "无法判断" : present ? wasPresent ? "仍存在关联项" : "本次新发现" : wasPresent ? "本次未发现" : "前后均未发现",
      beforeBytes: previous.status === "complete" ? previous.allocatedBytes : null,
      afterBytes: current?.coverage.status === "complete" ? current.candidates.reduce((sum, item) => sum + item.allocatedBytes, 0) : null,
    };
  });
}

export type AppGroup = "all" | "copies" | "protected";
export function applicationGroups(apps: AppCatalog["apps"]) {
  const copies = new Map<string, number>();
  for (const app of apps) copies.set(app.bundleId, (copies.get(app.bundleId) ?? 0) + 1);
  const protectedApp = (id: string) => id.toLowerCase().startsWith("com.apple.") || id === "local.diskcare.desktop";
  return { copies, protectedApp };
}
export function visibleApplications(apps: AppCatalog["apps"], query: string, group: AppGroup, descending: boolean) {
  const { copies, protectedApp } = applicationGroups(apps);
  const search = query.trim().toLowerCase();
  return apps.filter(app => `${app.name} ${app.bundleId}`.toLowerCase().includes(search) && (group === "all" || (group === "copies" ? (copies.get(app.bundleId) ?? 0) > 1 : protectedApp(app.bundleId))))
    .sort((a, b) => (descending ? -1 : 1) * (a.name.localeCompare(b.name, "zh-CN", {numeric:true}) || a.path.localeCompare(b.path)));
}
export function attentionSource(source: ResidueReport["sources"][number]) {
  return !["complete", "absent"].includes(source.coverage.status) || source.coverage.permissionDenied > 0 || source.coverage.limited || source.coverage.cancelled;
}
export function visibleSources(report: ResidueReport, filter: "all" | "content" | "attention") {
  return report.sources.filter(source => filter === "all" || (filter === "content" ? source.candidates.length > 0 : attentionSource(source)));
}
