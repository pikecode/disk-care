import { useEffect, useState } from "react";
import type { Scan } from "./types";

export function ScanWait({ phase }: { phase: string }) {
  const [started] = useState(() => performance.now());
  const [phaseStarted, setPhaseStarted] = useState(started);
  const [now, setNow] = useState(started);
  useEffect(() => { setPhaseStarted(performance.now()); }, [phase]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(performance.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <span className="scan-wait" role="timer" aria-live="off">本次等待 {Math.max(0, Math.floor((now - started) / 1000))} 秒 · 当前阶段 {Math.max(0, Math.floor((now - phaseStarted) / 1000))} 秒</span>;
}

export default function ScanTiming({ scan }: { scan: Scan }) {
  if (!scan.timings?.length) return null;
  return <details className="scan-timings">
    <summary>查看扫描阶段耗时</summary>
    <p>本次后端总耗时 {(scan.durationMs / 1000).toFixed(1)} 秒，包含准备与结果收尾。各阶段可能重复遍历重叠范围；耗时不表示完整性，也不是预计剩余时间。</p>
    <ul aria-label="扫描阶段耗时列表">{scan.timings.map((stage) => <li key={stage.id}><span>{stage.name}</span><strong>{stage.durationMs == null ? "尚未访问" : `${(stage.durationMs / 1000).toFixed(1)} 秒`}</strong></li>)}</ul>
  </details>;
}
