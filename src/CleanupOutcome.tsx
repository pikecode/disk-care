import { useState } from "react";
import { CircleCheck, RefreshCw, TriangleAlert } from "lucide-react";
import type { Outcome, Record as CleanupRecord } from "./types";
import { bytes } from "./format";

export function SpaceChange({ record }: { record: CleanupRecord }) {
  if (
    record.diskVerified === false ||
    (record.diskVerified == null && record.warning?.includes("无法复核磁盘"))
  )
    return <>磁盘变化未能核验</>;
  const difference = record.afterAvailable - record.beforeAvailable;
  return (
    <>
      磁盘可用空间{difference < 0 ? "减少" : "增加"}{" "}
      <b>{bytes(Math.abs(difference))}</b>
    </>
  );
}

function outcomeStatus(outcome: Outcome) {
  return outcome.status ?? (outcome.success ? "success" : "unknown");
}

const outcomeLabels = {
  success: "完成",
  failed: "失败",
  skipped: "跳过",
  unknown: "未明确",
};

export default function CleanupOutcome({ outcome }: { outcome: Outcome }) {
  const label = outcomeLabels[outcomeStatus(outcome)];
  return (
    <details className="cleanup-outcome">
      <summary>
        {label} · {outcome.name}
      </summary>
      {outcome.beforeBytes != null && (
        <p>
          清理前观测 {bytes(outcome.beforeBytes)} · 执行后
          {outcome.afterBytes == null
            ? "未取得完整观测"
            : `观测 ${bytes(outcome.afterBytes)}`}
        </p>
      )}
      {outcome.verification && <p>{outcome.verification}</p>}
      <pre>{outcome.message}</pre>
    </details>
  );
}

export function CleanupResult({
  record,
  disabled,
  onReview,
  onRescan,
}: {
  record: CleanupRecord;
  disabled: boolean;
  onReview: () => void;
  onRescan: () => void;
}) {
  const [filter, setFilter] = useState<
    "all" | "failed" | "skipped" | "unknown"
  >("all");
  const counts = { all: record.outcomes.length, failed: 0, skipped: 0, unknown: 0 };
  for (const outcome of record.outcomes) {
    const status = outcomeStatus(outcome);
    if (status !== "success") counts[status]++;
  }
  const complete =
    counts.all > 0 && counts.failed + counts.skipped + counts.unknown === 0;
  const shown = record.outcomes.filter(
    (outcome) => filter === "all" || outcomeStatus(outcome) === filter,
  );
  const filters = [
    "all",
    "failed",
    "skipped",
    ...(counts.unknown ? ["unknown" as const] : []),
  ] as const;
  return (
    <section
      className={`result-card ${complete ? "" : "result-partial"}`}
      aria-label="本次清理结果"
    >
      {complete ? (
        <CircleCheck size={24} aria-hidden="true" />
      ) : (
        <TriangleAlert size={24} aria-hidden="true" />
      )}
      <div>
        <strong role="status">
          {counts.all === 0
            ? "未取得逐项清理结果，请重新扫描核实"
            : complete
              ? "命令均已完成，请查看核验结果"
              : "清理已结束，部分项目未完成；请查看逐项结果"}
        </strong>
        <p>
          <SpaceChange record={record} />
          。这是所测数据卷在操作期间的变化，其他进程、共享文件和快照均可能影响，不能归因于本次清理。
        </p>
        {record.warning && <p className="warning-text">{record.warning}</p>}
        {counts.unknown > 0 && (
          <p>旧记录未区分失败与跳过，列为“未明确”；请重新扫描核实。</p>
        )}
        <div className="result-filters" role="group" aria-label="筛选清理结果">
          {filters.map((value) => (
            <button
              key={value}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {value === "all" ? "全部" : outcomeLabels[value]} {counts[value]}
            </button>
          ))}
        </div>
        <div aria-live="polite" aria-atomic="true" className="result-count">
          显示 {shown.length} / {counts.all} 项
        </div>
        {shown.map((outcome, index) => (
          <CleanupOutcome key={`${filter}-${index}`} outcome={outcome} />
        ))}
        {shown.length === 0 && (
          <p>
            {filter === "failed"
              ? "没有失败项目"
              : filter === "skipped"
                ? "没有跳过项目"
                : "没有可显示的逐项结果"}
          </p>
        )}
        <div className="result-actions">
          <button className="text-button" disabled={disabled} onClick={onReview}>
            查看剩余项目
          </button>
          <button
            className="button secondary"
            disabled={disabled}
            onClick={onRescan}
          >
            重新扫描 <RefreshCw size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
