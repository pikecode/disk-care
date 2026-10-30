import { useState } from "react";
import { ShieldCheck, Search } from "lucide-react";
import type { AiReport, AiRoot } from "./types";
import { bytes } from "./format";
import { canBaseline, compareBaseline } from "./aiBaseline";
import CoverageDiagnostics from "./CoverageDiagnostics";

const policies = { protected: "保护", review: "需审阅记录", unknown: "未知／待核实" };
const coverageLabels: Record<string, string> = {
  complete: "范围内统计完成", absent: "目录不存在", denied: "部分访问被拒绝",
  failed: "读取或路径检查失败", limited: "达到分析上限", cancelled: "已停止",
  skipped: "部分内容已跳过",
};
function ToolReport({ report, baseline, onBaseline, busy }: { report: AiReport; baseline?: AiReport; onBaseline: (report: AiReport) => void; busy: boolean }) {
  const delta = baseline ? compareBaseline(report, baseline) : null;
  const [filter, setFilter] = useState("all");
  const [limit, setLimit] = useState(50);
  const items = report.items.filter((item) => filter === "all" || item.policy === filter);
  const visible = items.slice(0, limit);
  return (
    <article className="ai-report" aria-label={`${report.tool} 分析结果`}>
      <div className="section-heading">
        <h2>{report.tool === "codex" ? "Codex" : "Claude Code"}</h2>
        <span>{coverageLabels[report.coverage.status] ?? "统计状态未知"}</span>
      </div>
      <code className="ai-path">{report.root}</code>
      <p>{report.source} · {report.version}</p>
      <p>活动状态：{report.activity}</p>
      <div className="ai-metrics">
        <div><span>已观测分配块</span><strong>{report.allocatedBytes == null ? "未取得统计" : bytes(report.allocatedBytes)}</strong></div>
        <div><span>文件逻辑大小</span><strong>{report.logicalBytes == null ? "未取得统计" : bytes(report.logicalBytes)}</strong></div>
        <div><span>覆盖问题</span><strong>{report.issues}</strong></div>
      </div>
      <div className="ai-report-controls">
        <button className="button secondary" disabled={busy || !canBaseline(report)} onClick={() => onBaseline(report)}>{baseline ? "替换会话基线" : "设为会话基线"}</button>
        <span>{baseline ? `基线：${new Date(baseline.measuredAt).toLocaleString()}` : "尚未设置基线"}</span>
      </div>
      <p>{delta == null ? "尚无可比差值：需要基线之后、相同根目录／来源／版本／分类规则的完整统计。" : `相对基线分配块变化：${delta > 0 ? "+" : delta < 0 ? "−" : ""}${bytes(Math.abs(delta))}（不是可释放空间）`}</p>
      <p>基线仅在当前应用会话保留，重启清空；部分统计不能设置或比较。分组规则集合变化需重新设定基线。</p>
      {report.coverage.status !== "complete" && <p className="warning-text">统计未覆盖全部内容，已显示数字只代表观测部分，不能当作总占用。</p>}
      <p>仅统计普通文件；硬链接在本工具根内归入首次遇到的分组。目录自身占用未计入，APFS 克隆可能共享数据；这里不是可释放空间，不跨工具相加。</p>
      {report.notes.length > 0 && <details><summary>查看覆盖问题（{report.issues}）</summary><ul>{report.notes.map((note, i) => <li key={i}>{note}</li>)}</ul></details>}
      <CoverageDiagnostics coverage={report.coverage} />
      <div className="ai-report-controls">
        <label>数据策略 <select value={filter} onChange={(e) => { setFilter(e.target.value); setLimit(50); }}>
          <option value="all">全部</option>
          {Object.entries(policies).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <span>显示 {visible.length} / {items.length} 个目录分组</span>
      </div>
      {[...new Set(visible.map((item) => item.category))].map((category) => (
        <section className="ai-category" key={category} aria-label={category}>
          <h3>{category}</h3>
          {visible.filter((item) => item.category === category).map((item) => (
            <details className="ai-item" key={`${item.group}-${item.category}`}>
              <summary>
                <span className="ai-group">{item.group}</span>
                <span>{policies[item.policy]}</span>
                <strong>{bytes(item.allocatedBytes)}</strong>
              </summary>
              <p>{item.files} 个文件条目 · 逻辑大小 {bytes(item.logicalBytes)} · 最近修改 {item.modifiedAt == null ? "未知" : new Date(item.modifiedAt).toLocaleString()}（不是最后使用时间）</p>
              <p>{item.impact}</p>
              <p>依据：{item.evidence} · {item.ruleId} v{item.ruleVersion}</p>
              <code className="ai-path">{report.root}/{item.group}</code>
              <p>只读分析，本项未开放清理。</p>
            </details>
          ))}
        </section>
      ))}
      {items.length === 0 && <p>没有可展示的分组；请同时查看覆盖状态，不代表没有其他数据。</p>}
      {items.length > limit && <button className="text-button" onClick={() => setLimit((n) => n + 50)}>再显示 50 项</button>}
    </article>
  );
}

export default function AiData({ desktop, busy, scanning, reports, baselines, onBaseline, onAnalyze, onCancel }: {
  desktop: boolean; busy: boolean; scanning: boolean; reports: AiReport[] | null;
  baselines: AiReport[]; onBaseline: (report: AiReport) => void;
  onAnalyze: (roots: AiRoot[]) => void; onCancel: () => void;
}) {
  const [codex, setCodex] = useState("~/.codex");
  const [claude, setClaude] = useState("~/.claude");
  const [useCodex, setUseCodex] = useState(true);
  const [useClaude, setUseClaude] = useState(true);
  return (
    <section className="ai-data">
      <form className="ai-scope" onSubmit={(e) => {
        e.preventDefault();
        if (busy || !desktop) return;
        const roots: AiRoot[] = [];
        if (useCodex) roots.push({ tool: "codex", path: codex.trim() });
        if (useClaude) roots.push({ tool: "claude", path: claude.trim() });
        if (roots.length) onAnalyze(roots);
      }}>
        <h2><ShieldCheck size={19} aria-hidden="true" /> 先确认分析范围</h2>
        <p>只读取文件名、大小和修改时间，不读取对话、配置或凭据正文，不删除文件。</p>
        <p>默认位置不代表实际配置。若使用自定义数据或日志目录，请填入主目录内的实际路径；本页不会读取终端环境或自动发现所有位置。</p>
        <div className="ai-root-input">
          <label><input type="checkbox" checked={useCodex} disabled={busy} onChange={(e) => setUseCodex(e.target.checked)} />Codex</label>
          <input aria-label="Codex 数据目录" value={codex} disabled={busy || !useCodex} onChange={(e) => setCodex(e.target.value)} required={useCodex} />
        </div>
        <div className="ai-root-input">
          <label><input type="checkbox" checked={useClaude} disabled={busy} onChange={(e) => setUseClaude(e.target.checked)} />Claude Code</label>
          <input aria-label="Claude Code 数据目录" value={claude} disabled={busy || !useClaude} onChange={(e) => setClaude(e.target.value)} required={useClaude} />
        </div>
        <div className="ai-report-controls">
          <span>范围上限：每工具 30 秒／10 万条目／12 层，总计 60 秒；达到预算时显示已观测部分。</span>
          {scanning ? <button type="button" className="button secondary" onClick={(e) => { e.preventDefault(); onCancel(); }}>停止分析</button> :
            <button className="button primary" disabled={!desktop || busy || (!useCodex && !useClaude)}><Search size={16} />开始只读分析</button>}
        </div>
        {scanning && <p role="status">正在读取元数据；遇到权限或数量限制会返回部分结果。</p>}
      </form>
      {reports?.map((report) => <ToolReport key={`${report.tool}-${report.root}-${report.measuredAt}`} report={report} busy={busy} baseline={baselines.find((b) => b.tool === report.tool && b.root === report.root)} onBaseline={onBaseline} />)}
      {!reports && !scanning && <p className="ai-intro">分析后可查看数据分类、保护依据与处理影响。版本未验证的数据保持只读，不会推荐整目录清空。</p>}
    </section>
  );
}
