import type { RuleEvidence } from "./types";

export default function CleanupEvidence({
  evidence,
}: {
  evidence: RuleEvidence;
}) {
  return (
    <div className="cleanup-evidence">
      <dl>
        <div>
          <dt>识别依据</dt>
          <dd>{evidence.source}</dd>
        </div>
        <div>
          <dt>处理范围</dt>
          <dd>{evidence.scope}</dd>
        </div>
        <div>
          <dt>恢复条件</dt>
          <dd>{evidence.recovery}</dd>
        </div>
      </dl>
      <small>
        独立规则 {evidence.ruleId} · 第 {evidence.version} 版
        {evidence.protected ? " · 已保护默认目录" : ""}
      </small>
    </div>
  );
}
