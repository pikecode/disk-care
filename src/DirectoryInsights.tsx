import { useEffect, useState, type ReactNode } from "react";
import type { Listing } from "./types";
import { directorySpaces, filterLargeFiles } from "./directoryData";
import { layoutSpaces, type SpaceObject } from "./spaceLayout";
import { bytes } from "./format";
import CoverageDiagnostics from "./CoverageDiagnostics";

export default function DirectoryInsights({ data, relative, busy, onOpen, onReveal, children }: {
  data: Omit<Listing, "items">; relative: string; busy: boolean;
  onOpen: (relative: string) => void; onReveal: (relative: string) => Promise<void>; children: ReactNode;
}) {
  const [view, setView] = useState("list");
  const [selected, setSelected] = useState<SpaceObject | null>(null);
  const [query, setQuery] = useState("");
  const [minimum, setMinimum] = useState(100 * 1024 ** 2);
  const [kind, setKind] = useState("all");
  const [before, setBefore] = useState("");
  const [visible, setVisible] = useState(50);
  const [revealing, setRevealing] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setSelected(null); setError(""); setVisible(50); }, [relative, data.measuredAt]);
  const objects = directorySpaces(data);
  const rectangles = layoutSpaces(objects);
  const total = objects.reduce((sum, item) => sum + item.bytes, 0);
  const filtered = filterLargeFiles(data.largeFiles ?? [], query, minimum, kind, before);
  const parts = relative ? relative.split("/") : [];
  async function reveal(path: string) {
    setRevealing(true); setError("");
    try { await onReveal(path); } catch (error) { setError(String(error)); }
    finally { setRevealing(false); }
  }
  function choose(item: SpaceObject) {
    if (item.kind === "directory") onOpen(item.entry!.id);
    else if (item.kind === "group") setView("list");
    else setSelected(item);
  }
  return (
    <section className="directory-insights" aria-label="只读空间浏览">
      <nav className="directory-trail" aria-label="目录层级">
        <button className="text-button" disabled={busy || !parts.length} onClick={() => onOpen("")}>起始目录</button>
        {parts.map((part, index) => <span key={index}> / <button className="text-button"
          disabled={busy || index === parts.length - 1} onClick={() => onOpen(parts.slice(0, index + 1).join("/"))}>{part}</button></span>)}
      </nav>
      <div className="directory-tabs" role="group" aria-label="目录视图">
        {[["list", "列表"], ["map", "空间地图"], ["files", "大文件"]].map(([id, label]) =>
          <button key={id} className="button secondary" aria-pressed={view === id} disabled={busy} onClick={() => setView(id)}>{label}</button>)}
      </div>
      {data.coverage && <CoverageDiagnostics coverage={data.coverage} />}
      {view === "list" && children}
      {view === "map" && !busy && <div>
        {data.mapItems !== undefined && <p>子项观测合计：{data.complete ? "" : "≥ "}{bytes(total)}。面积包含本层所有已观测正占用子项，不含当前目录自身；不代表磁盘占比或可释放量。</p>}
        <p>最大的 30 项单独展示，其余聚合；点击目录进入下层，文件仅显示详情，“其他”返回列表。硬链接在本次子树遍历中只归属首次遇到的位置，APFS 克隆可能共享空间。</p>
        {data.mapItems === undefined ? <p>旧版结果未包含全层地图，请重新打开目录。</p>
          : rectangles.length === 0 ? <p>没有可绘制的正占用子项；请同时检查覆盖状态。</p>
          : <>
            <div className="directory-map" aria-label="普通目录空间地图">{rectangles.map(({ item, x, y, width, height }) =>
              <button key={item.id} className={`space-cell ${item.tone}`} style={{ left: `${x}%`, top: `${y}%`, width: `${width}%`, height: `${height}%` }}
                disabled={busy} title={`${item.label} · ${bytes(item.bytes)}`} aria-label={`${item.label}，${item.complete ? "" : "至少 "}${bytes(item.bytes)}`} onClick={() => choose(item)}>
                {width * height > 150 && <span>{item.label}<br />{bytes(item.bytes)}</span>}
              </button>)}</div>
            <div className="directory-map-list" aria-label="地图等价列表">{objects.map(item =>
              <button key={item.id} className="text-button" disabled={busy} onClick={() => choose(item)}>{item.label} · {bytes(item.bytes)}</button>)}</div>
          </>}
        {selected && <p role="status">{selected.entry?.path} · 分配块观测 {bytes(selected.bytes)}。本项只读，不提供删除。</p>}
      </div>}
      {view === "files" && !busy && <div>
        <p>当前子树保留逻辑大小至少 1 MiB 的最大 100 个普通文件，已观测符合门槛 {data.largeFilesTotal ?? "未知"} 个。筛选仅作用于已保留清单，可能还有其他匹配文件；部分扫描不代表完整排行。</p>
        <p>只读取元数据，不读取正文。硬链接按身份去重，仅显示首次遇到的路径。逻辑大小与分配块不同，均不代表可释放量；修改时间不是最后使用时间。</p>
        <div className="directory-filters">
          <label>搜索大文件<input value={query} onChange={event => { setQuery(event.target.value); setVisible(50); }} /></label>
          <label>最小逻辑大小<select aria-label="最小逻辑大小" value={minimum} onChange={event => { setMinimum(Number(event.target.value)); setVisible(50); }}>
            <option value={1024 ** 2}>1 MiB</option><option value={100 * 1024 ** 2}>100 MiB</option><option value={1024 ** 3}>1 GiB</option>
          </select></label>
          <label>文件类型<select aria-label="文件类型" value={kind} onChange={event => { setKind(event.target.value); setVisible(50); }}>
            <option value="all">全部类型</option><option value="video">视频</option><option value="installer">安装包</option><option value="archive">归档</option><option value="other">其他类型</option>
          </select></label>
          <label>修改早于<input type="date" value={before} onChange={event => { setBefore(event.target.value); setVisible(50); }} /></label>
        </div>
        <p>当前匹配 {filtered.length} 项</p>
        {data.largeFiles === undefined && <p>旧版结果未包含大文件，请重新打开目录。</p>}
        {data.largeFiles !== undefined && filtered.length === 0 && <p>保留清单中没有匹配项；不代表范围内没有其他大文件。</p>}
        <ul className="directory-files">{filtered.slice(0, visible).map(file => <li key={file.relative}>
          <code className="ai-path">{file.path}</code>
          <span>逻辑 {bytes(file.logicalBytes)} · 分配块 {bytes(file.allocatedBytes)} · 修改 {file.modifiedAt == null ? "未知" : new Date(file.modifiedAt).toLocaleString()}</span>
          <button className="text-button" disabled={busy || revealing} onClick={() => void reveal(file.relative)}>在 Finder 中定位</button>
        </li>)}</ul>
        {filtered.length > visible && <button className="text-button" onClick={() => setVisible(visible + 50)}>再显示 50 个文件</button>}
        {error && <p role="alert">{error}</p>}
      </div>}
    </section>
  );
}
