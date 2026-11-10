import { useEffect, useRef, useState } from "react";
import type { AppExitPreview, AppExitResult } from "./types";

export default function AppExitDialog({ target, onPrepare, onExit, onCancel, onDone }: {
  target: {path: string; bundleId: string};
  onPrepare: (path: string, bundleId: string) => Promise<AppExitPreview>;
  onExit: (token: number, force: boolean) => Promise<AppExitResult>;
  onCancel: () => void; onDone: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const [plan, setPlan] = useState<AppExitPreview | null>(null);
  const [working, setWorking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ack, setAck] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const expired = !!plan && (!Number.isFinite(plan.expiresAt) || clock >= plan.expiresAt);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    dialog.current?.showModal(); cancel.current?.focus();
    let alive = true;
    void onPrepare(target.path, target.bundleId).then(value => { if (alive) setPlan(value); }).catch(e => { if (alive) setError(String(e)); }).finally(() => { if (alive) setLoading(false); });
    const timer = window.setInterval(() => setClock(Date.now()), 500);
    return () => { alive = false; window.clearInterval(timer); if (trigger?.isConnected) trigger.focus(); };
  }, []);
  async function refresh() {
    setLoading(true); setAck(false); setError(""); setPlan(null);
    try { setPlan(await onPrepare(target.path, target.bundleId)); setClock(Date.now()); }
    catch(e) { setError(String(e)); }
    finally { setLoading(false); }
  }
  async function exit(force: boolean) {
    if (!plan || working || expired || (force && (!plan.allowForce || !ack))) return;
    setWorking(true); setAck(false); setError("");
    try {
      const result = await onExit(plan.token, force);
      if (!result.remaining) { onDone(); return; }
      setPlan(result.remaining); setClock(Date.now());
      cancel.current?.focus();
    } catch(e) { setError(String(e)); setPlan(null); }
    finally { setWorking(false); }
  }
  return <dialog ref={dialog} className="uninstall-dialog" aria-labelledby="app-exit-title" onCancel={event => { event.preventDefault(); if (!working) onCancel(); }}>
    <h2 id="app-exit-title">退出应用后继续卸载</h2>
    <p>先退出所选应用及其包内后台组件。退出成功后重新预览卸载，不会自动移到废纸篓。</p>
    <code className="ai-path">{target.path}</code>
    {loading ? <p role="status">正在检查运行组件…</p> : plan && <>
      <h3>{plan.name} · {plan.processes.length} 个运行组件</h3>
      <ul className="app-exit-processes">{plan.processes.map(process => <li key={process.pid}><strong>{process.name}</strong><span>PID {process.pid}</span><code>{process.executable}</code></li>)}</ul>
      {plan.allowForce && <><p role="status">正常退出等待后仍有运行组件。强制退出可能丢失未保存内容，后台组件也可能自动重启。</p><label><input type="checkbox" checked={ack} disabled={working || expired} onChange={event => setAck(event.target.checked)} />我了解强制退出可能丢失未保存内容</label></>}
      {expired && <p role="status">退出预览已过期，请重新检查运行组件。</p>}
    </>}
    {error && <p role="alert">{error}</p>}
    {working && <p role="status">正在请求退出并等待系统结果…</p>}
    <div className="uninstall-actions">
      <button ref={cancel} className="button secondary" disabled={working} onClick={onCancel}>取消</button>
      {!loading && (!plan || expired) && <button className="button secondary" onClick={() => void refresh()}>重新检查运行组件</button>}
      {plan && !expired && <button className="button secondary" disabled={working || loading} onClick={() => void exit(false)}>正常退出并继续</button>}
      {plan?.allowForce && !expired && <button className="button primary" disabled={working || loading || !ack} onClick={() => void exit(true)}>强制退出并继续</button>}
    </div>
  </dialog>;
}
