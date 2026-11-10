import { useEffect, useRef, useState } from "react";
import { version as appVersion } from "../package.json";
import { listen } from "@tauri-apps/api/event";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleHelp,
  Database,
  FileBox,
  Folder,
  HardDrive,
  History,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  Package,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Terminal,
  TriangleAlert,
  X,
} from "lucide-react";
import { api, desktop } from "./api";
import { CleanupResult } from "./CleanupOutcome";
import CleanupHistory from "./CleanupHistory";
import CleanupEvidence from "./CleanupEvidence";
import ScanCoverage from "./ScanCoverage";
import ScanAccess from "./ScanAccess";
import ScanActivity, { scanOriginLabels } from "./ScanActivity";
import type { ScanOrigin } from "./types";
import ScanTiming, { ScanWait } from "./ScanTiming";
import ProjectLedger from "./ProjectLedger";
import AiData from "./AiData";
import DeveloperTools from "./DeveloperTools";
import AppResidue from "./AppResidue";
import type { ResidueReport } from "./types";
import SpaceHome from "./SpaceHome";
import ObservationOverview from "./ObservationOverview";
import DirectoryInsights from "./DirectoryInsights";
import CleanupAnalysis from "./CleanupAnalysis";
import {
  analyzeCleanup,
  cleanupAdvice,
  cleanupLabels,
  groupCleanup,
} from "./cleanupEligibility";
import type { CleanupFilter, CleanupIntent } from "./cleanupEligibility";
import type {
  AiReport,
  AiRoot,
  Disk,
  Item,
  Listing,
  Plan,
  Progress,
  ProjectReport,
  Record as CleanRecord,
  Scan,
} from "./types";

import { bytes } from "./format";
const categories = ["全部", "开发缓存", "应用缓存", "模型与数据", "个人文件"];
const icons: { [key: string]: typeof Package } = {
  开发缓存: Package,
  应用缓存: Layers3,
  模型与数据: Database,
  个人文件: Folder,
};
function shortPath(path: string) {
  return path.replace(/^\/Users\/[^/]+/, "~");
}
function date(at: number) {
  return new Date(at).toLocaleString("zh-CN", { hour12: false });
}
function errorMessage(error: unknown) {
  return typeof error === "string"
    ? error
    : error instanceof Error
      ? error.message
      : "操作失败，请重试";
}
const previewItems: Item[] = [
  {
    id: "uv",
    name: "uv 缓存",
    category: "开发缓存",
    path: "~/.cache/uv",
    bytes: 6.8 * 1024 ** 3,
    files: 18312,
    impact: "重新安装依赖时需下载或构建；从缓存运行的工具必须先退出。",
    command: "uv cache clean --cache-dir …",
    blocked: null,
    complete: true,
    issues: 0,
    details: [],
  },
  {
    id: "npm",
    name: "npm 下载缓存",
    category: "开发缓存",
    path: "~/.npm/_cacache",
    bytes: 3.2 * 1024 ** 3,
    files: 7201,
    impact: "下次安装依赖需重新下载；不包含 npx 工具环境。",
    command: "npm cache clean --force --cache …",
    blocked: null,
    complete: true,
    issues: 0,
    details: [],
  },
  {
    id: "downloads",
    name: "下载文件",
    category: "个人文件",
    path: "~/Downloads",
    bytes: 18.4 * 1024 ** 3,
    files: 423,
    impact: "需要逐项判断保留或迁移；不自动删除。",
    command: null,
    blocked: "此项仅分析",
    complete: true,
    issues: 0,
    details: [],
  },
  {
    id: "docker",
    name: "Docker 应用数据",
    category: "模型与数据",
    path: "~/Library/Containers/com.docker.docker",
    bytes: 10.2 * 1024 ** 3,
    files: 35,
    impact: "包含镜像、容器或数据卷；应通过 Docker 管理。",
    command: null,
    blocked: "此项仅分析",
    complete: true,
    issues: 0,
    details: [],
  },
];

