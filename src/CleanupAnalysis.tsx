import { useEffect, useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { analyzeCleanup } from "./cleanupEligibility";
import type { CleanupFilter } from "./cleanupEligibility";
import { bytes } from "./format";
import type { Scan } from "./types";

export default function CleanupAnalysis({
  scan,
  disabled,
  onReview,
  activeFilter,
  onFilter,
}: {
  scan: Scan;
  disabled: boolean;
  onReview: (ids: string[]) => void;
  activeFilter: CleanupFilter;
  onFilter: (filter: CleanupFilter) => void;
}) {
  const [time, setTime] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const analysis = analyzeCleanup(scan.items);
  const expired = time - scan.id > 30 * 60 * 1000;
  return (
    <section className="cleanup-analysis" aria-label="可清理空间分析">
      <header>
        <ShieldCheck size={22} />
        <div>
          <h2>清理建议</h2>
          <p>先查看影响，再预览清理。以下内容不会自动勾选。</p>
        </div>
      </header>
      <div className="analysis-metrics">
        <button
          aria-label="查看可预览缓存"
          aria-pressed={activeFilter === "available"}
          disabled={disabled}
          onClick={() => onFilter("available")}
        >
          <span>可预览</span>
          <strong>
            {analysis.available.length}
            <small>项</small>
          </strong>
          <small>先查看影响，再预览</small>
        </button>
        <button
          aria-label="查看暂不可处理项目"
          aria-pressed={activeFilter === "blocked"}
          disabled={disabled}
          onClick={() => onFilter("blocked")}
        >
          <span>暂不可处理</span>
          <strong>
            {analysis.blocked.length}
            <small>项</small>
          </strong>
          <small>先解决运行、权限或完整性问题</small>
        </button>
        <button
          aria-label="查看仅供分析项目"
          aria-pressed={activeFilter === "readonly"}
          disabled={disabled}
          onClick={() => onFilter("readonly")}
        >
          <span>仅供分析</span>
          <strong>
            {analysis.readonly.length}
            <small>项</small>
          </strong>
          <small>模型、应用数据和个人文件</small>
        </button>
      </div>
      {expired && (
        <p className="warning-text" role="status">
          扫描已超过 30 分钟，请重新扫描后预览。
        </p>
      )}
      {scan.cancelled && (
        <p className="analysis-note">
          扫描已停止，其他可处理数据可能遗漏；仅独立完整的缓存可以预览。
        </p>
      )}
      <div className="analysis-candidates">
        {analysis.available.map((item) => (
          <article key={item.id}>
            <div className="candidate-identity">
              <strong>{item.name}</strong>
              <b>{bytes(item.bytes)}</b>
            </div>
            <div className="candidate-impact">
              <p>{item.impact}</p>
              {item.id === "uv" && (
                <p className="analysis-caution">
                  uv 缓存可能包含临时工具环境，处理前请确认关联工具。
                </p>
              )}
            </div>
            <button
              className="button secondary"
              aria-label={`预览${item.name}清理`}
              disabled={disabled || expired}
              onClick={() => {
                if (Date.now() - scan.id <= 30 * 60 * 1000) onReview([item.id]);
                else setTime(Date.now());
              }}
            >
              预览 <ArrowRight size={13} />
            </button>
          </article>
        ))}
      </div>
      {analysis.available.length === 0 && (
        <p className="analysis-note">
          本次未发现可直接预览的缓存，不会为了释放空间扩大清理范围。
        </p>
      )}
      {analysis.blocked.length > 0 && (
        <details>
          <summary>查看 {analysis.blocked.length} 项处理阻碍</summary>
          {analysis.blocked.map((item, index) => (
            <p key={`${item.id}:${index}`}>
              <strong>{item.name}</strong>：
              {item.blocked ||
                (!item.complete || item.issues > 0
                  ? "统计不完整，请重新扫描并检查权限。"
                  : "工具、标识或占用信息无法确认，请重新扫描。")}
            </p>
          ))}
        </details>
      )}
      {analysis.empty.length > 0 && (
        <p className="analysis-note">
          {analysis.empty.length}{" "}
          项支持的缓存没有测得正占用；这不代表整台机器没有可处理数据。
          <button
            className="text-button"
            disabled={disabled}
            onClick={() => onFilter("empty")}
          >
            查看零观测项目 <ArrowRight size={12} />
          </button>
        </p>
      )}
      <details className="analysis-explanation">
        <summary>统计与清理说明</summary>
        <p className="analysis-boundary">
          上方数值是合格缓存的观测占用，实际可回收量尚未确定；共享文件、快照与并发写入可能影响结果。默认不勾选、不自动执行，预览确认后再清理，执行后核验目录观测与磁盘可用空间变化。
        </p>
      </details>
    </section>
  );
}
