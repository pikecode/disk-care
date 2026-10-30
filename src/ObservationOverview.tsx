import type { AiReport, ProjectReport } from "./types";
import { bytes } from "./format";

export default function ObservationOverview({ project, ai, onNavigate }: {
  project: ProjectReport | null; ai: AiReport[] | null;
  onNavigate: (view: "projects" | "ai") => void;
}) {
  const model = project?.modelStorage;
  return <section className="observation-overview" aria-label="独立空间账本">
    <div className="section-heading"><h2>独立空间账本</h2><span>复用最近观测，不自动扫描</span></div>
    <p>各账本可能重叠，统计时间和范围不同，不相加。这里的占用不等于可回收量；文件变化后请到对应页面重新分析。</p>
    <div className="observation-grid">
      <article><h3>项目产物</h3>
        <strong>{project ? bytes(project.projects.reduce((sum, p) => sum + p.artifacts.reduce((n, a) => n + a.bytes, 0), 0)) : "尚未分析"}</strong>
        {project && <><p>{project.complete && !project.cancelled && project.issues === 0 ? "范围内统计完成" : "部分观测"} · {new Date(project.measuredAt).toLocaleString()}</p><code>{project.root}</code><p>已识别产物，跨项目硬链接／克隆可能重复。</p></>}
        <button className="text-button" onClick={() => onNavigate("projects")}>查看项目账本</button>
      </article>
      <article><h3>Ollama 模型</h3><strong>{model ? bytes(model.allocatedBytes) : "尚未分析"}</strong>
        {model && <><p>{model.status === "complete" ? "范围内统计完成" : model.status === "absent" ? "目录不存在" : "部分观测"} · {new Date(model.measuredAt).toLocaleString()}</p><code>{model.root}</code><p>分配块观测，模型可能共享数据。</p></>}
        <button className="text-button" onClick={() => onNavigate("projects")}>查看模型账本</button>
      </article>
      <article><h3>AI 工作数据</h3>
        {!ai?.length && <strong>尚未取得工具报告</strong>}
        {ai?.map((report) => <div key={`${report.tool}-${report.root}`}><strong>{report.tool} · {report.allocatedBytes == null ? "统计未知" : bytes(report.allocatedBytes)}</strong><p>{report.coverage.status === "complete" ? "范围内统计完成" : "部分／未取得观测"} · {new Date(report.measuredAt).toLocaleString()}</p><code>{report.root}</code></div>)}
        <p>各工具单独列示，包含受保护数据。</p>
        <button className="text-button" onClick={() => onNavigate("ai")}>查看 AI 账本与基线</button>
      </article>
    </div>
  </section>;
}
