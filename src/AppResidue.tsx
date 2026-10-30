import { useState } from "react";
import type { ResidueReport } from "./types";
import { api } from "./api";
import { bytes } from "./format";
import CoverageDiagnostics from "./CoverageDiagnostics";
const labels: Record<string, string> = { complete: "范围内检查完成", absent: "目录不存在", denied: "访问被拒绝", failed: "读取失败", skipped: "有内容跳过", limited: "达到上限", cancelled: "已停止", pending: "尚未访问" };
export default function AppResidue({ desktop, busy, scanning, report, onInspect, onCancel }: {
  desktop: boolean; busy: boolean; scanning: boolean; report: ResidueReport | null;
  onInspect: () => void; onCancel: () => void;
}) {
  const [ack, setAck] = useState(false);
  const [error, setError] = useState("");
  const [locating, setLocating] = useState(false);
  return <section className="ai-data" aria-label="应用残留检查">
    <div className="ai-scope"><h2>CC Switch 只读检查</h2>
      <p>首个预设：com.ccswitch.desktop；依据本机 4.0.21 历史样例，不保证覆盖所有版本。</p>
      <ul><li>~/.cc-switch：有界递归统计元数据，可能包含凭据。</li><li>~/Downloads：第一层安装包名称线索。</li><li>~/Library/Application Support/CrashReporter：第一层崩溃记录名称线索。</li></ul>
      <p>不读取配置、凭据、安装包或崩溃记录正文。共享预算：30 秒、20,000 条目、200 候选、配置最多 12 层；不跟随链接，不跨设备。</p>
      <p>应用副本、进程、安装收据、挂载镜像均未纳入本次检查。安装及活动状态未知，不能判断已完全卸载；检测不会删除文件。</p>
      <label><input type="checkbox" checked={ack} disabled={busy} onChange={e => setAck(e.target.checked)} />我已了解三个检查来源与敏感范围</label>
      <div className="ai-report-controls">{scanning ? <button className="button secondary" onClick={onCancel}>停止残留检查</button> : <button className="button primary" disabled={!desktop || busy || !ack || locating} onClick={() => { setError(""); onInspect(); }}>开始只读残留检查</button>}</div>
    </div>
    {error && <p role="alert">{error}</p>}
    {report && <><p>观测时间：{new Date(report.measuredAt).toLocaleString()}。占用不等于可回收量，不跨来源相加；配置硬链接去重，APFS 共享仍可能重复。</p>{report.sources.map(source => <article className="ai-report" key={source.path}>
      <h3>{source.name} · {labels[source.coverage.status] ?? "状态未知"}</h3><code className="ai-path">{source.path}</code>
      <CoverageDiagnostics coverage={source.coverage} />
      {!source.candidates.length && <p>{source.coverage.status === "complete" ? "本次检查范围内未发现候选。" : "没有候选可展示，请先查看覆盖状态；不代表没有残留。"}</p>}
      {source.candidates.map(candidate => <details className="ai-item" key={candidate.id}><summary>{candidate.category} · 已观测 {bytes(candidate.allocatedBytes)}</summary>
        <code className="ai-path">{candidate.path}</code><p>{candidate.evidence}</p><p>逻辑大小 {bytes(candidate.logicalBytes)}；{labels[source.coverage.status]}。关联线索不代表可删除；配置可能包含凭据。</p>
        <button className="text-button" disabled={busy || locating} onClick={() => { setError(""); setLocating(true); void api.revealResidue(report.id, candidate.id).catch(e => setError(String(e))).finally(() => setLocating(false)); }}>在 Finder 中定位候选</button>
      </details>)}
    </article>)}</>}
  </section>;
}
