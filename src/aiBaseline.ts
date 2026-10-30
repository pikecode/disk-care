import type { AiReport } from "./types";

export function canBaseline(report: AiReport): boolean {
  const c = report.coverage;
  return c.status === "complete" && !c.cancelled && !c.limited &&
    c.permissionDenied === 0 && c.excluded === 0 && report.issues === 0 &&
    [report.allocatedBytes, report.logicalBytes, report.measuredAt].every(
      (n) => n != null && Number.isSafeInteger(n) && n >= 0,
    );
}

function scope(report: AiReport): string {
  return JSON.stringify([report.tool, report.root, report.source, report.version,
    [...new Set(report.items.map((i) => JSON.stringify([i.ruleId, i.ruleVersion, i.policy])))].sort()]);
}

export function compareBaseline(report: AiReport, baseline: AiReport): number | null {
  if (!canBaseline(report) || !canBaseline(baseline) ||
      scope(report) !== scope(baseline) || report.measuredAt <= baseline.measuredAt) return null;
  return report.allocatedBytes! - baseline.allocatedBytes!;
}
