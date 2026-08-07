import { Download, FileJson, Upload } from "lucide-react";
import { type ChangeEvent, useState } from "react";
import { useNavigate } from "react-router";
import { useI18n } from "../application/i18n";
import { useWorkspace } from "../application/workspace-controller";
import type { WorkspaceSnapshot } from "../domain/workspace";
import { parseBackup } from "../storage/emergency-backup";

export function BackupPage() {
  const { exportBackup, importWorkspace, state } = useWorkspace();
  const { errorText, text } = useI18n();
  const navigate = useNavigate();
  const [candidate, setCandidate] = useState<WorkspaceSnapshot | null>(null);
  const [filename, setFilename] = useState("");
  const [error, setError] = useState("");

  async function selectFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.currentTarget.files?.[0];
    setCandidate(null);
    setError("");
    if (!file) return;
    if (state.cleanupPending) {
      setError(
        text(
          "永久清理尚未完成，暂时不能读取备份文件。",
          "Permanent cleanup is pending. Backup files cannot be read yet.",
        ),
      );
      return;
    }
    try {
      const parsed = parseBackup(JSON.parse(await file.text()));
      setCandidate(parsed);
      setFilename(file.name);
    } catch (cause) {
      setError(errorText(cause, "备份文件无效", "Invalid backup file"));
    }
  }

  if (!state.workspace) return null;
  return (
    <main className="content-page backup-page">
      <header className="mobile-brand">Desktop Pull</header>
      <div className="page-heading">
        <div>
          <span className="section-kicker">{text("可移植数据", "Portable data")}</span>
          <h1>{text("备份", "Backup")}</h1>
        </div>
      </div>

      <section className="backup-section">
        <div className="backup-section-heading">
          <Download size={20} aria-hidden="true" />
          <div>
            <h2>{text("导出完整备份", "Export full backup")}</h2>
            <p>
              {text(
                "文件包含任务、分类、顺序、历史、垃圾箱和未提交草稿，且未加密。",
                "The unencrypted file includes tasks, categories, order, history, Trash, and unsubmitted drafts.",
              )}
            </p>
          </div>
        </div>
        <button
          className="primary-button inline-primary"
          type="button"
          onClick={exportBackup}
        >
          <Download size={17} aria-hidden="true" />
          {text("下载 JSON", "Download JSON")}
        </button>
      </section>

      <section className="backup-section">
        <div className="backup-section-heading">
          <Upload size={20} aria-hidden="true" />
          <div>
            <h2>{text("导入完整备份", "Import full backup")}</h2>
            <p>
              {text(
                "导入会完整替换当前本地数据，不会合并。",
                "Import completely replaces current local data; it does not merge.",
              )}
            </p>
          </div>
        </div>
        <label className={`file-picker${state.cleanupPending ? " is-disabled" : ""}`}>
          <FileJson size={17} aria-hidden="true" />
          {text("选择 JSON 文件", "Choose JSON file")}
          <input
            type="file"
            accept="application/json,.json"
            disabled={state.cleanupPending}
            onChange={selectFile}
          />
        </label>
        {error ? <p className="field-error">{error}</p> : null}
        {candidate ? (
          <div className="import-summary">
            <strong>{filename}</strong>
            <dl>
              <div>
                <dt>{text("任务", "Tasks")}</dt>
                <dd>{candidate.tasks.length}</dd>
              </div>
              <div>
                <dt>{text("分类", "Categories")}</dt>
                <dd>{candidate.categories.length}</dd>
              </div>
              <div>
                <dt>{text("历史", "History")}</dt>
                <dd>{candidate.history.length}</dd>
              </div>
              <div>
                <dt>{text("草稿", "Drafts")}</dt>
                <dd>{candidate.drafts.length}</dd>
              </div>
            </dl>
            <button
              className="danger-command"
              type="button"
              disabled={state.pendingCount > 0 || state.degraded || state.cleanupPending}
              onClick={() => {
                if (state.pendingCount > 0 || state.degraded || state.cleanupPending) {
                  setError(
                    text(
                      "当前数据尚未处于可安全导入状态，请完成待保存或清理工作后重试。",
                      "Data is not ready for a safe import. Finish pending saves or cleanup and try again.",
                    ),
                  );
                  return;
                }
                exportBackup();
                if (
                  !window.confirm(
                    text(
                      "当前完整备份已开始下载。继续后，当前任务、分类、顺序、垃圾箱、历史和草稿将被完整替换，产品内无法撤销。删除前备份可能重新带回后来永久清理的数据。",
                      "A full backup of current data has started downloading. Continuing will completely replace tasks, categories, order, Trash, history, and drafts and cannot be undone in the app. Older backups may restore data that was later permanently deleted.",
                    ),
                  )
                ) {
                  return;
                }
                void importWorkspace(candidate).then((imported) => {
                  if (!imported) {
                    setError(
                      text(
                        "当前数据尚未处于可安全导入状态，请完成待保存工作后重试。",
                        "Data is not ready for a safe import. Finish pending saves and try again.",
                      ),
                    );
                    return;
                  }
                  try {
                    localStorage.removeItem("desktop-pull-collapse-v1");
                  } catch {
                    // Preference cleanup is best-effort after a successful data import.
                  }
                  navigate("/");
                });
              }}
            >
              <Upload size={17} aria-hidden="true" />
              {text("覆盖当前数据", "Replace current data")}
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
