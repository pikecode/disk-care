import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  Clock3,
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
import CleanupOutcome, { SpaceChange } from "./CleanupOutcome";
import CleanupEvidence from "./CleanupEvidence";
import ScanCoverage from "./ScanCoverage";
import ScanAccess from "./ScanAccess";
import ProjectLedger from "./ProjectLedger";
import CleanupAnalysis from "./CleanupAnalysis";
import {
  analyzeCleanup,
  cleanupAdvice,
  cleanupLabels,
} from "./cleanupEligibility";
import type { CleanupFilter } from "./cleanupEligibility";
import type {
  Disk,
  Item,
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
  const [view, setView] = useState<"overview" | "projects" | "history">(
    "overview",
  );
  const [scanRequest, setScanRequest] = useState<{
    root: string | null;
  } | null>(null);
  const [disk, setDisk] = useState<Disk | null>(null);
  const [scan, setScan] = useState<Scan | null>(null);
  const [status, setStatus] = useState<
    "idle" | "scan" | "projects" | "prepare" | "clean" | "protect"
  >("idle");
  const [projectReport, setProjectReport] = useState<ProjectReport | null>(
    null,
  );
  const [progress, setProgress] = useState<Progress | null>(null);
  const [category, setCategory] = useState("全部");
  const [cleanupFilter, setCleanupFilter] = useState<CleanupFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [plan, setPlan] = useState<Plan | null>(null);
  const [ack, setAck] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [history, setHistory] = useState<CleanRecord[]>([]);
  const [result, setResult] = useState<CleanRecord | null>(null);
  const [browse, setBrowse] = useState<{
    item: Item;
    relative: string;
    children: Item[];
    nextOffset: number | null;
    total: number;
    measuredAt: number;
    complete: boolean;
    issues: number;
  } | null>(null);
  const browseRequest = useRef(0);
  const [browseProgress, setBrowseProgress] = useState<Progress | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const modalRef = useRef<HTMLDialogElement>(null);
  const browserRef = useRef<HTMLDialogElement>(null);
  const inventoryRef = useRef<HTMLElement>(null);
  const busy = status !== "idle";
  const items = scan?.items ?? [];
  const analysis = analyzeCleanup(items);
  const eligible = analysis.available;
  const selectedItems = eligible.filter((i) => selected.has(i.id));
  const selectedBytes = selectedItems.reduce((n, i) => n + i.bytes, 0);
  const candidateBytes = eligible.reduce((n, i) => n + i.bytes, 0);
  const rootBytes = scan?.roots.reduce((n, i) => n + i.bytes, 0) ?? 0;
  const rootsPartial =
    scan?.roots.some((i) => !i.complete || i.issues > 0) ?? false;
  const used = disk?.used ?? 0;
  const percentage =
    disk && used + disk.available > 0
      ? Math.ceil((used / (used + disk.available)) * 100)
      : 0;
  const shown = (cleanupFilter === "all" ? items : analysis[cleanupFilter])
    .filter((i) => category === "全部" || category === i.category)
    .sort((a, b) => b.bytes - a.bytes);
  const visibleEligible = shown.filter((item) => eligible.includes(item));
  const hiddenSelected =
    selectedItems.length -
    visibleEligible.filter((item) => selected.has(item.id)).length;
  function showCleanupFilter(filter: CleanupFilter) {
    setCleanupFilter(filter);
    setCategory("全部");
    requestAnimationFrame(() =>
      inventoryRef.current?.scrollIntoView({ block: "start" }),
    );
  }

  useEffect(() => {
    if (!desktop) return;
    void api
      .disk()
      .then(setDisk)
      .catch((e) => setError(errorMessage(e)));
    void api
      .history()
      .then(setHistory)
      .catch((e) => setError(errorMessage(e)));
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
      if (status === "clean") {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", close);
    return () => window.removeEventListener("beforeunload", close);
  }, [status]);

  function startScan() {
    if (desktop && !busy && !browsing) setScanRequest({ root: null });
  }
  async function runScan(extended: boolean) {
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
      const next = await api.scan(extended);
      setScan(next);
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
  function prepare() {
    void prepareItems(selectedItems.map((i) => i.id));
  }
  async function prepareItems(ids: string[]) {
    if (!scan || ids.length === 0 || busy || browsing) return;
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
        <div className="brand">
          <span className="brand-mark">
            <Layers3 size={24} strokeWidth={1.5} />
          </span>
          <div>
            <strong>留白</strong>
            <span>DISK CARE</span>
          </div>
        </div>
        <div className="workspace-label">本机工作空间</div>
        <nav aria-label="主导航">
          <button
            className={view === "overview" ? "nav active" : "nav"}
            onClick={() => setView("overview")}
          >
            <HardDrive size={18} />
            空间概览
            <ChevronRight size={14} />
          </button>
          <button
            className={view === "projects" ? "nav active" : "nav"}
            onClick={() => setView("projects")}
          >
            <Folder size={18} />
            项目账本
            <ChevronRight size={14} />
          </button>
          <button
            className={view === "history" ? "nav active" : "nav"}
            onClick={() => setView("history")}
          >
            <History size={18} />
            清理记录<span className="nav-count">{history.length}</span>
          </button>
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={21} />
          <strong>每一步，都由你决定</strong>
          <p>
            本地分析，明确影响。
            <br />
            查看计划后，再执行清理。
          </p>
          <div className="local-dot">
            <i />
            数据留在本机
          </div>
        </div>
        <div className="sidebar-footer">
          <span>macOS · 版本 0.9.2</span>
          <span className="edition">本地版</span>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            工作空间 <ChevronRight size={13} />{" "}
            {view === "overview"
              ? "空间概览"
              : view === "projects"
                ? "项目账本"
                : "清理记录"}
          </span>
          <div>
            <span className="tiny-dot" />
            {desktop ? "已连接本机" : "浏览器预览"}
          </div>
        </header>
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
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {view === "overview"
                  ? "磁盘分析"
                  : view === "projects"
                    ? "项目分析"
                    : "操作记录"}
              </div>
              <h1>
                {view === "overview"
                  ? "磁盘空间"
                  : view === "projects"
                    ? "项目空间"
                    : "清理记录"}
              </h1>
              <p>
                {view === "overview"
                  ? "先扫描查看占用，再预览需要清理的内容。"
                  : view === "projects"
                    ? "查看项目产物、模型引用与运行依赖。"
                    : "查看执行结果与磁盘可用空间变化，最多保留最近 100 次。"}
              </p>
            </div>
            {view === "overview" && (
              <button
                className="button primary"
                disabled={!desktop || busy || browsing}
                onClick={startScan}
              >
                {status === "scan" ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <ScanLine size={17} />
                )}
                {status === "scan"
                  ? "正在扫描"
                  : scan
                    ? "重新扫描"
                    : "开始扫描"}
              </button>
            )}
          </div>
          {view === "overview" && (
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
                  {progress
                    ? `${progress.done + 1} / ${progress.total} · ${progress.files.toLocaleString()} 个条目`
                    : "正在发现缓存路径与主要目录"}
                </span>
                <button
                  onClick={() =>
                    void api.cancel().catch((e) => setError(errorMessage(e)))
                  }
                >
                  停止扫描
                </button>
              </div>
              <progress
                max={progress?.total ?? 23}
                value={progress?.done ?? 0}
              />
            </div>
          )}
          {status === "projects" && view !== "projects" && (
            <div className="project-status" role="status">
              <LoaderCircle size={18} className="spin" />
              <span>项目扫描仍在进行，可返回项目账本查看进度。</span>
              <button
                className="text-button"
                onClick={() => setView("projects")}
              >
                查看项目扫描
              </button>
              <button
                className="text-button"
                onClick={() =>
                  void api.cancel().catch((e) => setError(errorMessage(e)))
                }
              >
                停止项目扫描
              </button>
            </div>
          )}
          {view === "overview" ? (
            <>
              <section className="stats-grid" aria-label="磁盘容量">
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
                <div className="metric-card">
                  <div className="card-kicker">
                    <Sparkles size={17} />
                    可清理候选
                  </div>
                  <strong>{scan ? bytes(candidateBytes) : "—"}</strong>
                  <p>
                    {scan
                      ? `${eligible.length} 项支持官方命令清理`
                      : "扫描后发现可清理内容"}
                  </p>
                  {scan ? (
                    <button
                      className="metric-shortcut"
                      disabled={busy || browsing}
                      onClick={() => showCleanupFilter("available")}
                    >
                      查看可预览项目 <ArrowRight size={15} />
                    </button>
                  ) : (
                    <span className="metric-foot">
                      扫描后查看可预览项目 <ArrowDownRight size={16} />
                    </span>
                  )}
                  {scan && (
                    <small className="metric-estimate-note">
                      观测占用，不等于实际可释放空间
                    </small>
                  )}
                </div>
              </section>
              {scan && (
                <p className="scan-scope-summary" role="status">
                  <Folder size={14} />
                  本次范围：{scan.extended === false ? "常规缓存" : "扩展目录"}
                  <span>· 仅统计已读取范围</span>
                </p>
              )}
              {scan && <ScanCoverage key={`coverage-${scan.id}`} scan={scan} />}
              {scan && (
                <CleanupAnalysis
                  key={scan.id}
                  scan={scan}
                  disabled={!desktop || busy || browsing}
                  onReview={(ids) => void prepareItems(ids)}
                  activeFilter={cleanupFilter}
                  onFilter={showCleanupFilter}
                />
              )}
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
                <section
                  className={`result-card ${result.outcomes.some((outcome) => !outcome.success) ? "result-partial" : ""}`}
                  aria-live="polite"
                >
                  {result.outcomes.every((outcome) => outcome.success) ? (
                    <CircleCheck size={24} />
                  ) : (
                    <TriangleAlert size={24} />
                  )}
                  <div>
                    <strong>
                      {result.outcomes.every((o) => o.success)
                        ? "命令均已完成，请查看核验结果"
                        : "清理已结束，包含失败或跳过项目"}
                    </strong>
                    <p>
                      <SpaceChange record={result} />
                      。这是所测数据卷在操作期间的变化，其他进程、共享文件和快照均可能影响，不能归因于本次清理。
                    </p>
                    {result.warning && (
                      <p className="warning-text">{result.warning}</p>
                    )}
                    {result.outcomes.map((o) => (
                      <CleanupOutcome key={o.name} outcome={o} />
                    ))}
                  </div>
                  <button className="text-button" onClick={startScan}>
                    重新扫描 <RefreshCw size={14} />
                  </button>
                </section>
              )}
              <section className="inventory" ref={inventoryRef}>
                <div className="section-heading">
                  <div>
                    <h2>
                      空间清单{" "}
                      <span>{items.length.toString().padStart(2, "0")}</span>
                    </h2>
                    <p>
                      {scan
                        ? `${scan.cancelled ? "扫描已停止，显示部分结果" : "最近扫描"} · ${preview ? "示例数据" : `${(scan.durationMs / 1000).toFixed(1)} 秒`}`
                        : "先扫描，再查看占用与清理影响"}
                    </p>
                  </div>
                  <span className="readonly-label">
                    <ShieldCheck size={14} />
                    扫描不会修改文件
                  </span>
                </div>
                <div className="filters" role="group" aria-label="按类型筛选">
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
                {scan && (
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
                          onClick={() => setCleanupFilter(filter)}
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
                )}
                {items.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-symbol">
                      <ScanLine size={31} strokeWidth={1.3} />
                    </div>
                    <h3>
                      {status === "scan"
                        ? "正在认识你的磁盘"
                        : "空间的去向，从这里开始"}
                    </h3>
                    <p>
                      {status === "scan"
                        ? "逐项扫描固定目录，可随时停止。遇到权限限制会明确标记。"
                        : "先确认扫描范围。默认只检查三个缓存位置；扩展扫描可分析主要目录和应用数据，结果不会自动勾选。"}
                    </p>
                    {status !== "scan" && (
                      <button
                        className="text-button"
                        disabled={!desktop || busy}
                        onClick={startScan}
                      >
                        开始第一次扫描 <ArrowRight size={16} />
                      </button>
                    )}
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
                      <span>分配空间</span>
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
                                  <span title={item.path}>
                                    {shortPath(item.path)}
                                  </span>
                                </button>
                              </div>
                              <strong className="item-size">
                                {!item.complete || item.issues > 0 ? "≥ " : ""}
                                {bytes(item.bytes)}
                              </strong>
                              <div className="item-action">
                                <span
                                  className={`badge ${canSelect ? "green" : itemState === "blocked" ? "amber" : ""}`}
                                >
                                  {cleanupLabels[itemState]}
                                </span>
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
                              <div className="item-details">
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
                                        查看项目账本 <ArrowRight size={13} />
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
                            setCleanupFilter("all");
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
              </section>
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
          ) : view === "projects" ? (
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
          ) : (
            <section className="history-list">
              {history.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-symbol">
                    <History size={30} strokeWidth={1.3} />
                  </div>
                  <h3>还没有清理记录</h3>
                  <p>
                    完成第一次清理后，这里会记录每项结果与磁盘可用空间变化。
                  </p>
                </div>
              ) : (
                history.map((r) => (
                  <article className="history-card" key={r.at}>
                    <div>
                      <Clock3 size={17} />
                      <strong>{date(r.at)}</strong>
                      <span>
                        <SpaceChange record={r} />
                      </span>
                    </div>
                    {r.outcomes.map((o, index) => (
                      <CleanupOutcome key={index} outcome={o} />
                    ))}
                    {r.warning && <p className="warning-text">{r.warning}</p>}
                    <p>
                      操作期间磁盘变化可能包含其他进程活动。候选占用{" "}
                      {bytes(r.estimated)} · 可用空间 {bytes(r.beforeAvailable)}{" "}
                      → {bytes(r.afterAvailable)}
                    </p>
                  </article>
                ))
              )}
            </section>
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
                  !desktop || busy || selectedItems.length === 0 || browsing
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
          {browse?.relative && (
            <button
              className="text-button"
              disabled={browsing}
              onClick={() =>
                void openBrowser(
                  browse.item,
                  browse.relative.split("/").slice(0, -1).join("/"),
                )
              }
            >
              ← 返回上一级
            </button>
          )}
          <div className="browse-list">
            {browse?.children.map((c) => (
              <button
                key={c.id}
                disabled={c.category !== "目录" || browsing}
                onClick={() => browse && void openBrowser(browse.item, c.id)}
              >
                <span>
                  {c.category === "目录" ? (
                    <Folder size={16} />
                  ) : (
                    <FileBox size={16} />
                  )}
                  {c.name}
                </span>
                <span>
                  {!c.complete || c.issues > 0 ? "≥ " : ""}
                  {bytes(c.bytes)}
                  {c.category === "目录" && <ChevronRight size={14} />}
                </span>
              </button>
            ))}
            {!browsing && browse?.children.length === 0 && (
              <p>
                {browse.complete && browse.issues === 0
                  ? "目录为空。"
                  : "未读取到子项，请检查权限或重试。"}
              </p>
            )}
          </div>
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
        </div>
      </dialog>
      {scanRequest && (
        <ScanAccess
          root={scanRequest.root}
          onCancel={() => setScanRequest(null)}
          onStart={(extended) => {
            const root = scanRequest.root;
            setScanRequest(null);
            if (root === null) void runScan(extended);
            else void scanProjects(root);
          }}
        />
      )}
    </div>
  );
}
