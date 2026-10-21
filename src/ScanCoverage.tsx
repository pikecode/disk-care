import { useState } from "react";
import { api } from "./api";
import type { Coverage, Scan } from "./types";

const labels: Record<Coverage["status"], string> = {
  complete: "已扫描",
  absent: "目录不存在",
  skipped: "主动跳过",
  denied: "访问被拒绝",
  failed: "读取或路径检查失败",
  limited: "达到扫描上限",
  cancelled: "扫描中停止",
  pending: "尚未访问",
};

export default function ScanCoverage({ scan }: { scan: Scan }) {
  const [error, setError] = useState("");
  const all = [...scan.roots, ...scan.items];
  const counts = new Map<string, number>();
  for (const item of all) {
    const label = item.coverage
      ? labels[item.coverage.status]
      : item.complete && item.issues === 0
        ? "已扫描（旧格式）"
        : "未完成（原因未分类）";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const denied = all.some((item) => (item.coverage?.permissionDenied ?? 0) > 0);
  const partial = all.filter((item) => !item.complete || item.issues > 0);
  if (all.length === 0 && !scan.cancelled) return null;
  const incomplete = scan.cancelled || partial.length > 0;
  return (
    <section
      className={`scan-coverage ${incomplete ? "" : "coverage-complete"}`}
      aria-labelledby="scan-coverage-title"
    >
      <h2 id="scan-coverage-title">
        {incomplete ? "本次统计不完整" : "本次扫描覆盖"}
      </h2>
      <p>
        {scan.cancelled
          ? "扫描已停止；已知但未读取的目标标为尚未访问，未发现的位置仍不在清单中，不能根据现有结果判断全部空间。"
          : incomplete
            ? "以下位置未完成统计，显示的占用仅代表已读取部分，不能当作目录的全部占用。"
            : "本次结果仅覆盖所选目标；目录不存在与已读取零占用不同，不代表整台机器没有可处理数据。"}
      </p>
      {counts.size > 0 && (
        <div className="coverage-counts">
          {[...counts].map(([label, count]) => (
            <span key={label}>
              {label} · {count} 个位置
            </span>
          ))}
        </div>
      )}
      {partial.length > 0 && (
        <details>
          <summary>查看 {partial.length} 个统计不完整的位置</summary>
          <ul>
            {partial.map((item) => (
              <li key={item.id}>
                <strong>{item.name}</strong> ·{" "}
                {item.coverage ? labels[item.coverage.status] : "原因未分类"} ·{" "}
                {item.issues} 处读取问题
                {item.coverage && item.coverage.excluded > 0 && (
                  <span>主动跳过 {item.coverage.excluded} 个私有数据边界</span>
                )}
                <code>{item.path}</code>
                <span>
                  {item.blocked ??
                    "未完成统计；请检查访问权限、扫描限额或取消状态。"}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {partial.length > 0 && (
        <details className="coverage-help">
          <summary>为什么不完整？如何处理？</summary>{" "}
          <p>
            扫描器会主动跳过已知的其他应用私有数据目录；这不是系统拒绝，增加授权也不会使这些目录被扫描。
            其余读取失败可能来自权限、文件变化或其他读取错误，未完成也可能由扫描限额或取消造成。
            若系统拒绝访问，可到「隐私与安全性」检查「文件与文件夹」或「完全磁盘访问权限」。
            调整后按系统要求重启应用，再点击「重新扫描」并选择范围；打开设置不会自动重试。
          </p>
          {denied && (
            <button
              className="button secondary"
              onClick={() => {
                setError("");
                void api.privacySettings().catch((e) => setError(String(e)));
              }}
            >
              检查系统访问权限
            </button>
          )}
          {!denied && (
            <p>
              本次没有确认到权限拒绝，不显示授权操作。请先按具体原因检查；旧格式记录未提供错误分类。
            </p>
          )}
        </details>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
