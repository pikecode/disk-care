import { useEffect, useRef, useState } from "react";
import { AppWindow, Search, RefreshCw, ShieldCheck, FolderSearch, LoaderCircle } from "lucide-react";
import type { AppCatalog, ResidueReport, UninstallPreview, UninstallResult, UninstallRecord, AppUsage } from "./types";
import { api } from "./api";
import { bytes } from "./format";
import { compareAssociation, matchesAppReport, applicationGroups, visibleApplications, visibleSources, attentionSource, type AppGroup } from "./appAssociation";
import AppIcon from "./AppIcon";
import CoverageDiagnostics from "./CoverageDiagnostics";
const labels: Record<string, string> = { complete: "范围内检查完成", absent: "目录不存在", denied: "访问被拒绝", failed: "读取失败", skipped: "有内容跳过", limited: "达到上限", cancelled: "已停止", pending: "尚未访问" };
export default function AppResidue({ onUsage, active, desktop, busy, scanning, report: savedReport, onInspect, onCancel, onPrepareUninstall, onExecuteUninstall }: {
  onUsage: (path: string, bundleId: string) => Promise<AppUsage>;
  active: boolean; desktop: boolean; busy: boolean; scanning: boolean; report: ResidueReport | null;
  onPrepareUninstall: (path: string, bundleId: string) => Promise<UninstallPreview>;
  onExecuteUninstall: (token: number) => Promise<UninstallResult>;
  onInspect: (bundleId: string | null, appPath?: string) => void; onCancel: () => void;
}) {
  const [history, setHistory] = useState<UninstallRecord[]>([]);
  const [comparisonRecord, setComparisonRecord] = useState<UninstallRecord | null>(null);
  const [historyError, setHistoryError] = useState("");
  const readHistory = () => { if (desktop) void api.uninstallHistory().then(records => { setHistory(records); setHistoryError(""); }).catch(e => setHistoryError(String(e))); };
  useEffect(() => { if (active) readHistory(); }, [active, desktop]);
  const scope = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const selectedButton = useRef<HTMLButtonElement | null>(null);
  const uninstallDialog = useRef<HTMLDialogElement>(null);
  const uninstallCancel = useRef<HTMLButtonElement>(null);
  const [uninstallPlan, setUninstallPlan] = useState<UninstallPreview | null>(null);
  const [previewTime, setPreviewTime] = useState(Date.now());
  useEffect(() => {
    if (!uninstallPlan) return;
    setPreviewTime(Date.now());
    const timer = window.setInterval(() => setPreviewTime(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [uninstallPlan]);
  const remaining = uninstallPlan ? Math.max(0, Math.ceil((uninstallPlan.expiresAt - previewTime) / 1000)) : 0;
  const previewExpired = !Number.isFinite(remaining) || remaining <= 0;
  const [uninstallError, setUninstallError] = useState<{ message: string; stage: "preview" | "execute"; path: string; bundleId: string } | null>(null);
  const [uninstallAck, setUninstallAck] = useState(false);
  const [uninstallWorking, setUninstallWorking] = useState(false);
  const [uninstalled, setUninstalled] = useState<UninstallResult | null>(null);
  useEffect(() => {
    if (uninstallPlan && !uninstallDialog.current?.open) {
      uninstallDialog.current?.showModal();
      uninstallCancel.current?.focus();
    }
    if (!uninstallPlan && uninstallDialog.current?.open) uninstallDialog.current.close();
  }, [uninstallPlan]);
  const [usage, setUsage] = useState<AppUsage | null>(null);
  const [usageWorking, setUsageWorking] = useState(false);
  const [usageError, setUsageError] = useState("");
  const [group, setGroup] = useState<AppGroup>("all");
  const [descending, setDescending] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<"all" | "content" | "attention">("all");
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<AppCatalog | null>(null);
  const [loadingApps, setLoadingApps] = useState(false);
  const [appPath, setAppPath] = useState("");
  const [bundleId, setBundleId] = useState("");
  const [special, setSpecial] = useState(false);
  const report = matchesAppReport(savedReport, bundleId, appPath, special) ? savedReport : null;
  useEffect(() => setSourceFilter("all"), [report]);
  const valid = bundleId.length <= 200 && /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(bundleId);
  const [ack, setAck] = useState(false);
  const [error, setError] = useState("");
  const [locating, setLocating] = useState(false);
  const apps = visibleApplications(catalog?.apps ?? [], query, group, descending);
  const groups = applicationGroups(catalog?.apps ?? []);
  const selectedUsage = usage?.path === appPath && usage.bundleId === bundleId ? usage : null;
  const selectedName = appPath ? catalog?.apps.find(app => app.path === appPath)?.name ?? bundleId : special ? "特殊路径检查" : bundleId;
  const readApps = () => {
    setLoadingApps(true); setError("");
    void api.installedApps().then(setCatalog).catch(e => setError(String(e))).finally(() => setLoadingApps(false));
  };
  async function inspectUsage() {
    setUsageWorking(true); setUsageError(""); setUsage(null);
    try { setUsage(await onUsage(appPath, bundleId)); }
    catch (e) { setUsageError(String(e)); }
    finally { setUsageWorking(false); }
  }
  function selectApp(app: AppCatalog["apps"][number], button: HTMLButtonElement) {
    selectedButton.current = button;
    setUsage(null); setUsageError(""); setError(""); setUninstallError(null); setUninstalled(null);
    setComparisonRecord(null); setAppPath(app.path); setBundleId(app.bundleId); setSpecial(false); setAck(false);
    requestAnimationFrame(() => scope.current?.focus({ preventScroll: true }));
  }
  async function previewUninstall(path = appPath, id = bundleId) {
    setUninstallPlan(null); setError(""); setUninstallError(null); setUninstallAck(false); setUninstallWorking(true);
    try { setUninstallPlan(await onPrepareUninstall(path, id)); }
    catch (e) { setUninstallError({ message: String(e), stage: "preview", path, bundleId: id }); }
    finally { setUninstallWorking(false); }
  }
  async function confirmUninstall() {
    if (!uninstallPlan || !uninstallAck || uninstallWorking) return;
    if (previewExpired || Date.now() >= uninstallPlan.expiresAt) { setPreviewTime(Date.now()); return; }
    setUninstallWorking(true); setError("");
    try {
      const outcome = await onExecuteUninstall(uninstallPlan.token);
      setUninstalled(outcome);
      setComparisonRecord({ at: outcome.at ?? Date.now(), name: outcome.name, path: outcome.path, bundleId: outcome.bundleId, success: true, message: "应用包已移到废纸篓", before: outcome.before });
      setCatalog(current => current ? { ...current, apps: current.apps.filter(app => app.path !== outcome.path) } : null);
      setAppPath(""); setBundleId(outcome.bundleId); setSpecial(false); setAck(false);
    } catch (e) { setUninstallError({ message: String(e), stage: "execute", path: uninstallPlan.path, bundleId: uninstallPlan.bundleId }); }
    finally { readHistory(); setUninstallWorking(false); setUninstallPlan(null); setUninstallAck(false); }
  }
  const comparison = report && comparisonRecord ? compareAssociation(comparisonRecord, report) : null;
  const candidates = report?.sources.reduce((count, source) => count + source.candidates.length, 0) ?? 0;
  const complete = !!report?.sources.length && report.sources.every(source => ["complete", "absent"].includes(source.coverage.status));
  return <section className="residue-workspace" aria-label="应用管理" onKeyDown={event => {
    if (active && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f" && !uninstallPlan) { event.preventDefault(); search.current?.focus(); }
  }}>
    <div className="residue-browser">
      <header className="residue-toolbar"><div><h2>应用</h2><span>{catalog ? `${catalog.apps.length} 个应用副本` : "本机应用目录"}</span></div>
        <button className="residue-refresh" aria-label="读取应用列表" title="刷新应用列表" disabled={!desktop || busy || loadingApps} onClick={readApps}><RefreshCw size={16} className={loadingApps ? "spin" : ""} /></button>
      </header>
      <div className="residue-search"><Search size={15} aria-hidden="true" /><input ref={search} aria-label="搜索应用" placeholder="搜索应用" value={query} disabled={!catalog} onChange={e => setQuery(e.target.value)} /></div>
      {catalog && <div className="residue-list-tools"><div role="group" aria-label="应用分组">{([["all","全部"],["copies","多个副本"],["protected","受保护"]] as const).map(([value,label]) => <button key={value} aria-pressed={group === value} onClick={() => setGroup(value)}>{label}</button>)}</div><label>排序<select aria-label="应用排序" value={descending ? "desc" : "asc"} onChange={e => setDescending(e.target.value === "desc")}><option value="asc">名称 A → Z</option><option value="desc">名称 Z → A</option></select></label><p>显示 {apps.length} / {catalog.apps.length} 个副本{group === "copies" ? " · 仅按已发现的相同标识分组，不代表内容相同或可删除" : group === "protected" ? " · 标识保护策略，不等于签名鉴定" : ""}</p></div>}
      {loadingApps ? <div className="residue-empty" role="status"><LoaderCircle size={28} className="spin" /><h3>正在读取应用</h3><p>读取名称与应用标识，不读取个人配置。</p><button className="text-button" onClick={onCancel}>停止读取应用列表</button></div> : catalog ? <>
        <ul className="residue-app-list" aria-label="可检查的应用" onKeyDown={event => {
          if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
          const selector = (document.activeElement as HTMLElement)?.classList.contains("residue-row-uninstall") ? ".residue-row-uninstall:not(:disabled)" : ".residue-check:not(.residue-row-uninstall):not(:disabled)";
          const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(selector));
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          if (index < 0) return;
          event.preventDefault();
          const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
          buttons[next]?.focus();
        }}>{apps.map(app => <li key={app.path} className={appPath === app.path ? "selected" : ""}>
          <AppIcon path={app.path} bundleId={app.bundleId} name={app.name} active={active && desktop} />
          <div title={`${app.name}\n${app.bundleId}\n${app.path}`}><strong>{app.name}</strong>{groups.protectedApp(app.bundleId) && <small className="residue-copy-tag">受保护</small>}{(groups.copies.get(app.bundleId) ?? 0) > 1 && <small className="residue-copy-tag">已发现 {groups.copies.get(app.bundleId)} 个副本</small>}<span>{app.version ? `版本 ${app.version}` : ""}</span></div>
          <button className="residue-check" aria-label={`查看 ${app.name}`} aria-current={appPath === app.path ? "true" : undefined} disabled={busy || locating || uninstallWorking} onClick={event => selectApp(app, event.currentTarget)}>查看</button>
          <button className="residue-check residue-row-uninstall" aria-label={`卸载 ${app.name}`} title={groups.protectedApp(app.bundleId) ? "系统应用与留白自身受到保护" : "预览卸载范围，确认后才移到废纸篓"} disabled={!desktop || busy || locating || uninstallWorking || groups.protectedApp(app.bundleId)} onClick={event => { selectApp(app, event.currentTarget); void previewUninstall(app.path, app.bundleId); }}>卸载…</button>
        </li>)}</ul>
        {!apps.length && <div className="residue-empty"><Search size={28} /><h3>{catalog.apps.length ? "未找到应用" : "未发现应用"}</h3><p>{catalog.apps.length ? "没有匹配的应用，试试其他名称或分组。" : "可查看读取详情，或使用手动检查。"}</p></div>}
        <details className="residue-catalog-details"><summary>{labels[catalog.coverage.status] ?? "覆盖未知"} · 读取详情</summary><p>仅列出常规应用目录及一层分类。未列出不代表已卸载。</p><CoverageDiagnostics coverage={catalog.coverage} /><p><code>/Applications</code><br /><code>~/Applications</code></p></details>
      </> : <div className="residue-empty"><AppWindow size={32} strokeWidth={1.4} /><h3>从一个应用开始</h3><p>读取本机应用列表，选择要检查的应用。</p><button className="button primary" disabled={!desktop || busy} onClick={readApps}>载入应用</button></div>}
      <details className="residue-manual"><summary>手动标识与特殊路径检查</summary><p>适用于未列出的应用或已卸载应用；标识由你提供，不能据此判断卸载状态。</p><button className="text-button" disabled={busy || loadingApps} onClick={() => { setUninstallError(null); setUninstalled(null); setComparisonRecord(null); setAppPath(""); setBundleId(""); setSpecial(false); setAck(false); }}>切换为手动检查</button>
      <label>应用标识 <input aria-label="应用标识" value={bundleId} disabled={busy || special || !!appPath || loadingApps} placeholder="org.example.app" onChange={e => { setComparisonRecord(null); setBundleId(e.target.value); setAck(false); }} /></label>
      <label><input type="checkbox" checked={special} disabled={busy} onChange={e => { setComparisonRecord(null); setSpecial(e.target.checked); setAppPath(""); setAck(false); }} />补充样例：检查 CC Switch 特殊路径（替代通用标识检查）</label>
      </details>
    </div>
    <div className="residue-inspector">

      {uninstalled && <div className="residue-uninstalled" role="status"><strong>{uninstalled.name} 已移到废纸篓</strong><code className="ai-path">原位置：{uninstalled.path}</code>{uninstalled.warning && <p role="alert">{uninstalled.warning}</p>}<p>关联数据已保留，应用移入废纸篓不会立即释放空间。</p><details><summary>如何恢复应用？</summary><p>打开 Finder 的废纸篓，找到应用并选择“放回原处”。若已清空废纸篓，需要重新安装。</p>{uninstalled.trashPath && <code className="ai-path">移入位置：{uninstalled.trashPath}</code>}</details><button className="text-button" disabled={busy || loadingApps || uninstallWorking} onClick={() => { setComparisonRecord({at:uninstalled.at ?? Date.now(), name:uninstalled.name,path:uninstalled.path,bundleId:uninstalled.bundleId,success:true,message:"应用包已移到废纸篓",before:uninstalled.before}); setAppPath(""); setBundleId(uninstalled.bundleId); setSpecial(false); setAck(false); scope.current?.focus({ preventScroll: true }); }}>检查该应用的关联文件</button></div>}
      {!valid && !special && <div className="residue-welcome"><span className="residue-welcome-icon"><FolderSearch size={40} strokeWidth={1.25} /></span><h2>检查应用关联文件</h2><p>在左侧找到应用，点击“查看”。<br />关联数据、用途与检查结果会在这里展示。</p><span className="residue-readonly"><ShieldCheck size={14} />只读检查 · 不会删除文件</span></div>}
      {(valid || special) && <section className="residue-scope" ref={scope} tabIndex={-1} aria-label="应用详情" onKeyDown={event => {
        if (event.key !== "Escape" || busy || loadingApps || uninstallPlan) return;
        event.preventDefault(); event.stopPropagation();
        if (selectedButton.current?.isConnected && !selectedButton.current.disabled) selectedButton.current.focus();
        else search.current?.focus();
      }}>
      <header className="residue-detail-heading"><AppIcon path={appPath || undefined} bundleId={bundleId} name={selectedName} active={active && desktop} /><div><span className="residue-kicker">{appPath ? "已选择应用" : "手动检查"}</span><h2>{selectedName}</h2></div></header>
      <p className="residue-key-hint">Esc 返回应用列表</p>
      <code className="ai-path">{appPath || (special ? "历史样例路径" : bundleId)}</code>
      {savedReport && !report && (valid || special) && <p className="residue-report-note" role="status">当前目标没有匹配的检查报告。上次报告已保留，切回原目标后可查看匹配结果。</p>}
      {comparisonRecord && <p className="residue-association-note">已选择 {comparisonRecord.name} 的卸载记录。{comparisonRecord.before ? "主动检查后可对照卸载前观测。" : "没有卸载前观测，本次仅显示当前关联项。"}历史不证明当前没有其他安装副本。</p>}
      <div className="residue-section-heading"><h3>检查范围</h3><span className="residue-readonly"><ShieldCheck size={13} />只读</span></div>
      <p>查看缓存、应用数据与设置等关联文件，只检查，不删除。</p>
      {!appPath && <label><input type="checkbox" checked={ack} disabled={busy} onChange={e => setAck(e.target.checked)} />我已了解检查来源与敏感范围</label>}
      <div className="ai-report-controls">{scanning ? <button className="button secondary" onClick={onCancel}>停止关联检查</button> : <button className="button primary" aria-label="检查关联文件" disabled={!desktop || busy || loadingApps || uninstallWorking || (!appPath && !ack) || locating || (!special && !valid)} onClick={() => { setError(""); onInspect(special ? null : bundleId, appPath || undefined); }}>检查关联文件</button>}{appPath && <button className="text-button" disabled={!desktop || busy || loadingApps || locating || uninstallWorking || groups.protectedApp(bundleId)} onClick={() => void previewUninstall()}>{uninstallWorking ? "正在准备卸载…" : "卸载此应用…"}</button>}</div>
      <details className="residue-technical"><summary>查看检查位置与说明</summary>
      <div className="residue-source-preview">{(special ? [["配置目录", "CC Switch 配置元数据"], ["安装包", "下载目录第一层名称线索"], ["崩溃记录", "CrashReporter 第一层名称线索"]] : [["应用缓存", "可重建性与独占性未验证"], ["应用数据", "可能包含个人资料，默认保留"], ["偏好设置", "可能包含敏感配置，默认保留"], ["应用日志", "排障记录可能含敏感信息，默认保留"], ["保存状态", "窗口与会话恢复资料，默认保护"]]).map(([name, note]) => <div key={name}><span>{name}</span><small>{note}</small></div>)}</div>
      {special ? <ul><li>~/.cc-switch</li><li>~/Downloads（仅第一层）</li><li>~/Library/Application Support/CrashReporter（仅第一层）</li></ul> : <ul><li>~/Library/Caches/{bundleId}</li><li>~/Library/Application Support/{bundleId}</li><li>~/Library/Preferences/{bundleId}.plist</li><li>~/Library/Logs/{bundleId}</li><li>~/Library/Saved Application State/{bundleId}.savedState</li></ul>}
      <p>仅检查上述路径，不读取配置或凭据正文；其他目录名、容器及共享组未覆盖。关联文件不等于卸载残留或可删除文件。</p>
      <p>共享上限为 30 秒、20,000 条目、200 候选、12 层；不跟随链接，不跨设备。</p>
      <p>{appPath ? "检查前复核应用标识，变化时需重新选择。" : "安装状态未知。"}进程、安装收据、挂载镜像未检查。</p></details>

      {appPath && <section className="residue-usage" aria-label="应用本体"><div className="residue-section-heading"><h3>应用本体</h3><span>不包含用户关联数据</span></div>{selectedUsage ? <><strong className="residue-usage-value">{bytes(selectedUsage.allocatedBytes)}</strong><p>已观测分配块 · {selectedUsage.entries} 条目 · {labels[selectedUsage.coverage.status] ?? "覆盖未知"}</p><p>{new Date(selectedUsage.measuredAt).toLocaleString()}</p><CoverageDiagnostics coverage={selectedUsage.coverage} /></> : <p>按需检查所选应用包的占用，不会读取文件正文。</p>}<div className="residue-usage-actions">{usageWorking ? <button className="button secondary" onClick={onCancel}>停止占用检查</button> : <button className="button secondary" disabled={!desktop || busy || loadingApps || locating || uninstallWorking} onClick={() => void inspectUsage()}>计算应用本体占用</button>}</div><details className="residue-technical"><summary>占用统计说明</summary><p>占用不等于可释放量。遍历预算5秒，跳过符号链接与跨设备，同卷硬链接去重，包含目录分配块。</p></details>{usageError && <p role="alert">{usageError}</p>}</section>}
      </section>}
    {uninstallError && <section className="residue-uninstall-error" role="alert" aria-label="卸载未完成">
      <h3>{uninstallError.stage === "preview" ? "暂时无法准备卸载" : "卸载未完成"}</h3>
      <p>{uninstallError.message}</p><code className="ai-path">{uninstallError.path}</code>
      <p>根据上方原因正常退出相关程序，或核对目标位置的访问权限后重试。重试会重新检查并要求确认，不会直接执行卸载。</p>
      <button className="button secondary" disabled={!desktop || busy || loadingApps || uninstallWorking} onClick={() => void previewUninstall(uninstallError.path, uninstallError.bundleId)}>重新检查并预览</button>
    </section>}
    {error && <p role="alert">{error}</p>}
    {report && <div className="residue-results">{comparisonRecord && <section className="residue-comparison" aria-label="卸载前后观测"><h3>卸载前后观测</h3><p>记录针对所选应用副本；仍存在的关联项不等于可删除残留，本次未发现也不证明由卸载造成。</p>{comparison ? comparison.map(item => <div key={item.path}><strong>{item.name} · {item.status}</strong><p>卸载前：{item.beforeBytes === null ? "无完整占用" : bytes(item.beforeBytes)}；本次：{item.afterBytes === null ? "无完整占用" : bytes(item.afterBytes)}</p></div>) : <p>{!comparisonRecord.success ? "此操作未完成卸载，不生成卸载后对照。" : comparisonRecord.before ? "目标、规则版本或观测时间不满足对照条件，请主动重新检查；不推断释放空间。" : "没有卸载前观测，无法生成前后对照。"}</p>}</section>}<div className="residue-section-heading"><h3>检查结果</h3><span>最近一次检查</span></div><div className="residue-result-summary" aria-live="polite"><div><strong>{candidates}</strong><span>候选条目 · 未跨来源去重</span></div><div><strong>{complete ? "范围内完成" : "检查不完整"}</strong><span>{report.sources.length ? `${report.sources.length} 个来源` : "没有可用来源"}</span></div></div><p>以下为各来源已观测占用，不跨来源相加，也不代表可释放空间。</p><details className="residue-technical"><summary>报告目标：{report.target}</summary><p>报告目标：{report.target} · 观测时间：{new Date(report.measuredAt).toLocaleString()}。身份依据：{report.identitySource ?? "用户标识或样例规则，安装状态未知"}。占用不等于可回收量，不跨来源相加；同次检查硬链接去重，APFS 共享仍可能重复。</p></details><div className="residue-source-filters" role="group" aria-label="关联结果筛选">{([["all",`全部 ${report.sources.length}`],["content",`发现内容 ${report.sources.filter(s => s.candidates.length > 0).length}`],["attention",`需关注 ${report.sources.filter(attentionSource).length}`]] as const).map(([value,label]) => <button key={value} aria-pressed={sourceFilter === value} onClick={() => setSourceFilter(value)}>{label}</button>)}</div>{!visibleSources(report, sourceFilter).length && <p>此筛选条件下没有来源，完整报告仍保留。</p>}{visibleSources(report, sourceFilter).map(source => <article className="ai-report" key={source.path}>
      <h3>{source.name} · {labels[source.coverage.status] ?? "状态未知"}</h3><code className="ai-path">{source.path}</code><p>已观测占用 {bytes(source.candidates.reduce((total, item) => total + item.allocatedBytes, 0))}{!["complete", "absent"].includes(source.coverage.status) ? " · 部分统计" : ""}</p>
      <p>关联依据见候选证据；精确路径或名称线索均不证明独占。</p>{source.impact && <p>{source.impact}</p>}
      <CoverageDiagnostics coverage={source.coverage} />
      {!source.candidates.length && <p>{source.coverage.status === "complete" ? "本次检查范围内未发现候选。" : "没有候选可展示，请先查看覆盖状态；不代表没有残留。"}</p>}
      {source.candidates.map(candidate => <details className="ai-item" key={candidate.id}><summary>{candidate.category} · 已观测 {bytes(candidate.allocatedBytes)}</summary>
        <code className="ai-path">{candidate.path}</code><p>{candidate.evidence}</p><p>逻辑大小 {bytes(candidate.logicalBytes)}；{labels[source.coverage.status]}。关联线索不代表可删除；配置可能包含凭据。</p>
        <button className="text-button" disabled={busy || locating} onClick={() => { setError(""); setLocating(true); void api.revealResidue(report.id, candidate.id).catch(e => setError(String(e))).finally(() => setLocating(false)); }}>在 Finder 中定位候选</button>
      </details>)}
    </article>)}</div>}
      <details className="residue-history"><summary>卸载记录 · {history.length}</summary><p>最多保留最近 100 次执行记录。历史状态不代表应用当前仍在废纸篓。</p>{historyError && <p role="alert">{historyError}</p>}{!history.length && !historyError && <p>还没有卸载记录。</p>}{history.map((record, index) => <article key={`${record.at}-${index}`}><strong>{record.name} · {record.success ? "已移到废纸篓" : "未完成卸载"}</strong><p>{new Date(record.at).toLocaleString()}</p><code className="ai-path">{record.path}</code><p>{record.message}</p>{record.success && <p>恢复方式：在 Finder 的废纸篓中找到应用，使用“放回原处”；若已清空则需重新安装。</p>}<button className="text-button" disabled={busy || loadingApps || uninstallWorking} onClick={() => { setUninstallError(null); setUninstalled(null); setComparisonRecord(record); setAppPath(""); setBundleId(record.bundleId); setSpecial(false); setAck(false); }}>选择此标识检查关联文件</button><p>{record.before ? `已保存卸载前 ${record.before.sources.length} 个来源的观测` : "未保存卸载前观测，旧记录不能补造基线"}</p></article>)}<button className="text-button" disabled={busy} onClick={readHistory}>刷新卸载记录</button></details>
    </div>
    <dialog className="uninstall-dialog" ref={uninstallDialog} aria-labelledby="uninstall-title" onCancel={e => { e.preventDefault(); if (!uninstallWorking) { setUninstallPlan(null); setUninstallAck(false); } }}>
      {uninstallPlan && <><h2 id="uninstall-title">卸载 {uninstallPlan.name}？</h2><div className="uninstall-impact"><div><strong>移到废纸篓</strong><span>仅所选应用本体</span></div><div><strong>保留</strong><span>缓存、设置与个人资料</span></div></div><code className="ai-path">{uninstallPlan.path}</code><p>可在废纸篓中“放回原处”。本次不会清空废纸篓，也不会立即释放空间。</p><details className="residue-technical"><summary>关联检查与卸载范围说明</summary><p>{uninstallPlan.before ? `将保存 ${new Date(uninstallPlan.before.measuredAt).toLocaleString()} 的卸载前观测（${uninstallPlan.before.sources.length} 个来源），用于之后主动复查。` : "没有近期卸载前观测。需要前后对照时，可取消后先检查关联文件。"}</p><p>软件附带专用卸载器时优先使用。后台服务和扩展不会被移除；本次操作不代表彻底卸载。预览有效期最多60秒。</p><code className="ai-path">{uninstallPlan.bundleId}</code></details><p role="status">{uninstallWorking ? "正在处理，请等待系统返回结果。" : previewExpired ? "预览已过期，请重新预览并确认。" : `预览剩余 ${remaining} 秒`}</p><label><input type="checkbox" checked={uninstallAck} disabled={uninstallWorking || previewExpired} onChange={e => setUninstallAck(e.target.checked)} />我确认将这个应用移到废纸篓</label><div className="uninstall-actions"><button className="button secondary" ref={uninstallCancel} disabled={uninstallWorking} onClick={() => { setUninstallPlan(null); setUninstallAck(false); }}>取消卸载</button>{previewExpired && !uninstallWorking && <button className="button secondary" onClick={() => void previewUninstall()}>重新预览卸载</button>}<button className="button primary" disabled={!uninstallAck || uninstallWorking || previewExpired} onClick={() => void confirmUninstall()}>{uninstallWorking ? "正在移到废纸篓…" : "确认移到废纸篓"}</button></div></>}
    </dialog>
  </section>;
}
