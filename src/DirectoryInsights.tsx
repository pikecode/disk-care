import { useEffect, useState, type ReactNode } from "react";
import type { Listing, Item } from "./types";
import { directorySpaces, filterLargeFiles } from "./directoryData";
import { layoutSpaces, type SpaceObject } from "./spaceLayout";
import { bytes } from "./format";
import CoverageDiagnostics from "./CoverageDiagnostics";

export default function DirectoryInsights({ data, entries, relative, busy, onOpen, onReveal, children }: {
  data: Omit<Listing, "items">; entries: Item[]; relative: string; busy: boolean;
  onOpen: (relative: string) => void; onReveal: (relative: string) => Promise<void>; children: ReactNode;
}) {
  const [view, setView] = useState("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [minimum, setMinimum] = useState(100 * 1024 ** 2);
  const [kind, setKind] = useState("all");
  const [before, setBefore] = useState("");
  const [visible, setVisible] = useState(50);
  const [revealing, setRevealing] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setSelectedId(null); setSelectedFile(null); setError(""); setVisible(50); }, [relative, data.measuredAt]);
  const objects = directorySpaces(data);
  const listObjects = directorySpaces({mapItems: entries, otherBytes: 0, otherCount: 0, complete: data.complete});
  const selected = (view === "map" ? objects : listObjects).find(item => item.id === selectedId) ?? (view === "list" ? listObjects[0] : selectedId === null ? objects.find(item => item.entry?.id === entries[0]?.id) : null);
  const rectangles = layoutSpaces(objects);
  const total = objects.reduce((sum, item) => sum + item.bytes, 0);
  const filtered = filterLargeFiles(data.largeFiles ?? [], query, minimum, kind, before);
  const visibleFiles = filtered.slice(0, visible);
  const fileDetail = visibleFiles.find(file => file.relative === selectedFile) ?? visibleFiles[0];
  const parts = relative ? relative.split("/") : [];
  async function reveal(path: string) {
    setRevealing(true); setError("");
    try { await onReveal(path); } catch (error) { setError(String(error)); }
    finally { setRevealing(false); }
  }
  function choose(item: SpaceObject) {
    if (item.kind === "group") { setView("list"); setSelectedId(null); }
    else setSelectedId(item.id);
  }
  const entryDetail = selected?.entry && <section className="object-detail" aria-label="目录对象详情"><span className="object-policy">{selected.kind === "directory" ? "只读文件夹" : "只读文件"}</span><h3>{selected.label}</h3><code className="ai-path">{selected.entry.path}</code><p>已观测占用：{!selected.complete && selected.bytes === 0 ? "未统计" : `${selected.complete ? "" : "≥ "}${bytes(selected.bytes)}`}</p><p>{selected.complete ? "范围内统计完成，不代表可以删除。" : "统计不完整，未访问的内容不代表零占用。"}</p>{selected.entry.coverage && <CoverageDiagnostics coverage={selected.entry.coverage} />}{selected.kind === "directory" ? <button className="button secondary" disabled={busy} onClick={() => onOpen(selected.entry!.id)}>打开文件夹</button> : <p>本项只查看元数据，不提供打开正文或删除。</p>}</section>;
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
      {view === "list" && <><div className="object-workspace"><div className="object-list browse-list" aria-label="目录对象列表">{listObjects.map(item => <button key={item.id} className="object-row" aria-label={`选择${item.kind === "directory" ? "文件夹" : "文件"} ${item.label}`} aria-pressed={selected?.id === item.id} disabled={busy} onClick={() => choose(item)}><span><strong>{item.label}</strong><small>{item.kind === "directory" ? "文件夹" : "文件"}</small></span><strong>{!item.complete && item.bytes === 0 ? "未统计" : `${item.complete ? "" : "≥ "}${bytes(item.bytes)}`}</strong></button>)}{!busy && !entries.length && <p>{data.complete && !data.issues ? "目录为空。" : "未读取到子项，请检查权限或重试。"}</p>}</div>{entryDetail}</div>{children}</>}
      {view === "map" && !busy && <div>
        {data.mapItems !== undefined && <p>子项观测合计：{data.complete ? "" : "≥ "}{bytes(total)}，不是可释放空间。</p>}
        <p>选择对象看详情，点击“打开文件夹”进入下层。</p><details className="object-notes"><summary>地图统计说明</summary><p>最大的30项单独展示，其余聚合，“其他”返回列表。面积包含本层全部已观测正占用子项，不含当前目录自身，不代表磁盘占比或可释放量。硬链接只归属首次遇到的位置，APFS克隆可能共享空间。</p></details>
        <div className="object-workspace directory-map-workspace"><div>{data.mapItems === undefined ? <p>旧版结果未包含全层地图，请重新打开目录。</p>
          : rectangles.length === 0 ? <p>没有可绘制的正占用子项；请同时检查覆盖状态。</p>
          : <>
            <div className="directory-map" aria-label="普通目录空间地图">{rectangles.map(({ item, x, y, width, height }) =>
              <button key={item.id} className={`space-cell ${item.tone}`} style={{ left: `${x}%`, top: `${y}%`, width: `${width}%`, height: `${height}%` }}
                disabled={busy} title={`${item.label} · ${bytes(item.bytes)}`} aria-label={`${item.label}，${item.complete ? "" : "至少 "}${bytes(item.bytes)}`} aria-pressed={selected?.id === item.id} onClick={() => choose(item)}>
                {width * height > 150 && <span>{item.label}<br />{bytes(item.bytes)}</span>}
              </button>)}</div>
            <div className="directory-map-list" aria-label="地图等价列表">{objects.map(item =>
              <button key={item.id} className="text-button" aria-pressed={selected?.id === item.id} disabled={busy} onClick={() => choose(item)}>{item.label} · {bytes(item.bytes)}</button>)}</div>
          </>}</div>
        {entryDetail}</div>
      </div>}
      {view === "files" && !busy && <div>
        <p>当前子树保留逻辑大小至少 1 MiB 的最大 100 个普通文件，已观测符合门槛 {data.largeFilesTotal ?? "未知"} 个。筛选仅作用于已保留清单，可能还有其他匹配文件；部分扫描不代表完整排行。</p>
        <details className="object-notes"><summary>文件统计说明</summary><p>只读取元数据，不读取正文。硬链接按身份去重，仅显示首次遇到的路径。逻辑大小与分配块不同，均不代表可释放量；修改时间不是最后使用时间。</p></details>
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
        {!!filtered.length && <div className="object-workspace">
          <div className="object-list"><ul className="directory-files" aria-label="大文件列表">{visibleFiles.map(file => <li key={file.relative}><button className="object-row" aria-label={`选择文件 ${file.relative}`} aria-pressed={file.relative === fileDetail?.relative} onClick={() => { setSelectedFile(file.relative); setError(""); }}><span><strong>{file.relative.split("/").at(-1)}</strong><small>{file.relative}</small></span><strong>{bytes(file.logicalBytes)}</strong></button></li>)}</ul>{filtered.length > visible && <button className="text-button" onClick={() => setVisible(visible + 50)}>再显示 50 个文件</button>}</div>
          {fileDetail && <section className="object-detail" aria-label="大文件详情"><span className="object-policy">只读文件</span><h3>{fileDetail.relative.split("/").at(-1)}</h3><p>只查看文件信息，不提供删除。修改时间不代表最后使用时间。</p><dl><div><dt>文件大小</dt><dd>{bytes(fileDetail.logicalBytes)}</dd></div><div><dt>磁盘占用</dt><dd>{bytes(fileDetail.allocatedBytes)}</dd></div><div><dt>修改时间</dt><dd>{fileDetail.modifiedAt == null ? "未知" : new Date(fileDetail.modifiedAt).toLocaleString()}</dd></div></dl><code className="ai-path">{fileDetail.path}</code><button className="button secondary" disabled={busy || revealing} onClick={() => void reveal(fileDetail.relative)}>{revealing ? "正在定位…" : "在 Finder 中定位"}</button></section>}
        </div>}
        {error && <p role="alert">{error}</p>}
      </div>}
    </section>
  );
}
