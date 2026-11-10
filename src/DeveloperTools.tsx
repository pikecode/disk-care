import { useEffect, useRef, useState } from "react";
import { Folder, LoaderCircle, RefreshCw } from "lucide-react";
import type { DeveloperEntry, DeveloperReport, DeveloperPreview, Item } from "./types";
import { bytes } from "./format";
import CoverageDiagnostics from "./CoverageDiagnostics";
import { developerTools, updateLedger, largestSource, orderedTools, byObservedSize } from "./developerLedger";
import type { ToolId, ToolLedger } from "./developerLedger";

const status: Record<string, string> = { complete: "范围内完成", absent: "当前位置不存在", failed: "未能确认", denied: "访问被拒绝", limited: "部分统计", cancelled: "已停止", pending: "尚未访问", skipped: "已跳过" };
const entryKey = (entry: DeveloperEntry) => JSON.stringify([entry.name, entry.path]);
const amount = (entry?: DeveloperEntry) => !entry || entry.allocatedBytes === null ? "未统计" : `${["complete", "absent"].includes(entry.coverage.status) ? "" : "≥ "}${bytes(entry.allocatedBytes)}`;

export default function DeveloperTools({ desktop, busy, folder, onChoose, onAnalyze, onPreview, onCancel }: {
  desktop: boolean; busy: boolean; folder: Item | null; onChoose: () => void;
  onAnalyze: (ids: string[], selectedId?: string) => Promise<DeveloperReport>;
  onPreview: () => Promise<DeveloperPreview>; onCancel: () => void;
}) {
  const [selected, setSelected] = useState<ToolId[]>(["yarn", "pnpm", "poetry", "homebrew"]);
  const [config, setConfig] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const [working, setWorking] = useState<"analysis" | "preview" | null>(null);
  const [ledger, setLedger] = useState<ToolLedger>({});
  const [activeTool, setActiveTool] = useState<ToolId>("yarn");
  const [activeSource, setActiveSource] = useState<string | null>(null);
  const [order, setOrder] = useState("size");
  const [preview, setPreview] = useState<DeveloperPreview | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  useEffect(() => { if (config) dialog.current?.showModal(); else dialog.current?.close(); }, [config]);
  function configure(ids: ToolId[]) { setSelected(ids); setConfig(true); }
  const disabled = !desktop || busy || !!working;
  async function analyze(ids: ToolId[]) {
    if (disabled || !ids.length || (ids.includes("rust") && !folder)) return;
    const project = folder ? { id: folder.id, path: folder.path } : null;
    setConfig(false); setWorking("analysis"); setError("");
    try {
      const report = await onAnalyze(ids, ids.includes("rust") ? project?.id : undefined);
      setLedger(previous => updateLedger(previous, ids, report, project));
      setActiveTool(ids[0]); setActiveSource(null); setFilter("all");
    } catch (e) { setError(`本次分析失败：${String(e)}。已有报告保留，请核对其观测时间后重试。`); }
    finally { setWorking(null); }
  }
  async function nativePreview() {
    setWorking("preview"); setError(""); setPreview(null);
    try { setPreview(await onPreview()); } catch (e) { setError(String(e)); } finally { setWorking(null); }
  }
  const observation = ledger[activeTool];
  const entries = observation?.report.entries.filter(e => filter === "all" || (filter === "protected" ? /保护|保留/.test(e.kind) : !/保护|保留/.test(e.kind))).slice().sort(byObservedSize) ?? [];
  const detail = entries.find(entry => entryKey(entry) === activeSource) ?? entries[0];
  const currentName = developerTools.find(([id]) => id === activeTool)![1];
  const projectChanged = activeTool === "rust" && observation?.project?.id !== folder?.id;
  return <section className="developer-tools" aria-label="开发工具空间账本">
    <section className="developer-start">
      <div><h2>查看开发工具占用</h2><p>检查缓存、构建文件和安装内容，不会删除文件。</p></div>
      {working === "analysis" ? <div className="developer-controls"><LoaderCircle size={16} className="spin" /><span role="status">正在检查…</span><button className="button secondary" onClick={onCancel}>停止开发工具分析</button></div> : <button className="button primary" disabled={disabled} onClick={() => configure(selected)}>检查开发工具</button>}
    </section>
    <dialog className="developer-confirm" ref={dialog} aria-labelledby="developer-confirm-title" onCancel={event => { event.preventDefault(); setConfig(false); }}>
      <h2 id="developer-confirm-title">检查哪些工具？</h2><p>只统计所选工具的文件占用，不执行清理。工具自身可能读取配置。</p>
      <fieldset disabled={disabled}><legend>选择工具</legend>{developerTools.map(([id, name]) => <label key={id}><input type="checkbox" checked={selected.includes(id)} onChange={e => setSelected(s => e.target.checked ? [...s, id] : s.filter(x => x !== id))} />{name}</label>)}</fieldset>
      {selected.includes("rust") && <div className="developer-project"><Folder size={18} /><div><strong>Rust 项目文件夹</strong><code>{folder?.path ?? "请选择要检查的项目"}</code></div><button className="button secondary" disabled={disabled} onClick={onChoose}>选择项目目录</button></div>}
      <details><summary>查看检查范围</summary><p>查询工具实际缓存位置，超出已支持范围会跳过。Rust仅检查所选项目的默认构建目录；自定义target未识别。Homebrew安装内容、数据库和服务数据只统计并保留。</p><p>不读取文件正文，不跟随链接或跨设备；可能出现系统访问提示。整体约35秒预算，单来源最多3秒；不完整结果会标记。</p></details>
      <footer><button className="button secondary" disabled={busy} onClick={() => setConfig(false)}>取消</button><button className="button primary" disabled={disabled || !selected.length || (selected.includes("rust") && !folder)} onClick={() => void analyze(selected)}>确认并检查</button></footer>
    </dialog>
    {error && <p className="warning-text" role="alert">{error}</p>}
    {!!Object.keys(ledger).length && <section className="developer-report" aria-label="开发工具分析结果">
      <div className="developer-scope-heading"><h2>检查结果</h2><label className="developer-sort">工具排序<select aria-label="开发工具排序" value={order} onChange={e => setOrder(e.target.value)}><option value="size">占用从大到小</option><option value="name">工具名称</option></select></label></div>
      <p>显示各工具最大的单个目录占用，不代表可以清理的空间。</p>
      <div className="developer-workspace">
        <nav className="developer-tool-list" aria-label="已分析工具">{orderedTools(ledger, order).map(([id, name]) => {
          const saved = ledger[id]!; const largest = largestSource(saved);
          const incomplete = !saved.report.entries.length || saved.report.entries.some(e => e.allocatedBytes === null || !["complete", "absent"].includes(e.coverage.status));
          return <button key={id} aria-current={id === activeTool ? "true" : undefined} onClick={() => { setActiveTool(id); setActiveSource(null); setFilter("all"); }}><strong>{name}</strong><span>{amount(largest)}</span><small>{incomplete ? "部分／待确认" : "范围内完成"} · {saved.report.entries.length}个来源</small></button>;
        })}</nav>
        {observation && <section className="developer-tool-detail" aria-label={`${currentName}工具详情`}>
          <div className="developer-scope-heading"><div><h3>{currentName}</h3><p>观测于 {new Date(observation.report.measuredAt).toLocaleString()}</p></div><button className="button secondary" disabled={disabled} onClick={() => configure([activeTool])}><RefreshCw size={14} />重新检查 {currentName}</button></div>
          {observation.project && <p className="developer-project-note">此报告的项目范围：<code>{observation.project.path}</code></p>}
          {projectChanged && <p className="warning-text">当前选择了其他项目。下方仍显示原项目的检查结果。</p>}
          <details className="developer-report-notes"><summary>报告范围说明</summary>{observation.report.notes.map(note => <p key={note}>{note}</p>)}</details>
          <div className="directory-tabs" role="group" aria-label="开发账本筛选">{[["all", "全部来源"], ["candidate", "缓存与构建文件"], ["protected", "需要保留"]].map(([id, label]) => <button key={id} className="button secondary" aria-pressed={filter === id} onClick={() => { setFilter(id); setActiveSource(null); }}>{label}</button>)}</div>
          {!entries.length && <p>此筛选下没有来源，完整报告仍保留。</p>}
          {!!entries.length && <div className="developer-sources" role="group" aria-label="工具来源，按观测占用排序">{entries.map(entry => <button key={entryKey(entry)} aria-pressed={entryKey(entry) === entryKey(detail)} onClick={() => setActiveSource(entryKey(entry))}><span><strong>{entry.name}</strong><small>{entry.kind}</small></span><span><strong>{amount(entry)}</strong><small>{status[entry.coverage.status] ?? "状态未知"}</small></span></button>)}</div>}
          {detail && <article className="developer-entry" aria-label="所选来源详情"><div className="developer-entry-heading"><div><span>{detail.tool} · {detail.kind}</span><h4>{detail.name}</h4></div><strong>{amount(detail)}</strong></div><p>{detail.impact}</p><details className="developer-report-notes"><summary>路径与检查详情</summary>{detail.path && <code>{detail.path}</code>}<p>{detail.basis}</p>{detail.entries !== null && <p>已观测 {detail.entries.toLocaleString()} 个条目；分配块包括目录，不等于独占或可释放空间。</p>}<CoverageDiagnostics coverage={detail.coverage} /></details></article>}
        </section>}
      </div>
    </section>}
    <details className="developer-advanced"><summary>高级：Homebrew 清理建议</summary><section className="developer-native-preview" aria-label="Homebrew原生清理预览"><div className="developer-scope-heading"><h2>Homebrew 原生预览</h2><button className="button secondary" disabled={disabled} onClick={() => void nativePreview()}>{working === "preview" ? "正在读取预览…" : "读取 Homebrew 清理预览"}</button></div><p>固定执行 cleanup --dry-run，仅查看工具建议。不会开始清理，安装与数据库占用不计为可回收量。</p>{preview && <><p>{new Date(preview.measuredAt).toLocaleString()} · {preview.executable}</p><pre>{preview.output || "工具没有返回预览内容；不据此认定全部可清理。"}</pre>{preview.truncated && <p className="warning-text">预览已截断，仅保留前100行／20000字符。</p>}</>}</section></details>
  </section>;
}