export default function App() {
  const [view, setView] = useState<"overview" | "space" | "projects" | "ai" | "residue" | "developer" | "history">(
    "overview",
  );
  const [scanRequest, setScanRequest] = useState<{
    root: string | null;
    origin?: ScanOrigin;
  } | null>(null);
  const [analysisFolder, setAnalysisFolder] = useState<Item | null>(null);
  const [folderAck, setFolderAck] = useState(false);
  const [residueReport, setResidueReport] = useState<ResidueReport | null>(null);
  const [aiBaselines, setAiBaselines] = useState<AiReport[]>([]);
  const [aiReports, setAiReports] = useState<AiReport[] | null>(null);
  const [disk, setDisk] = useState<Disk | null>(null);
  const [scan, setScan] = useState<Scan | null>(null);
  const [status, setStatus] = useState<
    "idle" | "developer" | "developer-preview" | "choose" | "scan" | "projects" | "ai" | "residue" | "usage" | "uninstall" | "prepare" | "clean" | "protect"
  >("idle");
  const [projectReport, setProjectReport] = useState<ProjectReport | null>(
    null,
  );
  const [progress, setProgress] = useState<Progress | null>(null);
  const [category, setCategory] = useState("全部");
  const [cleanupFilter, setCleanupFilter] = useState<CleanupFilter>("all");
  const [cleanupIntent, setCleanupIntent] = useState<CleanupIntent>("all");
  const [scanTime, setScanTime] = useState(Date.now());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [plan, setPlan] = useState<Plan | null>(null);
  const [ack, setAck] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [history, setHistory] = useState<CleanRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  async function readCleanupHistory() {
    if (!desktop) return;
    setHistoryLoading(true); setHistoryError("");
    try { setHistory(await api.history()); }
    catch (e) { setHistoryError(errorMessage(e)); }
    finally { setHistoryLoading(false); }
  }
  const [result, setResult] = useState<CleanRecord | null>(null);
  const [browse, setBrowse] = useState<(Omit<Listing, "items"> & {
    item: Item;
    relative: string;
    children: Item[];
  }) | null>(null);
  const browseRequest = useRef(0);
  const [browseProgress, setBrowseProgress] = useState<Progress | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const modalRef = useRef<HTMLDialogElement>(null);
  const browserRef = useRef<HTMLDialogElement>(null);
  const inventoryRef = useRef<HTMLElement>(null);
  const isSpace = ["space", "projects", "developer", "ai"].includes(view);
  const pageTitle = view === "overview" ? "清理" : view === "space" ? "空间" : view === "projects" ? "项目空间" : view === "developer" ? "开发工具" : view === "ai" ? "AI 数据" : view === "residue" ? "应用" : "清理记录";
  const backgroundTask = status === "ai" && view !== "ai" ? { label: "AI 数据正在分析", target: "ai" as const, name: "AI 数据", cancel: true }
    : (status === "developer" || status === "developer-preview") && view !== "developer" ? { label: status === "developer-preview" ? "正在读取 Homebrew 预览" : "开发工具正在检查", target: "developer" as const, name: "开发工具", cancel: status !== "developer-preview" }
    : status === "projects" && view !== "projects" ? { label: "项目空间正在分析", target: "projects" as const, name: "项目空间", cancel: true }
    : (status === "residue" || status === "usage" || status === "uninstall") && view !== "residue" ? { label: status === "uninstall" ? "应用操作正在进行" : "应用正在检查", target: "residue" as const, name: "应用", cancel: status !== "uninstall" } : null;
  const busy = status !== "idle";
  const items = scan?.items ?? [];
  const analysis = analyzeCleanup(items);
  const intentions = groupCleanup(analysis);
  const scanExpired = !!scan && scanTime - scan.id > 30 * 60 * 1000;
  const eligible = analysis.available;
  const selectedItems = eligible.filter((i) => selected.has(i.id));
  const selectedBytes = selectedItems.reduce((n, i) => n + i.bytes, 0);
  const rootBytes = scan?.roots.reduce((n, i) => n + i.bytes, 0) ?? 0;
  const rootsPartial =
    scan?.roots.some((i) => !i.complete || i.issues > 0) ?? false;
  const used = disk?.used ?? 0;
  const percentage =
    disk && used + disk.available > 0
      ? Math.ceil((used / (used + disk.available)) * 100)
      : 0;
  const shown = (cleanupFilter !== "all" ? analysis[cleanupFilter] : cleanupIntent === "all" ? items : intentions[cleanupIntent])
    .filter((i) => category === "全部" || category === i.category)
    .sort((a, b) => b.bytes - a.bytes);
  const visibleEligible = shown.filter((item) => eligible.includes(item));
  const hiddenSelected =
    selectedItems.length -
    visibleEligible.filter((item) => selected.has(item.id)).length;
  function showCleanupFilter(filter: CleanupFilter) {
    setCleanupFilter(filter);
    setCleanupIntent("all");
    setCategory("全部");
    requestAnimationFrame(() =>
      inventoryRef.current?.scrollIntoView({ block: "start" }),
    );
  }

  function showCleanupIntent(intent: CleanupIntent) {
    setCleanupIntent(intent); setCleanupFilter("all"); setCategory("全部");
  }
  useEffect(() => {
    if (!scan || view !== "overview") return;
    setScanTime(Date.now());
    const timer = window.setInterval(() => setScanTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [scan?.id, view]);

  useEffect(() => {
    if (!desktop) return;
    void api
      .disk()
      .then(setDisk)
      .catch((e) => setError(errorMessage(e)));
    void readCleanupHistory();
    let disposed = false;
    const stops: (() => void)[] = [];
    for (const event of [
      "scan-progress",
      "clean-progress",
      "project-progress",
    ]) {
      void listen<Progress>(event, (e) => setProgress(e.payload))
        .then((stop) => (disposed ? stop() : stops.push(stop)))
        .catch((e) => setError(errorMessage(e)));
    }
    void listen<Progress>("browse-progress", (e) =>
      setBrowseProgress(e.payload),
    )
      .then((stop) => (disposed ? stop() : stops.push(stop)))
      .catch((e) => setError(errorMessage(e)));
    return () => {
      disposed = true;
      stops.forEach((stop) => stop());
    };
  }, []);
  useEffect(() => {
    if (plan && !modalRef.current?.open) modalRef.current?.showModal();
    if (!plan && modalRef.current?.open) modalRef.current.close();
  }, [plan]);
  useEffect(() => {
    if (browse && !browserRef.current?.open) browserRef.current?.showModal();
    if (!browse && browserRef.current?.open) browserRef.current.close();
  }, [browse]);
  useEffect(() => {
    const close = (event: BeforeUnloadEvent) => {
      if (status === "clean" || status === "uninstall") {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", close);
    return () => window.removeEventListener("beforeunload", close);
  }, [status]);

  async function inspectResidue(bundleId: string | null, appPath?: string) {
    if (!desktop || busy || browsing) return;
    setStatus("residue"); setError(""); setResidueReport(null);
    try { setResidueReport(await api.inspectResidue(bundleId, appPath)); }
    catch (e) { setError(errorMessage(e)); }
    finally { setStatus("idle"); }
  }
  async function inspectAppUsage(path: string, bundleId: string) {
    if (!desktop || busy || browsing) throw new Error("已有任务正在执行");
    setStatus("usage");
    try { return await api.appUsage(path, bundleId); }
    finally { setStatus("idle"); }
  }
  async function prepareUninstall(path: string, bundleId: string) {
    if (!desktop || busy || browsing) throw new Error("已有任务正在执行");
    setStatus("uninstall");
    try { return await api.prepareUninstall(path, bundleId); }
    finally { setStatus("idle"); }
  }
  async function executeUninstall(token: number) {
    if (!desktop || busy || browsing) throw new Error("已有任务正在执行");
    setStatus("uninstall");
    try {
      const outcome = await api.executeUninstall(token);
      setResidueReport(null);
      setNotice(`${outcome.name} 已移到废纸篓，关联数据已保留。`);
      return outcome;
    } finally { setStatus("idle"); }
  }
  async function analyzeDeveloperTools(ids: string[], selectedId?: string) {
    if (!desktop || busy || browsing) throw new Error("已有任务正在执行");
    setStatus("developer");
    try { return await api.developerTools(ids, selectedId); }
    finally { setStatus("idle"); }
  }
  async function previewHomebrew() {
    if (!desktop || busy || browsing) throw new Error("已有任务正在执行");
    setStatus("developer-preview");
    try { return await api.previewHomebrew(); }
    finally { setStatus("idle"); }
  }
  async function chooseAnalysisFolder() {
    if (!desktop || busy || browsing) return;
    setStatus("choose"); setError(""); setFolderAck(false);
    try { const folder = await api.chooseAnalysisDirectory(); if (folder) setAnalysisFolder(folder); }
    catch (e) { setError(errorMessage(e)); }
    finally { setStatus("idle"); }
  }
  function startScan(origin: ScanOrigin = "cleanup") {
    if (desktop && !busy && !browsing) setScanRequest({ root: null, origin });
  }
  async function runScan(extended: boolean, rootIds?: string[], origin: ScanOrigin = "unknown") {
    if (!desktop || busy) return;
    setStatus("scan");
    setNotice("");
    setError("");
    setSelected(new Set());
    setCleanupFilter("all");
    setResult(null);
    setProgress(null);
    setScan(null);
    try {
      const next = await api.scan(extended, rootIds, origin);
      setScan(next);
      const groups = groupCleanup(analyzeCleanup(next.items));
      setCleanupIntent(groups.clean.length ? "clean" : groups.view.length ? "view" : groups.keep.length ? "keep" : "empty");
      setScanTime(Date.now());
      setDisk(next.disk);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setStatus("idle");
      setProgress(null);
    }
  }
  async function scanProjects(root: string) {
    if (!desktop || busy || browsing) return;
    setStatus("projects");
    setError("");
    setProgress(null);
    setProjectReport(null);
    try {
      setProjectReport(await api.projects(root));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setStatus("idle");
      setProgress(null);
    }
  }
  async function analyzeAi(roots: AiRoot[]) {
    if (!desktop || busy || browsing) return;
    setStatus("ai");
    setError("");
    setAiReports(null);
    try { setAiReports(await api.aiData(roots)); }
    catch (e) { setError(errorMessage(e)); }
    finally { setStatus("idle"); }
  }
  function prepare() {
    void prepareItems(selectedItems.map((i) => i.id));
  }
  async function prepareItems(ids: string[]) {
    if (!scan || ids.length === 0 || busy || browsing) return;
    if (Date.now() - scan.id > 30 * 60 * 1000) { setScanTime(Date.now()); setNotice("检查结果已过期，请重新检查后预览。"); return; }
    if (ids.some((id) => !eligible.some((item) => item.id === id))) return;
    setSelected(new Set(ids));
    setStatus("prepare");
    setError("");
    setAck(false);
    try {
      setPlan(await api.prepare(scan.id, ids));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setStatus("idle");
    }
  }
  async function protectUv(protectedCache: boolean) {
    if (busy || browsing) return;
    setStatus("protect");
    setError("");
    setNotice("");
    try {
      await api.protectUv(protectedCache);
      setScan(null);
      setSelected(new Set());
      setPlan(null);
      setNotice(
        `${protectedCache ? "已保护" : "已解除保护"} uv 默认缓存目录。设置已保存，请重新扫描查看当前状态。`,
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setStatus("idle");
    }
  }
  async function clean() {
    if (!plan || !ack || busy) return;
    setStatus("clean");
    setError("");
    setProgress(null);
    try {
      const outcome = await api.clean(plan.token);
      setResult(outcome);
      setScan(null);
      setSelected(new Set());
      setPlan(null);
      setHistory((current) => [outcome, ...current].slice(0, 100));
      try {
        setDisk(await api.disk());
      } catch (e) {
        setError(errorMessage(e));
      }
    } catch (e) {
      setPlan(null);
      setError(errorMessage(e));
    } finally {
      setStatus("idle");
      setProgress(null);
    }
  }
  async function openBrowser(item: Item, relative = "", offset = 0) {
    const request = ++browseRequest.current;
    setBrowsing(true);
    setBrowseProgress(null);
    setError("");
    if (offset === 0)
      setBrowse({
        item,
        relative,
        children: [],
        nextOffset: null,
        total: 0,
        measuredAt: 0,
        complete: true,
        issues: 0,
      });
    try {
      const listing = await api.children(item.id, relative, offset);
      if (request !== browseRequest.current) return;
      setBrowse((previous) => ({
        ...listing,
        item,
        relative,
        children:
          offset > 0 &&
          previous?.item.id === item.id &&
          previous.relative === relative
            ? [...previous.children, ...listing.items]
            : listing.items,
        nextOffset: listing.nextOffset,
        total: listing.total,
        measuredAt: listing.measuredAt,
        complete: listing.complete,
        issues: listing.issues,
      }));
    } catch (e) {
      if (request === browseRequest.current) {
        setBrowse(null);
        setError(errorMessage(e));
      }
    } finally {
      if (request === browseRequest.current) {
        setBrowsing(false);
        setBrowseProgress(null);
      }
    }
  }
  function closeBrowser() {
    browseRequest.current++;
    setBrowse(null);
    setBrowsing(false);
    setBrowseProgress(null);
    if (browsing) void api.cancel().catch((e) => setError(errorMessage(e)));
  }
  function showPreview() {
    setPreview(true);
    setDisk({
      total: 460 * 1024 ** 3,
      available: 73 * 1024 ** 3,
      used: 354 * 1024 ** 3,
      shared: 33 * 1024 ** 3,
    });
    setScan({
      id: 0,
      disk: {
        total: 460 * 1024 ** 3,
        available: 73 * 1024 ** 3,
        used: 354 * 1024 ** 3,
        shared: 33 * 1024 ** 3,
      },
      items: previewItems,
      roots: [
        {
          ...previewItems[2],
          id: "root-home",
          name: "用户主目录",
          path: "/Users/example",
          bytes: 210 * 1024 ** 3,
          command: null,
          blocked: "仅分析",
        },
        {
          ...previewItems[3],
          id: "root-opt",
          name: "开发工具与数据库",
          path: "/opt",
          bytes: 48 * 1024 ** 3,
        },
      ],
      durationMs: 12400,
      cancelled: false,
    });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="window-sidebar-title" data-tauri-drag-region>留白</div>
        <nav aria-label="主导航">
          <button className={view === "overview" ? "nav active" : "nav"} aria-current={view === "overview" ? "page" : undefined} onClick={() => setView("overview")}><Sparkles size={18} />清理</button>
          <button className={isSpace ? "nav active" : "nav"} aria-current={isSpace ? "page" : undefined} onClick={() => setView("space")}><HardDrive size={18} />空间</button>
          <button className={view === "residue" ? "nav active" : "nav"} aria-current={view === "residue" ? "page" : undefined} onClick={() => setView("residue")}><Package size={18} />应用</button>
        </nav>
        <button className={`nav history-entry${view === "history" ? " active" : ""}`} aria-current={view === "history" ? "page" : undefined} onClick={() => setView("history")}><History size={17} />清理记录<span className="nav-count">{history.length}</span></button>
        <div className="sidebar-note"><ShieldCheck size={14} /><span>数据留在本机</span></div>
        <div className="sidebar-footer">
          <span>版本 {appVersion}</span>
          <span className="edition">macOS</span>
        </div>
      </aside>
      <main className={`${view === "overview" && selectedItems.length > 0 ? "has-actionbar" : ""} ${view === "residue" ? "application-window" : ""}`}>
        {view !== "residue" && <header className="topbar" data-tauri-drag-region>
          <h1 data-tauri-drag-region>{pageTitle}</h1>
            {view === "overview" && (
              <button
                className="button primary"
                disabled={!desktop || busy || browsing}
                onClick={() => startScan()}
              >
                {status === "scan" ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <ScanLine size={17} />
                )}
                {status === "scan"
                  ? "正在检查"
                  : scan || result
                    ? "重新检查"
                    : "开始检查"}
              </button>
            )}
        </header>}
        <div className="page-content">
          {!desktop && (
            <div className="preview-banner">
              <CircleHelp size={17} />
              <span>
                {preview
                  ? "当前展示示例数据，无法执行清理。真实扫描请打开桌面应用。"
                  : "这是浏览器界面，扫描与清理仅在桌面应用中可用。"}
              </span>
              {!preview && (
                <button onClick={showPreview}>
                  查看示例 <ArrowRight size={14} />
                </button>
              )}
            </div>
          )}
          {view === "overview" && scan && (
            <ol className="workflow-steps" aria-label="操作步骤">
              {["扫描空间", "查看结果", "确认清理"].map((label, index) => {
                const current =
                  result || plan || status === "prepare" || status === "clean"
                    ? 2
                    : scan
                      ? 1
                      : 0;
                return (
                  <li
                    key={label}
                    aria-current={index === current ? "step" : undefined}
                    className={
                      index === current
                        ? "current"
                        : index < current
                          ? "complete"
                          : ""
                    }
                  >
                    <span>{index + 1}</span>
                    {label}
                    {index < 2 && <ChevronRight size={14} />}
                  </li>
                );
              })}
            </ol>
          )}
          {notice && (
            <p className="protection-notice" role="status">
              {notice}
            </p>
          )}
          {error && (
            <div className="alert error" role="alert">
              <TriangleAlert size={18} />
              <span>{error}</span>
              <button aria-label="关闭错误提示" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {status === "scan" && (
            <div className="scan-progress" role="status" aria-live="polite">
              <div>
                <LoaderCircle size={18} className="spin" />
                <strong>
                  {progress ? `正在分析 ${progress.name}` : "准备扫描…"}
                </strong>
                <span>
                  {progress && progress.total > 0
                    ? `${progress.done + 1} / ${progress.total} · ${progress.files.toLocaleString()} 个条目`
                    : "正在发现缓存路径与主要目录"}
                </span>
                <ScanWait phase={progress?.name ?? "准备扫描"} />
                <button
                  onClick={() =>
                    void api.cancel().catch((e) => setError(errorMessage(e)))
                  }
                >
                  停止扫描
                </button>
              </div>
              <progress
                max={progress?.total || 23}
                value={progress?.done ?? 0}
              />
            </div>
          )}
          {backgroundTask && <div className="background-task" role="status" aria-label="进行中的任务"><LoaderCircle size={17} className="spin" /><div><strong>{backgroundTask.label}</strong><span>任务仍在进行，切换页面不会重新开始。</span></div><button className="button secondary" onClick={() => setView(backgroundTask.target)}>返回{backgroundTask.name}</button>{backgroundTask.cancel && <button className="text-button" onClick={() => void api.cancel().catch(e => setError(errorMessage(e)))}>停止分析</button>}</div>}
          {isSpace && <nav className="space-categories" aria-label="空间分类">{([["space", "文件夹"], ["developer", "开发工具"], ["projects", "项目空间"], ["ai", "AI 数据"]] as const).map(([id, name]) => <button key={id} aria-current={view === id ? "page" : undefined} onClick={() => setView(id)}>{name}</button>)}</nav>}
          <div hidden={view !== "developer"}><DeveloperTools desktop={desktop} busy={busy || browsing} folder={analysisFolder} onChoose={() => void chooseAnalysisFolder()} onAnalyze={analyzeDeveloperTools} onPreview={previewHomebrew} onCancel={() => void api.cancel().catch(e => setError(errorMessage(e)))} /></div>
          <div hidden={view !== "projects"}>
            <ProjectLedger
              desktop={desktop}
              busy={busy || browsing}
              scanning={status === "projects"}
              progress={progress}
              report={projectReport}
              onScan={(root) => setScanRequest({ root })}
              onCancel={() =>
                void api.cancel().catch((e) => setError(errorMessage(e)))
              }
              onCaches={() => setView("overview")}
            />
          </div>
          <div hidden={view !== "ai"}>
            <AiData desktop={desktop} busy={busy || browsing} scanning={status === "ai"}
              reports={aiReports} baselines={aiBaselines} onBaseline={(report) => setAiBaselines((previous) => [...previous.filter((b) => b.tool !== report.tool || b.root !== report.root), report])} onAnalyze={(roots) => void analyzeAi(roots)}
              onCancel={() => void api.cancel().catch((e) => setError(errorMessage(e)))} />
          </div>
          <div className="application-host" hidden={view !== "residue"}><AppResidue onUsage={inspectAppUsage} active={view === "residue"} onPrepareUninstall={prepareUninstall} onExecuteUninstall={executeUninstall} desktop={desktop} busy={busy || browsing} scanning={status === "residue"} report={residueReport} onInspect={(bundleId, appPath) => void inspectResidue(bundleId, appPath)} onCancel={() => void api.cancel().catch(e => setError(errorMessage(e)))} /></div>
          <div hidden={view !== "history"}><CleanupHistory records={history} loading={historyLoading} error={historyError} disabled={!desktop || busy || browsing} onRefresh={() => void readCleanupHistory()} onReview={() => setView("overview")} onRescan={() => { setView("overview"); startScan("history"); }} /></div>
          {view === "overview" ? (
            <>
              {scan && (
                <CleanupAnalysis
                  key={scan.id}
                  scan={scan}
                  disabled={!desktop || busy || browsing}
                  expired={scanExpired}
                  activeIntent={cleanupIntent}
                  onIntent={showCleanupIntent}
                />
              )}
              <details className={`cleanup-capacity-detail${scan ? "" : " initial"}`} open={scan ? undefined : true}><summary>磁盘剩余 {disk ? bytes(disk.available) : "待检查"} · 查看容量</summary>
              <section className="stats-grid cleanup-capacity" aria-label="磁盘容量">
                <div className="disk-card">
                  <div className="card-kicker">
                    <HardDrive size={17} />
                    当前数据卷<span>APFS</span>
                  </div>
                  <div className="capacity">
                    <strong>
                      {disk ? bytes(disk.available).split(" ")[0] : "—"}
                    </strong>
                    <span>
                      {disk ? bytes(disk.available).split(" ")[1] : "GiB"} 可用
                    </span>
                    <span className="capacity-percent">
                      {disk ? `数据卷占用率 ${percentage}%` : "等待读取"}
                    </span>
                  </div>
                  <div className="disk-bar">
                    <i
                      style={{
                        width: `${disk ? (used / disk.total) * 100 : 0}%`,
                      }}
                    />
                    <i
                      className="shared-bar"
                      style={{
                        width: `${disk ? (disk.shared / disk.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <div className="disk-caption">
                    <span>已用 {disk ? bytes(used) : "—"}</span>
                    <span>共享／保留 {disk ? bytes(disk.shared) : "—"}</span>
                    <span>总计 {disk ? bytes(disk.total) : "—"}</span>
                  </div>
                </div>
              </section></details>
              {scan && (
                <p className="scan-scope-summary" role="status">
                  <Folder size={14} />
                  本次范围：{scan.extended === false ? "常规缓存" : "扩展目录"}
                  <span>· 仅统计已读取范围{scan.extended === true && ` · ${scan.items.length} 个固定／发现项目，${scan.roots.length} 个主要目录`}</span>
                </p>
              )}
              {scan?.extended === true && <p className="scan-root-summary">主要目录：{scan.roots.length ? scan.roots.map((r) => r.name).join("、") : "未选择；仅分析扩展固定／发现项目"}。未选择的位置不代表零占用，范围之间可能重叠。</p>}
              {scan?.activity && <p className="scan-origin-note">本次请求入口：{scanOriginLabels[scan.activity.origin]} · 后端版本 {scan.activity.appVersion} · {new Date(scan.activity.receivedAt).toLocaleString()}</p>}
              {scan?.activityWarning && <p className="warning-text" role="alert">{scan.activityWarning}</p>}
              <ScanActivity disabled={!desktop || busy || browsing} />
              {scan && <ScanTiming scan={scan} />}
              {scan && <ScanCoverage key={`coverage-${scan.id}`} scan={scan} />}



              {scan && scan.roots.length > 0 && (
                <section className="root-inventory" aria-label="主要目录总览">
                  <details className="directory-overview">
                    <summary>
                      其他目录占用 <span>{scan.roots.length} 个位置</span>
                      <small>只读查看，不参与清理</small>
                    </summary>
                    <div className="root-grid">
                      {[...scan.roots]
                        .sort((a, b) => b.bytes - a.bytes)
                        .map((root) => (
                          <button
                            key={root.id}
                            disabled={
                              !desktop || busy || browsing || !root.bytes
                            }
                            onClick={() => void openBrowser(root)}
                            title={`${root.path} · ${root.issues} 处读取失败`}
                          >
                            <Folder size={18} />
                            <span>
                              <strong>{root.name}</strong>
                              <small>{shortPath(root.path)}</small>
                              {(!root.complete || root.issues > 0) && (
                                <small className="warning-text">
                                  统计不完整
                                  {root.issues > 0
                                    ? ` · ${root.issues} 处读取失败`
                                    : "，显示下限"}
                                </small>
                              )}
                            </span>
                            <b>
                              {!root.complete || root.issues > 0 ? "≥ " : ""}
                              {bytes(root.bytes)}
                            </b>
                            <ChevronRight size={15} />
                          </button>
                        ))}
                    </div>
                    <p className="scope-note">
                      {scan.cancelled
                        ? "扫描已停止，仅显示已完成与部分读取结果。"
                        : "当前分析主要目录中的可访问范围，主动跳过已知其他应用私有数据目录；不代表完整磁盘统计。"}{" "}
                      已列目录分配块合计 {bytes(rootBytes)}
                      {rootsPartial ? "（部分目录读取不完整）" : ""}
                      。总览与下方规则清单有包含关系，不能相加；未授权目录、其他用户、其他卷和
                      APFS 共享块可能无法归属。
                    </p>
                  </details>
                </section>
              )}
              {result && (
                <CleanupResult
                  record={result}
                  disabled={!desktop || busy || browsing}
                  onRescan={() => startScan("result")}
                  onReview={() => {
                    showCleanupFilter("all");
                    requestAnimationFrame(() =>
                      inventoryRef.current?.focus({ preventScroll: true }),
                    );
                  }}
                />
              )}
              {!scan && <button className="text-button cleanup-space-link" onClick={() => setView("space")}>查看空间占用 <ArrowRight size={15} /></button>}
              {(scan || result || status === "scan") && <section
                className="inventory"
                ref={inventoryRef}
                tabIndex={-1}
                aria-label="空间清单"
              >
                {(scan || result) && <>
                <div className="section-heading">
                  <div>
                    <h2>
                      空间清单{" "}
                      <span>{items.length.toString().padStart(2, "0")}</span>
                    </h2>
                    <p>
                      {scan
                        ? `${scan.cancelled ? "扫描已停止，显示部分结果" : "最近扫描"} · ${preview ? "示例数据" : `${(scan.durationMs / 1000).toFixed(1)} 秒`}`
                        : result
                          ? "扫描结果已失效。请重新扫描确认剩余项目，再预览和确认清理。"
                          : "先扫描，再查看占用与清理影响"}
                    </p>
                  </div>
                  <span className="readonly-label">
                    <ShieldCheck size={14} />
                    扫描不会修改文件
                  </span>
                </div>
                {scan && <details className="cleanup-more-filters"><summary>更多筛选{cleanupFilter !== "all" || category !== "全部" ? " · 已启用" : ""}</summary><div className="filters" role="group" aria-label="按类型筛选">
                  {categories.map((c) => (
                    <button
                      key={c}
                      onClick={() => setCategory(c)}
                      className={category === c ? "chosen" : ""}
                      aria-pressed={category === c}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                  <div
                    className="cleanup-state-filters"
                    role="group"
                    aria-label="按处理状态筛选"
                  >
                    {(Object.keys(cleanupLabels) as CleanupFilter[]).map(
                      (filter) => (
                        <button
                          key={filter}
                          aria-pressed={cleanupFilter === filter}
                          onClick={() => showCleanupFilter(filter)}
                        >
                          {cleanupLabels[filter]}{" "}
                          <span>
                            {filter === "all"
                              ? items.length
                              : analysis[filter].length}
                          </span>
                        </button>
                      ),
                    )}
                  </div>
                </details>}
                </>}
                {items.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-symbol">
                      <ScanLine size={31} strokeWidth={1.3} />
                    </div>
                    <h3>
                      {status === "scan"
                        ? "正在扫描…"
                        : result
                          ? "重新确认剩余空间"
                          : "还没有扫描结果"}
                    </h3>
                    <p>
                      {status === "scan"
                        ? "可以随时停止，不会自动清理文件。"
                        : "点击右上角“开始检查”，选择范围后查看结果。"}
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="selection-scope-note">
                      全选仅作用于当前筛选中的可清理项，其他已有选择会保留。
                    </p>
                    <div className="list-header">
                      <label>
                        <input
                          aria-label="选择全部可清理项"
                          type="checkbox"
                          disabled={busy || !desktop || !visibleEligible.length}
                          checked={
                            visibleEligible.length > 0 &&
                            visibleEligible.every((item) =>
                              selected.has(item.id),
                            )
                          }
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setSelected((current) => {
                              const next = new Set(current);
                              for (const item of visibleEligible) {
                                if (checked) next.add(item.id);
                                else next.delete(item.id);
                              }
                              return next;
                            });
                          }}
                        />
                        名称 / 用途
                      </label>
                      <span>占用空间</span>
                      <span>处理方式</span>
                    </div>
                    <div className="item-list">
                      {shown.map((item) => {
                        const Icon = icons[item.category] ?? FileBox;
                        const canSelect = eligible.some(
                          (candidate) => candidate.id === item.id,
                        );
                        const itemState = canSelect
                          ? "available"
                          : analysis.blocked.includes(item)
                            ? "blocked"
                            : analysis.empty.includes(item)
                              ? "empty"
                              : "readonly";
                        const advice = cleanupAdvice(item, itemState);
                        return (
                          <div
                            className={`item-wrap ${selected.has(item.id) ? "is-selected" : ""}`}
                            key={item.id}
                          >
                            <div className="item-row">
                              <div className="item-main">
                                <input
                                  type="checkbox"
                                  aria-label={`选择${item.name}`}
                                  disabled={!canSelect || busy || !desktop}
                                  checked={selected.has(item.id)}
                                  onChange={(e) => {
                                    const next = new Set(selected);
                                    if (e.target.checked) next.add(item.id);
                                    else next.delete(item.id);
                                    setSelected(next);
                                  }}
                                />
                                <span
                                  className={`item-icon ${item.category === "个人文件" ? "sand" : item.category === "模型与数据" ? "slate" : ""}`}
                                >
                                  <Icon size={19} strokeWidth={1.5} />
                                </span>
                                <button
                                  className="item-title"
                                  aria-expanded={expanded === item.id}
                                  onClick={() =>
                                    setExpanded(
                                      expanded === item.id ? null : item.id,
                                    )
                                  }
                                >
                                  <strong>{item.name}</strong>
                                  {itemState === "blocked" && <small className="item-block-reason">{item.blocked || (!item.complete || item.issues ? "检查不完整，暂时保留" : "工具或占用待确认，暂时保留")}</small>}
                                  <span title={item.path}>
                                    {canSelect ? "清理后可能需要重新下载或构建" : intentions.view.includes(item) ? "只读查看，不提供清理" : intentions.empty.includes(item) ? "本次未测得正占用" : !item.complete || item.issues ? "检查不完整，暂时保留" : item.impact}
                                  </span>
                                </button>
                              </div>
                              <strong className="item-size">
                                {Number.isFinite(item.bytes) && item.bytes > 0 && (!item.complete || item.issues > 0) ? "≥ " : ""}
                                {!Number.isFinite(item.bytes) || item.bytes < 0 || (!item.complete && item.bytes === 0) ? "未统计" : bytes(item.bytes)}
                              </strong>
                              <div className="item-action">
                                {!canSelect && <span
                                  className={`badge ${canSelect ? "green" : itemState === "blocked" ? "amber" : ""}`}
                                >
                                  {canSelect ? "可以清理" : intentions.view.includes(item) ? "可以查看" : itemState === "empty" || intentions.empty.includes(item) ? "未发现占用" : item.evidence?.protected ? "已保护" : itemState === "blocked" ? "暂不可处理" : "需要保留"}
                                </span>}
                                {canSelect && <button className="button secondary item-preview" aria-label={`预览${item.name}清理`} disabled={!desktop || busy || browsing || scanExpired} onClick={() => void prepareItems([item.id])}>预览清理</button>}
                                <button
                                  className="icon-button"
                                  aria-label={`查看${item.name}详情`}
                                  aria-expanded={expanded === item.id}
                                  onClick={() =>
                                    setExpanded(
                                      expanded === item.id ? null : item.id,
                                    )
                                  }
                                >
                                  <ChevronRight
                                    size={17}
                                    className={
                                      expanded === item.id ? "rotated" : ""
                                    }
                                  />
                                </button>
                              </div>
                            </div>
                            {expanded === item.id && (
                              <div className="item-details"><code className="cleanup-item-path">{item.path}</code>
                                {!item.evidence && <p>{item.impact}</p>}
                                {item.evidence && (
                                  <CleanupEvidence evidence={item.evidence} />
                                )}
                                {item.id === "uv" && item.evidence && (
                                  <div className="cache-protection">
                                    <span>
                                      保护 uv
                                      默认缓存整个目录后，仅分析，不执行清理。
                                    </span>
                                    <button
                                      className="text-button"
                                      disabled={!desktop || busy || browsing}
                                      onClick={() =>
                                        void protectUv(
                                          !item.evidence!.protected,
                                        )
                                      }
                                    >
                                      {item.evidence.protected
                                        ? "解除默认目录保护"
                                        : "保护默认缓存目录"}
                                    </button>
                                  </div>
                                )}
                                {item.blocked &&
                                  item.blocked !== "此项仅分析" && (
                                    <p className="warning-text">
                                      <TriangleAlert size={14} />
                                      {item.blocked}
                                    </p>
                                  )}
                                {(!item.evidence ||
                                  itemState !== "available") && (
                                  <div className="handling-advice">
                                    <strong>{advice.title}</strong>
                                    <p>{advice.message}</p>
                                    {item.id === "ollama" && (
                                      <button
                                        className="text-button"
                                        disabled={busy || browsing}
                                        onClick={() => setView("projects")}
                                      >
                                        查看项目空间 <ArrowRight size={13} />
                                      </button>
                                    )}
                                  </div>
                                )}
                                <div className="detail-meta">
                                  <span>
                                    {item.files.toLocaleString()} 个条目
                                    {item.issues > 0
                                      ? ` · ${item.issues} 处读取失败`
                                      : ""}
                                  </span>
                                  <button
                                    disabled={
                                      !desktop ||
                                      busy ||
                                      browsing ||
                                      item.bytes === 0
                                    }
                                    onClick={() => void openBrowser(item)}
                                  >
                                    浏览目录 <ArrowUpRight size={13} />
                                  </button>
                                </div>
                                {item.command && <code>{item.command}</code>}
                                {item.details.length > 0 && (
                                  <div className="model-tags">
                                    {item.details.map((m) => (
                                      <span key={m}>{m}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {shown.length === 0 && (
                      <div className="filtered-empty">
                        <p>当前筛选没有匹配项目。</p>
                        <button
                          className="button secondary"
                          onClick={() => {
                            setCategory("全部");
                            showCleanupIntent("all");
                          }}
                        >
                          清除筛选
                        </button>
                      </div>
                    )}
                  </>
                )}
                <div className="inventory-foot">
                  <CircleHelp size={14} />
                  <span>
                    按实际分配块估算，同层硬链接去重；不跟随符号链接或跨文件系统。子目录显示子树总量，统计不完整时显示下限。
                  </span>
                </div>
              </section>}
              <div className="principles">
                <div>
                  <LockKeyhole size={16} />
                  <span>不提权，不自动删除</span>
                </div>
                <div>
                  <Terminal size={16} />
                  <span>优先使用官方清理命令</span>
                </div>
                <div>
                  <Check size={16} />
                  <span>执行后核对可用空间</span>
                </div>
              </div>
            </>
          ) : view === "space" ? (
            <><SpaceHome desktop={desktop} busy={busy || browsing} choosing={status === "choose"} folder={analysisFolder} acknowledged={folderAck} onAcknowledge={setFolderAck} onChoose={() => void chooseAnalysisFolder()} onAnalyze={() => void openBrowser(analysisFolder!)} roots={scan?.roots ?? []} onBrowse={item => void openBrowser(item)} />
            {(projectReport || aiReports?.length) && <ObservationOverview project={projectReport} ai={aiReports} onNavigate={setView} />}</>
          ) : view === "projects" ? (
            null
          ) : view === "developer" ? null : view === "residue" ? (
            null
          ) : view === "ai" ? (
            null
          ) : (
            null
          )}
        </div>
        {view === "overview" && selectedItems.length > 0 && (
          <footer className="actionbar">
            <div>
              <span className="selection-count">
                {selectedItems.length.toString().padStart(2, "0")}
              </span>
              <div>
                <strong>已选择 {selectedItems.length} 项</strong>
                <span>
                  {hiddenSelected > 0
                    ? `其中 ${hiddenSelected} 项不在当前筛选中，预览将完整列出`
                    : selectedItems.length
                      ? "确认影响后，再执行清理"
                      : "由你选择需要清理的内容"}
                </span>
              </div>
            </div>
            <div>
              <button
                className="text-button"
                disabled={busy || browsing}
                onClick={() => setSelected(new Set())}
              >
                取消选择
              </button>
              <span className="selected-size">
                候选占用 <b>{bytes(selectedBytes)}</b>
              </span>
              <button
                className="button primary"
                disabled={
                  !desktop || busy || selectedItems.length === 0 || browsing || scanExpired
                }
                onClick={prepare}
              >
                {status === "prepare" ? (
                  <LoaderCircle size={16} className="spin" />
                ) : null}
                预览清理计划 <ArrowRight size={16} />
              </button>
            </div>
          </footer>
        )}
      </main>
      <dialog
        ref={modalRef}
        aria-labelledby="plan-title"
        onCancel={(e) => {
          if (status === "clean") e.preventDefault();
          else setPlan(null);
        }}
      >
        <div className="modal-body">
          <div className="modal-heading">
            <span className="modal-icon">
              <ShieldCheck size={23} />
            </span>
            <button
              className="icon-button"
              disabled={status === "clean"}
              aria-label="取消清理"
              onClick={() => setPlan(null)}
            >
              <X size={19} />
            </button>
          </div>
          <div className="eyebrow">REVIEW BEFORE CLEANING</div>
          <h2 id="plan-title">确认这次清理</h2>
          <p>
            以下操作永久移除缓存。已有项目代码和独立环境会保留，重新安装依赖可能需要联网。
          </p>
          <div className="plan-items">
            {plan?.items.map((i) => (
              <div key={i.id}>
                <strong>
                  {i.name}
                  <span>{bytes(i.bytes)}</span>
                </strong>
                {!i.evidence && <p>{i.impact}</p>}
                {i.evidence && <CleanupEvidence evidence={i.evidence} />}
                <code>{i.command}</code>
              </div>
            ))}
          </div>
          <div className="plan-note">
            <TriangleAlert size={16} />
            <span>
              预览 60
              秒内有效。依赖检测仅覆盖本机可见进程；其他进程变化、共享文件和快照会影响结果。
            </span>
          </div>
          <label className="ack">
            <input
              type="checkbox"
              checked={ack}
              disabled={status === "clean"}
              onChange={(e) => setAck(e.target.checked)}
            />
            我已了解影响，确认清理以上缓存
          </label>
          {status === "clean" && (
            <p className="clean-status" role="status">
              <LoaderCircle size={15} className="spin" />
              正在清理 {progress?.name ?? "所选项目"}，请保持窗口打开。
            </p>
          )}
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={status === "clean"}
              onClick={() => setPlan(null)}
            >
              取消
            </button>
            <button
              className="button primary"
              disabled={!ack || busy}
              onClick={clean}
            >
              {status === "clean" ? "正在清理…" : "确认清理"}
            </button>
          </div>
        </div>
      </dialog>
      <dialog
        ref={browserRef}
        className="directory-dialog"
        aria-labelledby="browse-title"
        onCancel={closeBrowser}
      >
        <div className="modal-body">
          <div className="modal-heading">
            <Folder size={24} />
            <button
              className="icon-button"
              aria-label="关闭目录浏览"
              onClick={closeBrowser}
            >
              <X size={19} />
            </button>
          </div>
          <h2 id="browse-title">{browse?.item.name}</h2>
          <p className="browse-path">
            {browse && shortPath(browse.item.path)}
            {browse?.relative ? `/${browse.relative}` : ""}
          </p>
          <p>
            按子目录子树占用排序，可继续展开；每页 200 项，此处不提供删除。
            {browse?.measuredAt ? ` 统计时间：${date(browse.measuredAt)}` : ""}
          </p>
          {browsing && (
            <div className="browse-progress" role="status">
              <LoaderCircle className="spin" size={16} />
              <span>
                正在统计子树
                {browseProgress
                  ? ` · ${browseProgress.files.toLocaleString()} 个条目`
                  : "…"}
              </span>
              <button
                onClick={() =>
                  void api.cancel().catch((e) => setError(errorMessage(e)))
                }
              >
                停止统计
              </button>
            </div>
          )}
          {browse && (!browse.complete || browse.issues > 0) && (
            <p className="warning-text">
              统计不完整
              {browse.issues > 0 ? `（${browse.issues} 处读取失败）` : ""}
              ，占用为下限；重新打开可重试。
            </p>
          )}
          {browse && <DirectoryInsights key={browse.item.id}
            data={browse} entries={browse.children} relative={browse.relative} busy={browsing}
            onOpen={relative => void openBrowser(browse.item, relative)}
            onReveal={relative => api.revealFile(browse.item.id, relative, browse.measuredAt)}>
          {browse && (
            <div className="browse-pagination">
              <span>
                已显示 {browse.children.length} / {browse.total} 项
              </span>
              {browse.nextOffset !== null && (
                <button
                  className="button secondary"
                  disabled={browsing}
                  onClick={() =>
                    void openBrowser(
                      browse.item,
                      browse.relative,
                      browse.nextOffset!,
                    )
                  }
                >
                  继续加载
                </button>
              )}
            </div>
          )}
          </DirectoryInsights>}
        </div>
      </dialog>
      {scanRequest && (
        <ScanAccess
          root={scanRequest.root}
          onCancel={() => setScanRequest(null)}
          onStart={(extended, rootIds) => {
            const { root, origin } = scanRequest;
            setScanRequest(null);
            if (root === null) void runScan(extended, rootIds, origin);
            else void scanProjects(root);
          }}
        />
      )}
    </div>
  );
}
