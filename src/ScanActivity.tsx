import { useState } from "react";
import { api } from "./api";
import type { ScanActivityReport, ScanOrigin } from "./types";
export const scanOriginLabels: Record<ScanOrigin, string> = { cleanup: "清理页", result: "清理结果重新检查", history: "清理记录重新检查", unknown: "未提供入口" };
const statusLabels = { received: "结束状态未记录", returned: "结果已返回", cancelled: "已停止", failed: "请求未完成" };
export default function ScanActivity({ disabled }: { disabled: boolean }) {
  const [report, setReport] = useState<ScanActivityReport | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  async function read() {
    setWorking(true); setError("");
    try { setReport(await api.scanActivity()); }
    catch (e) { setError(String(e)); }
    finally { setWorking(false); }
  }
  return <details className="scan-activity">
    <summary>扫描活动记录</summary>
    <p>仅记录常规／扩展扫描请求的入口、版本与状态，不记录路径或文件内容。入口由界面声明，不证明真人点击；记录缺失不能证明没有扫描。</p>
    <button className="button secondary" disabled={disabled || working} onClick={() => void read()}>{working ? "正在读取活动…" : "读取扫描活动"}</button>
    {error && <p role="alert">读取失败：{error}。{report ? "下方保留上次读取的记录。" : "当前无法判断活动记录。"}</p>}
    {report && <section aria-label="扫描活动详情">
      <p>当前后端版本 {report.appVersion} · 会话 <code>{report.sessionId}</code>。下方是读取时的快照，最多保留最近100条请求。</p>
      <p>结果已返回不代表统计完整；结束未记录也不代表仍在扫描。旧版本没有记录，不能补造过去操作。</p>
      {!report.records.length && <p>没有保存的扫描请求；这不证明过去没有扫描。</p>}
      <ol>{report.records.map(record => <li key={record.id}>
        <strong>{scanOriginLabels[record.origin]} · {record.extended ? "扩展扫描" : "常规扫描"} · {statusLabels[record.status]}</strong>
        <p>{new Date(record.receivedAt).toLocaleString()} · {record.sessionId === report.sessionId ? "当前会话" : "其他会话"} · 版本 {record.appVersion}</p>
        <details><summary>请求标识与耗时</summary><p>请求 <code>{record.id}</code> · 会话 <code>{record.sessionId}</code></p><p>结束：{record.finishedAt == null ? "未记录" : new Date(record.finishedAt).toLocaleString()} · 耗时：{record.durationMs == null ? "未记录" : `${(record.durationMs / 1000).toFixed(1)}秒`} · 请求主要目录数量：{record.requestedRoots ?? "使用默认范围"}</p></details>
      </li>)}</ol>
    </section>}
  </details>;
}
