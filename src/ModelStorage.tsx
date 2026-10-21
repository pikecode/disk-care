import { useState } from "react";
import { bytes } from "./format";
import type { ProjectReport } from "./types";

function ModelBlocks({ blocks }: {
  blocks: NonNullable<ProjectReport["modelStorage"]>["blocks"];
}) {
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(50);
  return (
    <details onToggle={e => {
      setOpen(e.currentTarget.open);
      if (!e.currentTarget.open) setLimit(50);
    }}>
      <summary>查看文件块依据（{blocks.length}）</summary>
      {open && <>
        <ul className="model-block-list">
          {blocks.slice(0, limit).map(b => <li key={b.id}>
            <code>{b.digests[0]}</code>
            <span>{bytes(b.allocatedBytes)} · 本次关联 {b.modelIds.length} 个模型{b.externalLinks ? " · 另有未归属硬链接" : ""}</span>
          </li>)}
        </ul>
        {blocks.length > limit && <button className="button secondary" onClick={() => setLimit(limit + 50)}>更多文件块</button>}
      </>}
    </details>
  );
}

export default function ModelStorage({ report, onProject }: {
  report: ProjectReport;
  onProject: (path: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(20);
  const storage = report.modelStorage;
  if (!storage) return null;
  const models = storage.models.filter(m => m.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <details className="model-storage">
      <summary>
        <span><strong>本地模型空间账本</strong><small>Ollama 默认目录 · 只读</small></span>
        <span>{storage.status === "absent" ? "默认目录未发现" : `${storage.status === "cancelled" ? "已停止 · " : storage.complete ? "" : "统计不完整 · "}${storage.models.length} 个模型 · ${storage.complete ? "" : "已观测 "}${bytes(storage.allocatedBytes)}`}</span>
      </summary>
      <div className="model-storage-body">
        <p>按文件身份去重的关联文件占用，不含未被清单引用的文件、清单本身和目录开销。单模型关联占用包含共享文件，不能跨模型相加，也不计入项目产物。</p>
        <code>{storage.root}</code>
        <p>仅检查默认目录，不支持自定义仓库；没有发现不代表没有模型。分配空间不等于物理独占空间，APFS 克隆和扫描期间的文件变化可能影响结果。</p>
        {!storage.complete && <p className="project-warning" role="status">{storage.status === "cancelled" ? "模型分析已停止" : "模型统计不完整"}：数字只代表已观测部分，不判断独占占用。已发现的共享关系也可能遗漏。</p>}
        {storage.status !== "absent" && <div className="model-storage-totals">
          <span>去重分配空间<strong>{bytes(storage.allocatedBytes)}</strong></span>
          <span>去重逻辑大小<strong>{bytes(storage.logicalBytes)}</strong></span>
          <span>已测量文件块<strong>{storage.blocks.length}</strong></span>
        </div>}
        {storage.models.length > 0 && <>
          <input aria-label="搜索本地模型" placeholder="搜索模型名称" value={query} onChange={e => {setQuery(e.target.value);setLimit(20);}} />
          <div className="model-storage-list">
            {models.slice(0, limit).map(model => {
              const refs = report.projects.filter(p => model.referenceName && p.evidence.some(e => e.kind === "model" && e.model === model.referenceName));
              const blocks = storage.blocks.filter(b => model.blockIds.includes(b.id));
              return <details className="model-storage-row" key={model.id}>
                <summary><strong>{model.name}</strong><span>{model.complete ? "关联占用" : "已观测"} {bytes(model.allocatedBytes)}</span></summary>
                <dl>
                  <div><dt>已发现共享占用</dt><dd>{bytes(model.sharedBytes)}</dd></div>
                  <div><dt>本次清单范围内独占占用</dt><dd>{storage.complete && model.exclusiveBytes !== null ? bytes(model.exclusiveBytes) : "无法确认"}</dd></div>
                  <div><dt>逻辑大小</dt><dd>{bytes(model.logicalBytes)}</dd></div>
                </dl>
                <p>独占仅表示在本次完整读取的默认仓库中未发现其他模型引用；不是未使用或可安全删除的证明。</p>
                {blocks.some(b => b.externalLinks) && <p>发现未归属的硬链接，无法确认独占占用。</p>}
                <h4>项目配置引用</h4>
                {refs.length ? <div className="model-project-links">{refs.map(p => <button className="text-button" key={p.path} title={p.path} onClick={() => onProject(p.path)}>{p.name} · 查看关系</button>)}</div> : <p>本次项目范围内未发现配置引用，不代表没有依赖。</p>}
                {!report.complete && <p>项目扫描不完整，引用可能遗漏。</p>}
                <ModelBlocks blocks={blocks} />
              </details>;
            })}
          </div>
          {models.length === 0 && <p>没有匹配的模型。</p>}
          {models.length > limit && <button className="button secondary" onClick={() => setLimit(limit + 20)}>更多模型</button>}
        </>}
        {storage.status === "complete" && storage.models.length === 0 && <p>本次清单中未发现模型，不代表仓库没有其他文件。</p>}
        {storage.issues.length > 0 && <details><summary>查看模型读取问题（最多显示 64 条）</summary><ul>{storage.issues.map((item,i) => <li key={i}><code>{item.path}</code><span>{item.message}</span></li>)}</ul></details>}
      </div>
    </details>
  );
}
