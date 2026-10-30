import type { Coverage } from "./types";

const reasons: Record<string, string> = {
  permissionDenied: "访问被拒绝", ioError: "读取失败", pathCheck: "路径检查失败",
  excluded: "主动排除", link: "符号链接", specialFile: "特殊文件",
  depthLimit: "深度上限", entryLimit: "条目上限", timeLimit: "时间上限",
  cancelled: "已停止", changed: "扫描期间变化", crossDevice: "其他文件系统",
  invalidName: "名称无法分类",
};
// 控制字符按字面显示，避免路径中的换行或制表符掩盖真实名称。
function visible(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]/g, character =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

export default function CoverageDiagnostics({ coverage }: { coverage: Coverage }) {
  const details = coverage.diagnostics?.slice(0, 50) ?? [];
  if (!details.length) return null;
  return (
    <details className="coverage-diagnostics">
      <summary>查看路径与原因（{details.length} 条）</summary>
      <p>每个扫描位置最多展示 50 条；路径和错误可能截短，问题总数以扫描汇总为准。主动跳过或达到上限不代表需要授权。</p>
      <ul tabIndex={0} aria-label="扫描诊断路径列表">{details.map((detail, index) => (
        <li key={index}>
          <strong>{reasons[detail.reason] ?? "未分类原因"}</strong>
          <code className="ai-path" dir="auto">{visible(detail.path)}</code>
          <span>{visible(detail.message)}</span>
        </li>
      ))}</ul>
    </details>
  );
}
