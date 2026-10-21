import { useEffect, useState } from "react";
import {
  ArrowRight,
  Folder,
  LoaderCircle,
  ScanLine,
  TriangleAlert,
} from "lucide-react";
import { bytes } from "./format";
import RelationshipGraph from "./RelationshipGraph";
import SpaceMap from "./SpaceMap";
import ModelStorage from "./ModelStorage";
import type { Progress, ProjectReport } from "./types";

interface Props {
  desktop: boolean;
  busy: boolean;
  scanning: boolean;
  progress: Progress | null;
  report: ProjectReport | null;
  onScan: (root: string) => void;
  onCancel: () => void;
  onCaches: () => void;
}
export default function ProjectLedger({
  desktop,
  busy,
  scanning,
  progress,
  report,
  onScan,
  onCancel,
  onCaches,
}: Props) {
  const [root, setRoot] = useState(report?.root ?? "~/work");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("全部");
  const [visible, setVisible] = useState(50);
  const [display, setDisplay] = useState<"graph" | "ledger" | "map">("graph");
  const [relationProject, setRelationProject] = useState<string | undefined>();
  useEffect(() => {
    setVisible(50);
  }, [query, filter, report]);
  const projects =
    report?.projects.filter(
      (p) =>
        `${p.name} ${p.path}`.toLowerCase().includes(query.toLowerCase()) &&
        (filter === "全部" ||
          (filter === "有运行引用"
            ? p.evidence.some((e) => e.kind === "process")
            : p.languages.includes(filter))),
    ) ?? [];
  const artifacts =
    report?.projects.reduce((n, p) => n + p.artifacts.length, 0) ?? 0;
  const signals =
    report?.projects.filter((p) => p.evidence.some((e) => e.kind === "process"))
      .length ?? 0;
  return (
    <section className="project-ledger" aria-label="项目空间账本">
      <form
        className="project-search"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy && desktop && root.trim()) onScan(root);
        }}
      >
        <label htmlFor="project-root">
          工作目录 <span>项目按指定目录扫描</span>
        </label>
        <div>
          <Folder size={18} />
          <input
            id="project-root"
            value={root}
            onChange={(e) => setRoot(e.target.value)}
            disabled={busy}
            placeholder="~/work 或主目录内的绝对路径"
            spellCheck={false}
          />
          <button
            className="button primary"
            disabled={!desktop || busy || !root.trim()}
            type="submit"
          >
            <ScanLine size={16} />
            扫描项目
          </button>
          {scanning && (
            <button
              className="button secondary"
              type="button"
              onClick={onCancel}
            >
              停止
            </button>
          )}
        </div>
        <p>
          本地识别
          Node、Rust、Python；同时只读分析默认 Ollama 模型仓库，不执行项目脚本。共享缓存和模型不重复分摊到项目。
        </p>
      </form>
      {scanning && (
        <div className="project-status" role="status">
          <LoaderCircle size={18} className="spin" />
          <span>
            正在发现项目 · {progress?.name ?? "准备中"}
            <small>已检查 {progress?.done ?? 0} 个目录；可随时停止</small>
          </span>
        </div>
      )}
      {report && (
        <>
          <div className="ledger-summary">
            <div>
              <span>识别项目</span>
              <strong>
                {report.projects.length}
                <small>个</small>
              </strong>
            </div>
            <div>
              <span>已测量产物目录</span>
              <strong>
                {artifacts}
                <small>个</small>
              </strong>
            </div>
            <div>
              <span>有可见进程路径引用</span>
              <strong>
                {signals}
                <small>个项目</small>
              </strong>
            </div>
            <div>
              <span>扫描状态</span>
              <strong className="ledger-state">
                {report.complete
                  ? "完整"
                  : report.cancelled
                    ? "已停止"
                    : "部分"}
              </strong>
              <small>
                {(report.durationMs / 1000).toFixed(1)} 秒 · {report.issues}{" "}
                处读取问题
              </small>
            </div>
          </div>
          <p className="ledger-scope" title={report.root}>
            {report.root} ·{" "}
            {new Date(report.measuredAt).toLocaleString("zh-CN", {
              hour12: false,
            })}
          </p>
          {report.warnings.map((warning, i) => (
            <p className="project-warning" key={i}>
              <TriangleAlert size={16} />
              {warning}
            </p>
          ))}
          <ModelStorage key={`${report.root}:${report.measuredAt}`} report={report} onProject={(path) => {setRelationProject(path);setDisplay("graph");requestAnimationFrame(() => {
              const view = document.querySelector<HTMLElement>(".relationship-view");
              view?.scrollIntoView({block: "start"});
              view?.focus({preventScroll: true});
            });}} />
          <section className="ledger-changes" aria-label="扫描变化">
            <div>
              <h3>与上次完整扫描比较</h3>
              <span>
                {report.baselineAt
                  ? new Date(report.baselineAt).toLocaleString("zh-CN", {
                      hour12: false,
                    })
                  : "尚无可用基线"}
              </span>
            </div>
            <p>
              {!report.complete
                ? "本次扫描不完整，不计算增减，也不覆盖上次完整基线。"
                : !report.baselineAt
                  ? "完整扫描会保存在本机；再次扫描同一目录，即可查看变化。"
                  : report.changes.length === 0
                    ? "已识别产物占用没有变化。"
                    : "仅表示已识别目录的观测变化，不推断哪个进程写入，也不代表实际可回收量。"}
            </p>
            {report.complete && report.changes.length > 0 && (
              <details>
                <summary>查看 {report.changes.length} 项变化</summary>
                <div className="change-list">
                  {report.changes.map((c) => (
                    <div key={c.path}>
                      <span title={c.path}>{c.path}</span>
                      <b>
                        {c.before === null
                          ? "新增"
                          : c.after === null
                            ? "未再发现"
                            : c.after - c.before >= 0
                              ? "+"
                              : "−"}{" "}
                        {bytes(
                          c.before === null
                            ? (c.after ?? 0)
                            : c.after === null
                              ? c.before
                              : Math.abs(c.after - c.before),
                        )}
                      </b>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </section>
          <div
            className="ledger-display"
            role="group"
            aria-label="项目展示方式"
          >
            <button
              aria-pressed={display === "map"}
              onClick={() => setDisplay("map")}
            >
              空间地图
            </button>
            <button
              aria-pressed={display === "graph"}
              onClick={() => setDisplay("graph")}
            >
              关系图
            </button>
            <button
              aria-pressed={display === "ledger"}
              onClick={() => setDisplay("ledger")}
            >
              账本列表
            </button>
            <span>地图找大项，关系看影响。</span>
          </div>
          {display === "map" ? (
            <SpaceMap
              key={`${report.root}:${report.measuredAt}`}
              report={report}
              onRelations={(path) => {
                setRelationProject(path);
                setDisplay("graph");
              }}
            />
          ) : display === "graph" ? (
            <RelationshipGraph
              key={`${report.root}:${report.measuredAt}:${relationProject ?? ""}`}
              report={report}
              initialProjectPath={relationProject}
            />
          ) : (
            <>
              <div className="ledger-filters">
                <input
                  aria-label="搜索项目"
                  placeholder="搜索项目名称或相对路径"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <div>
                  {["全部", "Node", "Rust", "Python", "有运行引用"].map(
                    (value) => (
                      <button
                        key={value}
                        className={filter === value ? "active" : ""}
                        onClick={() => setFilter(value)}
                      >
                        {value}
                      </button>
                    ),
                  )}
                </div>
              </div>
              <div className="project-cards">
                {projects.slice(0, visible).map((p) => (
                  <article className="project-card" key={p.path}>
                    <header>
                      <span className="project-folder">
                        <Folder size={22} />
                      </span>
                      <div>
                        <h3>{p.name}</h3>
                        <p title={p.path}>{p.path || "."}</p>
                      </div>
                      <div className="project-languages">
                        {p.languages.map((l) => (
                          <span key={l}>{l}</span>
                        ))}
                      </div>
                    </header>
                    <div className="artifact-list">
                      {p.artifacts.length === 0 ? (
                        <p>
                          未发现支持统计的直接子产物目录；这不代表项目没有占用。
                        </p>
                      ) : (
                        p.artifacts.map((a) => (
                          <details key={a.name}>
                            <summary>
                              <span>{a.name}</span>
                              <strong>
                                {a.complete ? "" : "≥ "}
                                {bytes(a.bytes)}
                              </strong>
                              <span className="badge">仅分析</span>
                            </summary>
                            <p>{a.recovery}</p>
                            <small>
                              {a.files.toLocaleString()} 个条目 ·{" "}
                              {a.complete ? "统计完整" : "统计不完整"}
                            </small>
                          </details>
                        ))
                      )}
                    </div>
                    <details className="project-evidence">
                      <summary>
                        影响证据{" "}
                        <span>
                          {
                            p.evidence.filter((e) => e.kind !== "unknown")
                              .length
                          }{" "}
                          条已发现线索
                        </span>
                      </summary>
                      {p.evidence.map((e, i) => (
                        <p key={i}>
                          <span className={`evidence-kind ${e.kind}`}>
                            {e.kind === "process"
                              ? "运行引用"
                              : e.kind === "model"
                                ? "模型引用"
                                : "检测边界"}
                          </span>
                          {e.message}
                        </p>
                      ))}
                    </details>
                  </article>
                ))}
              </div>
              {projects.length > visible && (
                <button
                  className="button secondary ledger-load"
                  onClick={() => setVisible((n) => n + 50)}
                >
                  继续显示（已显示 {visible} / {projects.length}）
                </button>
              )}
              {projects.length === 0 && (
                <div className="empty-state">
                  <Folder size={28} />
                  <h3>
                    {report.projects.length
                      ? "没有匹配的项目"
                      : "未发现支持的项目"}
                  </h3>
                  <p>
                    识别项目根部的 package.json、Cargo.toml、pyproject.toml 或
                    requirements.txt；可选择更接近项目的目录重试。
                  </p>
                </div>
              )}
            </>
          )}
        </>
      )}
      {!report && !scanning && (
        <div className="empty-state">
          <div className="empty-symbol">
            <Folder size={30} strokeWidth={1.3} />
          </div>
          <h3>让空间，有项目归属。</h3>
          <p>
            查看构建产物、虚拟环境和模型引用，在处理前看懂恢复条件。首次扫描只建立账本，不删除文件。
          </p>
        </div>
      )}
      <div className="ledger-footer">
        <div>
          <strong>清理前，看懂影响。</strong>
          <p>项目产物当前仅分析。uv、npm、pip 缓存可通过已有计划确认后清理。</p>
          <small>
            分配块统计受硬链接、APFS
            克隆和快照影响；跨项目占用不能直接视为可释放总量。
          </small>
        </div>
        <button className="button secondary" onClick={onCaches} disabled={busy}>
          查看缓存清理 <ArrowRight size={16} />
        </button>
      </div>
    </section>
  );
}
