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

export default function CleanupOutcome({ outcome }: { outcome: Outcome }) {
  const label =
    outcome.status === "skipped" ? "跳过" : outcome.success ? "完成" : "失败";
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
