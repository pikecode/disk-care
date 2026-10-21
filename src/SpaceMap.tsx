import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Layers3 } from "lucide-react";
import { bytes } from "./format";
import {
  artifactSpaces,
  groupSpaces,
  layoutSpaces,
  projectSpaces,
} from "./spaceLayout";
import type { SpaceObject } from "./spaceLayout";
import type { ProjectReport } from "./types";

export default function SpaceMap({
  report,
  onRelations,
}: {
  report: ProjectReport;
  onRelations: (path: string) => void;
}) {
  const roots = useMemo(() => projectSpaces(report), [report]);
  const [trail, setTrail] = useState<SpaceObject[]>([]);
  const [selected, setSelected] = useState<SpaceObject | null>(null);
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(50);
  const scope = trail.at(-1);
  const objects =
    scope?.kind === "project"
      ? artifactSpaces(scope.project!, report.complete)
      : (scope?.members ?? roots);
  const rectangles = layoutSpaces(groupSpaces(objects));
  const total = objects.reduce((n, item) => n + item.bytes, 0);
  const filtered = objects.filter((item) =>
    `${item.label} ${item.project?.path ?? ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const project = selected?.project ?? scope?.project;
  const resetFilter = () => {
    setQuery("");
    setVisible(50);
  };
  const choose = (item: SpaceObject) => {
    setSelected(item.kind === "group" ? null : item);
    if (item.kind !== "artifact") {
      setTrail((current) => [...current, item]);
      resetFilter();
    }
  };
  const goBack = (all = false) => {
    const next = all ? [] : trail.slice(0, -1);
    setTrail(next);
    setSelected(next.at(-1)?.kind === "project" ? next.at(-1)! : null);
    resetFilter();
  };
  return (
    <section className="space-map" aria-label="项目空间地图">
      <header className="space-map-heading">
        <div>
          <h3>空间越大，面积越大。</h3>
          <p>比较已识别产物的观测占用，再展开项目查看恢复条件。</p>
        </div>
        <div>
          <span>本层观测合计（可能重复）</span>
          <strong>
            {report.complete ? "" : "≥ "}
            {bytes(total)}
          </strong>
        </div>
      </header>
      <p className="space-map-boundary">
        面积以当前层已测量产物为基准，包含可能重复的硬链接或 APFS
        克隆；不代表项目总大小、磁盘占比或可释放空间。共享模型和全局缓存未纳入。
      </p>
      {!report.complete && (
        <p className="project-warning">
          本次扫描不完整，面积仅表示已读取部分，未发现的项目或产物可能遗漏。
        </p>
      )}
      <div className="space-map-nav">
        <div>
          <button
            className="text-button"
            onClick={() => goBack(true)}
            disabled={!trail.length}
          >
            全部项目
          </button>
          {trail.map((item, index) => (
            <span key={`${item.id}:${index}`}> / {item.label}</span>
          ))}
        </div>
        {trail.length > 0 && (
          <button className="text-button" onClick={() => goBack()}>
            <ArrowLeft size={13} />
            返回上层
          </button>
        )}
      </div>
      <div className="space-map-legend">
        <span className="node">Node</span>
        <span className="rust">Rust</span>
        <span className="python">Python</span>
        <span className="mixed">其他 / 混合</span>
        <small>点击项目或“其他项目”展开；微小项可从下方列表选择。</small>
      </div>
      <div className="space-map-workspace">
        <div className="space-map-main">
          {rectangles.length > 0 ? (
            <div
              className="space-map-canvas"
              aria-label="按占用面积排列的项目或产物"
            >
              {rectangles.map(({ item, x, y, width, height }) => (
                <button
                  key={item.id}
                  className={`space-cell ${item.tone} ${selected?.id === item.id ? "selected" : ""}`}
                  style={{
                    left: `${x}%`,
                    top: `${y}%`,
                    width: `${width}%`,
                    height: `${height}%`,
                  }}
                  title={`${item.label}\n${item.project?.path ?? "聚合项目"}\n${item.complete ? "" : "≥ "}${bytes(item.bytes)}`}
                  aria-label={`选择${item.kind === "artifact" ? "产物" : item.kind === "group" ? "聚合" : "项目"}：${item.label}，${item.complete ? "" : "至少 "}${bytes(item.bytes)}`}
                  onClick={() => choose(item)}
                >
                  {width > 9 && height > 9 && (
                    <span>
                      <strong>{item.label}</strong>
                      {height > 18 && (
                        <small>
                          {item.complete ? "" : "≥ "}
                          {bytes(item.bytes)}
                        </small>
                      )}
                      {width > 24 && height > 30 && item.project && (
                        <small>{item.project.path || "."}</small>
                      )}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="space-map-empty">
              <Layers3 size={30} />
              <h3>没有可绘制的正占用数据</h3>
              <p>
                零占用与未发现产物的项目仍可从下方列表查看；未读取到内容不代表没有占用。
              </p>
            </div>
          )}
          <div className="space-map-list-heading">
            <label htmlFor="space-map-search">
              本层对象 <small>{objects.length} 项</small>
            </label>
            <input
              id="space-map-search"
              placeholder="搜索名称或路径"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setVisible(50);
              }}
            />
          </div>
          <p className="space-map-search-note">
            搜索仅筛选文字列表，地图继续显示本层全部面积。
          </p>
          <div className="space-map-list" aria-label="空间地图等价列表">
            {filtered.slice(0, visible).map((item) => (
              <button
                key={item.id}
                onClick={() => choose(item)}
                aria-label={`从列表选择${item.kind === "artifact" ? "产物" : "项目"}：${item.project?.path || item.label}${item.kind === "artifact" ? `/${item.label}` : ""}`}
              >
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.project?.path || "."}</small>
                </span>
                <b>
                  {item.complete ? "" : "≥ "}
                  {bytes(item.bytes)}
                </b>
                <ArrowRight size={13} />
              </button>
            ))}
          </div>
          {!filtered.length && (
            <p className="space-map-search-note">
              {objects.length
                ? "没有匹配对象。"
                : "此层没有已识别产物；不代表目录没有其他数据。"}
            </p>
          )}
          {filtered.length > visible && (
            <button
              className="text-button"
              onClick={() => setVisible((n) => n + 50)}
            >
              继续显示对象（{visible}/{filtered.length}）
            </button>
          )}
        </div>
        <aside
          className="space-map-details"
          aria-label="空间地图对象详情"
          aria-live="polite"
        >
          <div className="eyebrow">观测与恢复</div>
          <h3>{selected?.label ?? scope?.label ?? "选择一个项目"}</h3>
          {selected ? (
            <>
              <p>
                {selected.project?.path || "."}
                {selected.artifact ? `/${selected.artifact.name}` : ""}
              </p>
              <strong className="space-map-size">
                {selected.complete ? "" : "≥ "}
                {bytes(selected.bytes)}
              </strong>
              <p>
                {selected.complete
                  ? "声明范围内的产物统计完整。"
                  : "扫描不完整，观测占用可能低估。"}
              </p>
              {selected.artifact ? (
                <>
                  <h4>恢复条件</h4>
                  <p>{selected.artifact.recovery}</p>
                  <small>
                    {selected.artifact.files.toLocaleString()} 个条目
                  </small>
                </>
              ) : (
                <p>
                  此数值为已识别直接产物合计，不包含项目源码、未识别数据及共享资源。
                </p>
              )}
            </>
          ) : (
            <p>
              点击矩形或等价列表，展开项目的构建产物与虚拟环境。图中没有为零占用对象分配面积。
            </p>
          )}
          {project && (
            <button
              className="button secondary"
              onClick={() => onRelations(project.path)}
            >
              查看项目关系 <ArrowRight size={14} />
            </button>
          )}
          <div className="relation-boundary">
            <strong>处理前先看影响</strong>
            <p>
              占用大小不证明可删除；此视图只分析，不执行清理。依赖证据请在项目关系图中检查。
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
