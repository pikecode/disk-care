import { ShieldCheck } from "lucide-react";
import { analyzeCleanup, groupCleanup, cleanupIntentLabels } from "./cleanupEligibility";
import type { CleanupIntent } from "./cleanupEligibility";
import type { Scan } from "./types";

export default function CleanupAnalysis({ scan, disabled, expired, activeIntent, onIntent }: {
  scan: Scan; disabled: boolean; expired: boolean; activeIntent: CleanupIntent; onIntent: (intent: CleanupIntent) => void;
}) {
  const groups = groupCleanup(analyzeCleanup(scan.items));
  return <section className="cleanup-intents" aria-label="可清理空间分析">
    <header><ShieldCheck size={21} /><div><h2>下一步怎么处理</h2><p>先看用途与影响，再决定。检查结果不会自动勾选。</p></div></header>
    {expired && <p className="warning-text" role="status">扫描已超过 30 分钟，请重新检查后预览。</p>}
    {scan.cancelled && <p className="warning-text">检查已停止，结果不完整；仅独立检查完整的缓存可预览。</p>}
    <div className="cleanup-intent-options" role="group" aria-label="按处理意图筛选">
      {(Object.keys(cleanupIntentLabels) as (keyof typeof cleanupIntentLabels)[]).map(intent => <button key={intent} aria-label={cleanupIntentLabels[intent]} aria-pressed={activeIntent === intent} disabled={disabled} onClick={() => onIntent(intent)}><span>{cleanupIntentLabels[intent]}</span><strong>{groups[intent].length}<small>项</small></strong><small>{intent === "clean" ? "已支持的缓存，先预览再确认" : intent === "view" ? "只读查看，由你判断用途" : "已保护、用途未知或暂时不能处理"}</small></button>)}
    </div>
    <div className="cleanup-intent-secondary"><button className="text-button" aria-pressed={activeIntent === "all"} disabled={disabled} onClick={() => onIntent("all")}>查看全部 {scan.items.length} 项</button>{groups.empty.length > 0 && <button className="text-button" aria-pressed={activeIntent === "empty"} disabled={disabled} onClick={() => onIntent("empty")}>未发现占用 {groups.empty.length} 项</button>}</div>
    {groups.clean.length === 0 && <p className="analysis-note">本次未发现可直接预览的缓存，不会扩大清理范围。</p>}
    <p className="cleanup-intent-boundary">占用不等于实际可释放空间。“可以查看”与“需要保留”均不提供清理。</p>
  </section>;
}
