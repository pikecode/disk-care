import { useEffect, useRef, useState } from "react";
import { Check, FolderSearch, Layers3, LockKeyhole, X } from "lucide-react";
import { api } from "./api";

export default function ScanAccess({
  root,
  onCancel,
  onStart,
}: {
  root: string | null;
  onCancel: () => void;
  onStart: (extended: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [extended, setExtended] = useState(false);
  const [ack, setAck] = useState(false);
  const [appPath, setAppPath] = useState("");
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const needsConfirmation = extended || root !== null;
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  function select(value: boolean) {
    setExtended(value);
    setAck(false);
    setError("");
  }
  return (
    <dialog
      className="scan-settings"
      ref={dialog}
      onCancel={onCancel}
      aria-labelledby="scan-access-title"
      aria-describedby="scan-access-description"
    >
      <header className="scan-settings-header">
        <div>
          <span className="settings-eyebrow">
            {root === null ? "扫描设置" : "项目分析"}
          </span>
          <h2 id="scan-access-title">
            {root === null ? "选择扫描范围" : "确认项目目录"}
          </h2>
        </div>
        <button
          className="icon-button"
          aria-label="关闭扫描设置"
          onClick={onCancel}
        >
          <X size={20} />
        </button>
      </header>
      <div className="scan-settings-content">
        <p id="scan-access-description" className="settings-intro">
          先分析占用，不会删除文件。清理需要单独预览并确认。
        </p>
        {root === null ? (
          <div className="scope-options" role="group" aria-label="扫描范围">
            <label className={`scope-option ${!extended ? "selected" : ""}`}>
              <input
                type="radio"
                name="scan-scope"
                aria-label="常规扫描：uv、npm、pip 默认缓存"
                checked={!extended}
                onChange={() => select(false)}
              />
              <span className="scope-icon">
                <FolderSearch size={22} />
              </span>
              <span className="scope-option-copy">
                <strong>
                  常规扫描 <small>默认</small>
                </strong>
                <span>检查 uv、npm、pip 默认缓存</span>
                <em>范围小，适合日常检查</em>
              </span>
              <Check
                className="scope-selected-mark"
                size={18}
                aria-hidden="true"
              />
            </label>
            <label className={`scope-option ${extended ? "selected" : ""}`}>
              <input
                type="radio"
                name="scan-scope"
                aria-label="扩展扫描：主要目录与应用数据"
                checked={extended}
                onChange={() => select(true)}
              />
              <span className="scope-icon">
                <Layers3 size={22} />
              </span>
              <span className="scope-option-copy">
                <strong>扩展扫描</strong>
                <span>分析主要目录、下载和模型占用</span>
                <em>覆盖更多，可能需要文件访问权限</em>
              </span>
              <Check
                className="scope-selected-mark"
                size={18}
                aria-hidden="true"
              />
            </label>
          </div>
        ) : (
          <div className="project-scope-path">
            <FolderSearch size={20} />
            <div>
              <strong>本次分析目录</strong>
              <code>{root}</code>
            </div>
          </div>
        )}
        <details className="settings-details" key={root ?? String(extended)}>
          <summary>
            {root !== null
              ? "项目扫描会读取什么？"
              : extended
                ? "查看扩展扫描范围"
                : "查看常规扫描范围"}
          </summary>
          {root !== null ? (
            <p>读取所选目录的项目标记、构建产物和有限配置；同时读取 ~/.ollama/models 默认仓库的模型清单与文件元数据，用于分析占用和引用。不读取模型正文，不执行项目脚本，不支持自定义模型目录。</p>
          ) : extended ? (
            <>
              <p>
                主要目录：<code>~</code>、<code>/Applications</code>、
                <code>/opt</code>、<code>/Library</code>、
                <code>/private/var</code>、
                <code>/System/Volumes/Data/System</code>、
                <code>/Users/Shared</code>、<code>/usr/local</code>。
              </p>
              <p>
                包含开发缓存、下载目录与 Ollama
                模型。跳过常见应用私有数据目录，包括 Library 下的
                Containers、Group Containers、Application Support
                和邮件、消息等目录。Docker、企业微信容器不读取。目录之间存在包含关系，容量不能相加；自定义缓存只分析且遵循相同边界。
              </p>
            </>
          ) : (
            <p>
              <code>~/.cache/uv</code>
              <br />
              <code>~/.npm/_cacache</code>
              <br />
              <code>~/Library/Caches/pip</code>
              <br />
              不遍历主目录、不追踪自定义缓存；清理前重新核对配置。
            </p>
          )}
        </details>
        {needsConfirmation && (
          <>
            <section className="permission-card" aria-label="集中授权指引">
              <div className="permission-card-title">
                <LockKeyhole size={18} />
                <h3>文件访问权限</h3>
                <span>系统授权状态：未验证。</span>
              </div>
              <p>
                需要更完整的结果，可先在系统设置中授权；也可以先扫描可访问的位置。
              </p>
              <div className="permission-card-actions">
                <button
                  className="button secondary"
                  onClick={() => {
                    setError("");
                    void api
                      .privacySettings()
                      .catch((e) => setError(String(e)));
                  }}
                >
                  打开系统设置
                </button>
                <button
                  className="text-button"
                  aria-label="在 Finder 中定位当前应用"
                  disabled={locating}
                  onClick={() => {
                    setError("");
                    setLocating(true);
                    void api
                      .revealApp()
                      .then(setAppPath)
                      .catch((e) => setError(String(e)))
                      .finally(() => setLocating(false));
                  }}
                >
                  {locating ? "正在定位…" : "在 Finder 中定位留白"}
                </button>
              </div>
              {appPath && <code className="access-app-path">{appPath}</code>}
              <details className="settings-details">
                <summary>如何授权？</summary>
                <ol>
                  <li>
                    进入「隐私与安全性 →
                    完全磁盘访问权限」。若按钮未定位目标页，请手动进入。
                  </li>
                  <li>
                    点击「＋」，添加当前使用的留白并开启开关；定位按钮可帮助找到应用，避免选错备份。
                  </li>
                  <li>按系统要求退出并重新打开应用，再手动扫描。</li>
                </ol>
                <p>
                  授权范围较广，请按需开启。打开设置或定位应用不会授予权限，也不会自动开始扫描。
                </p>
              </details>
            </section>
            <label className="settings-confirm">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              我已了解范围与权限要求，继续扫描
            </label>
          </>
        )}
        {error && (
          <p className="settings-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <footer className="scan-settings-footer">
        <span>
          <LockKeyhole size={13} />
          只读分析 · 不自动清理
        </span>
        <div>
          <button className="button secondary" onClick={onCancel}>
            取消
          </button>
          <button
            className="button primary"
            disabled={needsConfirmation && !ack}
            onClick={() => onStart(extended)}
          >
            {root !== null
              ? "开始项目扫描"
              : extended
                ? "开始扩展扫描"
                : "开始常规扫描"}
          </button>
        </div>
      </footer>
    </dialog>
  );
}
