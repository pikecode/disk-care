import { ArrowRight, Folder, FolderSearch } from "lucide-react";
import type { Item } from "./types";
import { bytes } from "./format";

export default function SpaceHome({ desktop, busy, choosing, folder, acknowledged, onAcknowledge, onChoose, onAnalyze, roots, onBrowse }: {
  desktop: boolean; busy: boolean; choosing: boolean; folder: Item | null;
  acknowledged: boolean; onAcknowledge: (value: boolean) => void;
  onChoose: () => void; onAnalyze: () => void; roots: Item[]; onBrowse: (item: Item) => void;
}) {
  return <section className="space-home" aria-label="文件夹空间分析">
    <section className="space-folder" aria-label="独立文件夹分析">
      <FolderSearch size={30} strokeWidth={1.5} aria-hidden="true" />
      <div className="space-folder-heading"><h2>找出文件夹里的大项</h2><p>选择一个文件夹，查看占用分布和大文件。只查看，不删除。</p></div>
      <button className={`button ${folder ? "secondary" : "primary"}`} disabled={!desktop || busy} onClick={onChoose}>{choosing ? "正在选择…" : "选择文件夹"}</button>
      {folder && <div className="folder-analysis-scope"><strong>{folder.name}</strong><code>{folder.path}</code><p>仅检查所选目录的文件名、大小等信息，跳过链接、跨设备及已知私有目录。可能需要系统访问权限。</p><label><input type="checkbox" checked={acknowledged} disabled={busy} onChange={e => onAcknowledge(e.target.checked)} />我已确认此目录的只读分析范围</label><button className="button primary" disabled={!desktop || busy || !acknowledged} onClick={onAnalyze}>分析所选目录</button></div>}
    </section>
    {roots.length > 0 && <section className="space-recent" aria-label="最近扫描的位置"><h2>最近扫描的位置</h2><p>来自上次检查；文件变化后需要重新分析。占用不代表可释放空间。</p>{roots.slice().sort((a, b) => b.bytes - a.bytes).map(item => <button key={item.id} disabled={!desktop || busy || !item.bytes} onClick={() => onBrowse(item)}><Folder size={18} /><span><strong>{item.name}</strong><small>{item.complete && !item.issues ? "已观测" : "部分统计"}</small></span><strong>{!item.complete || item.issues ? "≥ " : ""}{bytes(item.bytes)}</strong><ArrowRight size={15} /></button>)}</section>}
  </section>;
}
