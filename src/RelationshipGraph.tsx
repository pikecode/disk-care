import { useId, useMemo, useState } from "react";
import { ArrowLeft, Box, Folder, Network, Terminal } from "lucide-react";
import { bytes } from "./format";
import { edgeLabels, projectId, relationships } from "./relationships";
import type { RelationEdge, RelationNode } from "./relationships";
import type { ProjectReport } from "./types";

const names = {
  project: "项目",
  artifact: "产物目录",
  model: "本地模型",
  process: "可见进程",
};
function subtitle(node: RelationNode) {
  return node.artifact
    ? `${node.artifact.complete ? "" : "≥ "}${bytes(node.artifact.bytes)} · 仅分析`
    : node.kind === "model"
      ? node.model ? `Ollama · ${node.model.complete ? "关联占用" : "已观测"} ${bytes(node.model.allocatedBytes)}` : "Ollama · 占用未测量"
      : node.kind === "process"
        ? "路径线索 · 非调用证明"
        : node.project?.path || ".";
}

export default function RelationshipGraph({
  report,
  initialProjectPath,
}: {
  report: ProjectReport;
  initialProjectPath?: string;
}) {
  const graph = useMemo(() => relationships(report), [report]);
  const [projectPath, setProjectPath] = useState(
    report.projects.some((p) => p.path === initialProjectPath)
      ? initialProjectPath!
      : (report.projects[0]?.path ?? ""),
  );
  const [focusId, setFocusId] = useState(projectId(projectPath));
  const [edgeId, setEdgeId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [projectLimit, setProjectLimit] = useState(50);
  const [limit, setLimit] = useState(12);
  const markerId = useId().replaceAll(":", "");
  const focus = graph.nodes.get(focusId);
  const related = graph.edges.filter(
    (e) => e.source === focusId || e.target === focusId,
  );
  const shown = related.slice(0, limit);
  const left = shown.filter((e) => e.target === focusId);
  const right = shown.filter((e) => e.source === focusId);
  const height = Math.max(3, left.length, right.length) * 94 + 40;
  const filtered = report.projects.filter((p) =>
    `${p.name} ${p.path}`.toLowerCase().includes(query.toLowerCase()),
  );
  const selectedEdge = graph.edges.find((e) => e.id === edgeId);
  const selectNode = (id: string) => {
    setFocusId(id);
    setEdgeId(null);
    setLimit(12);
  };
  const chooseProject = (path: string) => {
    setProjectPath(path);
    selectNode(projectId(path));
  };
  if (!focus)
    return (
      <div className="empty-state">
        <Network size={28} />
        <h3>还没有可展示的项目关系</h3>
        <p>请选择包含支持项目的目录重新扫描。</p>
      </div>
    );
  const renderNode = (
    node: RelationNode,
    x: number,
    y: number,
    center = false,
  ) => {
    const Icon =
      node.kind === "project"
        ? Folder
        : node.kind === "process"
          ? Terminal
          : Box;
    return (
      <button
        key={node.id}
        className={`relation-node ${node.kind} ${center ? "central" : ""}`}
        style={{ left: `${x / 7.2}%`, top: y }}
        aria-label={`查看${names[node.kind]}关系：${node.label}`}
        aria-pressed={center}
        onClick={() => selectNode(node.id)}
        title={`${node.label}\n${subtitle(node)}`}
      >
        <span className="relation-node-kind">
          <Icon size={13} />
          {names[node.kind]}
        </span>
        <strong>{node.label}</strong>
        <small>{subtitle(node)}</small>
      </button>
    );
  };
  const renderEdge = (edge: RelationEdge, x: number, y: number) => {
    const incoming = edge.target === focusId;
    const sx = incoming ? x + 96 : 456;
    const tx = incoming ? 264 : x - 96;
    const sy = incoming ? y : height / 2;
    const ty = incoming ? height / 2 : y;
    const path = `M ${sx} ${sy} C ${(sx + tx) / 2} ${sy}, ${(sx + tx) / 2} ${ty}, ${tx} ${ty}`;
    return (
      <g
        key={edge.id}
        className={`relation-edge ${edge.kind} ${edge.id === edgeId ? "selected" : ""}`}
      >
        <path d={path} markerEnd={`url(#${markerId})`} />
        <path
          d={path}
          className="relation-hit"
          onClick={() => setEdgeId(edge.id)}
        />
        <title>
          {edgeLabels[edge.kind]}：{graph.nodes.get(edge.source)?.label} →{" "}
          {graph.nodes.get(edge.target)?.label}
        </title>
      </g>
    );
  };
  return (
    <section className="relationship-view" aria-label="项目直接关系图" tabIndex={-1}>
      <div className="relation-intro">
        <div>
          <h3>看清关联，再决定处理方式。</h3>
          <p>
            只展示选中对象的一层关系；线索来自本次扫描，未发现引用不代表没有依赖。
          </p>
        </div>
        <span className="badge">
          {report.complete ? "本次范围内的观测" : "部分扫描 · 关系可能遗漏"}
        </span>
      </div>
      <div className="relation-workspace">
        <aside className="relation-projects" aria-label="关系图项目选择">
          <label htmlFor={`${markerId}-search`}>
            选择项目 <small>{report.projects.length} 个</small>
          </label>
          <input
            id={`${markerId}-search`}
            placeholder="搜索名称或路径"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setProjectLimit(50);
            }}
          />
          <div className="relation-project-list">
            {filtered.slice(0, projectLimit).map((p) => (
              <button
                key={p.path}
                className={p.path === projectPath ? "active" : ""}
                aria-pressed={p.path === projectPath}
                onClick={() => chooseProject(p.path)}
                title={p.path || "."}
              >
                <Folder size={14} />
                <span>
                  <strong>{p.name}</strong>
                  <small>{p.path || "."}</small>
                </span>
              </button>
            ))}
          </div>
          {!filtered.length && <p>没有匹配项目；当前关系仍保留。</p>}
          {filtered.length > projectLimit && (
            <button
              className="text-button"
              onClick={() => setProjectLimit((n) => n + 50)}
            >
              更多项目（{projectLimit}/{filtered.length}）
            </button>
          )}
        </aside>
        <div className="relation-main">
          <div className="relation-toolbar">
            <span>
              {names[focus.kind]} · {focus.label}
            </span>
            <button
              className="text-button"
              onClick={() => selectNode(projectId(projectPath))}
            >
              <ArrowLeft size={13} />
              返回所选项目
            </button>
          </div>
          <div className="relation-legend">
            <span className="contains">目录包含 →</span>
            <span className="model">配置引用 ⇢</span>
            <span className="process">可见路径引用 ⋯→</span>
          </div>
          <div className="relation-canvas-scroll">
            <div className="relation-canvas" style={{ height }}>
              <svg
                viewBox={`0 0 720 ${height}`}
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <defs>
                  <marker
                    id={markerId}
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="5"
                    markerHeight="5"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
                  </marker>
                </defs>
                {left.map((e, i) => renderEdge(e, 110, i * 94 + 66))}
                {right.map((e, i) => renderEdge(e, 610, i * 94 + 66))}
              </svg>
              {renderNode(focus, 360, height / 2, true)}
              {left.map((e, i) =>
                renderNode(graph.nodes.get(e.source)!, 110, i * 94 + 66),
              )}
              {right.map((e, i) =>
                renderNode(graph.nodes.get(e.target)!, 610, i * 94 + 66),
              )}
            </div>
          </div>
          {!related.length && (
            <p className="relation-empty">
              尚未发现可绘制的直接关系；旧版文字证据也不会被推测成连线。
            </p>
          )}
          <div className="relation-list" aria-label="直接关系与证据">
            <h4>
              直接关系{" "}
              <span>
                {shown.length} / {related.length}
              </span>
            </h4>
            {shown.map((edge) => (
              <button
                key={edge.id}
                aria-pressed={edgeId === edge.id}
                onClick={() => setEdgeId(edge.id)}
              >
                <i className={edge.kind} />
                <span>
                  {graph.nodes.get(edge.source)?.label}
                  <b> → {edgeLabels[edge.kind]} → </b>
                  {graph.nodes.get(edge.target)?.label}
                </span>
                <small>查看依据</small>
              </button>
            ))}
          </div>
          {related.length > limit && (
            <button
              className="text-button"
              onClick={() => setLimit((n) => n + 12)}
            >
              显示更多关系（{shown.length}/{related.length}）
            </button>
          )}
        </div>
        <aside
          className="relation-inspector"
          aria-label="关系详情"
          aria-live="polite"
        >
          <div className="eyebrow">
            {selectedEdge ? "连线依据" : "对象详情"}
          </div>
          <h3>{selectedEdge ? edgeLabels[selectedEdge.kind] : focus.label}</h3>
          {selectedEdge ? (
            <>
              <p>
                {graph.nodes.get(selectedEdge.source)?.label} →{" "}
                {graph.nodes.get(selectedEdge.target)?.label}
              </p>
              {selectedEdge.evidence.map((e) => (
                <p className="relation-proof" key={e}>
                  {e}
                </p>
              ))}
              <button className="text-button" onClick={() => setEdgeId(null)}>
                返回对象详情
              </button>
            </>
          ) : (
            <>
              <span className="badge">{names[focus.kind]}</span>
              <p>{subtitle(focus)}</p>
              {focus.artifact && (
                <>
                  <h4>恢复条件</h4>
                  <p>{focus.artifact.recovery}</p>
                  <small>
                    {focus.artifact.files.toLocaleString()} 个条目 ·{" "}
                    {focus.artifact.complete ? "统计完整" : "占用仅为下限"}
                  </small>
                </>
              )}
              {focus.kind === "model" && (
                <p>
                  {focus.model ? "关联占用包含共享文件，不能跨模型相加；独占与文件块依据见本地模型空间账本。" : "占用未单独测量。"} 不计入项目；可点击其他项目查看关联。配置引用不证明实际调用，也不证明模型独占。
                </p>
              )}
              {focus.kind === "process" && (
                <p>
                  PID
                  仅代表扫描时可见的项目路径线索；不能证明正在使用具体产物或模型。
                </p>
              )}
              {focus.kind === "project" && (
                <>
                  <h4>扫描线索</h4>
                  {focus.project?.evidence.map((e, i) => (
                    <p className="relation-proof" key={i}>
                      {e.message}
                    </p>
                  ))}
                </>
              )}
            </>
          )}
          <div className="relation-boundary">
            <strong>检测边界</strong>
            <p>
              关联只覆盖本次扫描范围，未扫描项目、相对路径与动态配置可能遗漏；所有节点仅供分析。
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
