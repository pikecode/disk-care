import { useRef, useState } from "react";
import { History, RefreshCw } from "lucide-react";
import type { Record as CleanupRecord } from "./types";
import { CleanupResult, summarizeOutcomes } from "./CleanupOutcome";
import { bytes } from "./format";

export default function CleanupHistory({ records, loading, error, disabled, onRefresh, onReview, onRescan }: {
  records: CleanupRecord[]; loading: boolean; error: string; disabled: boolean;
  onRefresh: () => void; onReview: () => void; onRescan: () => void;
}) {
  const [selected, setSelected] = useState<CleanupRecord | null>(null);
  const current = selected && records.includes(selected) ? selected : records[0];
  const detail = useRef<HTMLElement>(null);
  const list = useRef<HTMLUListElement>(null);
  return <section className="cleanup-history" aria-label="清理记录浏览">
    <header className="history-heading"><div><h2>最近操作</h2><p>查看当时的执行结果。历史记录不能直接再次执行清理。</p></div>
      <button className="button secondary" disabled={disabled || loading} onClick={onRefresh}><RefreshCw size={14} className={loading ? "spin" : ""} />重新读取记录</button>
    </header>
    {loading && <p role="status">正在读取清理记录…</p>}
    {error && <div role="alert" className="history-error"><strong>清理记录读取失败</strong><p>{error}</p><p>{records.length ? "下方保留上次读取的记录，可重新读取。" : "尚未取得记录，不能判断是否有历史操作。"}</p></div>}
    {!loading && !error && !records.length && <div className="empty-state"><div className="empty-symbol"><History size={30} strokeWidth={1.3} /></div><h3>还没有清理记录</h3><p>完成第一次清理后，这里会记录每项结果与磁盘可用空间变化。</p></div>}
    {!!records.length && <div className="history-workspace">
      <ul ref={list} className="history-record-list" aria-label="选择清理记录" onKeyDown={event => {
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (index < 0) return;
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
        buttons[next]?.focus();
      }}>{records.map((record, index) => {
        const counts = summarizeOutcomes(record.outcomes);
        const attention = counts.failed + counts.skipped + counts.unknown;
        return <li key={`${record.at}-${index}`}><button aria-pressed={current === record} onClick={() => { setSelected(record); requestAnimationFrame(() => detail.current?.focus({ preventScroll: true })); }}>
          <span className="history-record-time">{new Date(record.at).toLocaleString("zh-CN", { hour12: false })}</span>
          <strong>{!counts.all ? "没有逐项结果" : attention ? `${attention} 项未完成或未明确` : `${counts.success} 项命令已完成`}</strong>
          <span>完成 {counts.success} · 失败 {counts.failed} · 跳过 {counts.skipped}{counts.unknown ? ` · 未明确 ${counts.unknown}` : ""}</span>
        </button></li>;
      })}</ul>
      {current && <section className="history-record-detail" ref={detail} tabIndex={-1} aria-label="所选清理记录" onKeyDown={event => {
        if (event.key !== "Escape") return;
        event.preventDefault(); event.stopPropagation();
        list.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
      }}>
        <header><span>当时的清理结果 · Esc 返回记录列表</span><h3>{new Date(current.at).toLocaleString("zh-CN", { hour12: false })}</h3></header>
        <CleanupResult key={`${records.indexOf(current)}-${current.at}`} historical record={current} disabled={disabled} onReview={onReview} onRescan={onRescan} />
        <details className="history-observation"><summary>查看当时的空间观测</summary><p>计划候选占用 {bytes(current.estimated)}，不代表实际释放量。</p><p>卷可用空间观测：{bytes(current.beforeAvailable)} → {bytes(current.afterAvailable)}。核验是否完成见上方结果。</p><p>执行日志无法恢复被清理的缓存文件；软件可能需要重新下载或重建缓存。</p></details>
      </section>}
    </div>}
  </section>;
}
