import { Download, RotateCcw } from "lucide-react";
import { useI18n } from "../application/i18n";
import { useWorkspace } from "../application/workspace-controller";

export function DataProtectionNotice() {
  const { retryBootstrap, state } = useWorkspace();
  const { errorText, text } = useI18n();
  return (
    <section className="protection-state" aria-live="polite">
      <div className="protection-mark" aria-hidden="true">
        DP
      </div>
      <h1>{text("本地数据尚未加载", "Local data has not loaded")}</h1>
      <p>
        {text(
          "本地数据没有被改写。读取成功前，任务创建暂不可用。",
          "Local data has not been changed. Task actions remain unavailable until it loads successfully.",
        )}
      </p>
      <p className="technical-message">
        {errorText(
          new Error(state.protectionMessage),
          "无法读取本地数据",
          "Unable to verify and read local data",
        )}
      </p>
      <button className="primary-button" type="button" onClick={retryBootstrap}>
        <RotateCcw size={17} aria-hidden="true" />
        {text("重试加载", "Retry loading")}
      </button>
    </section>
  );
}

export function PendingCreateNotice() {
  const { exportEmergencyBackup, retryCleanup, retryPendingCreates, state } =
    useWorkspace();
  const { text } = useI18n();
  const saving = !state.degraded && state.savingCreates;

  return (
    <>
      {saving ? (
        <p className="saving-line" aria-live="polite">
          {text("正在保存任务...", "Saving changes...")}
        </p>
      ) : null}
      {state.cleanupPending ? (
        <section className="storage-notice storage-notice-global" aria-live="polite">
          <div>
            <strong>
              {text("到期内容清理待完成", "Expired content cleanup pending")}
            </strong>
            <p>
              {text(
                "到期内容已从产品中隐藏，但尚未从当前设备物理清除。系统会自动重试。",
                "Expired content is hidden from the product but has not yet been physically removed from this device. Retries continue automatically.",
              )}
            </p>
          </div>
          <div className="notice-actions">
            <button type="button" onClick={retryCleanup}>
              <RotateCcw size={16} aria-hidden="true" />
              {text("重试清理", "Retry cleanup")}
            </button>
          </div>
        </section>
      ) : null}
      {state.degraded ? (
        <section className="storage-notice storage-notice-global" aria-live="assertive">
          <div>
            <strong>
              {text(
                `${state.pendingCount} 项变更尚未安全保存`,
                `${state.pendingCount} changes are not safely saved`,
              )}
            </strong>
            <p>
              {text(
                "关闭或刷新会丢失这些内存变更。系统会自动按顺序重试。",
                "Closing or refreshing will lose these in-memory changes. Retries continue automatically in order.",
              )}
            </p>
            <p className="privacy-line">
              {text(
                "应急备份包含任务和未提交草稿，文件未加密。",
                "The emergency backup includes tasks and unsubmitted drafts and is not encrypted.",
              )}
            </p>
          </div>
          <div className="notice-actions">
            <button type="button" onClick={retryPendingCreates}>
              <RotateCcw size={16} aria-hidden="true" />
              {text("重试保存", "Retry saving")}
            </button>
            <button type="button" onClick={exportEmergencyBackup}>
              <Download size={16} aria-hidden="true" />
              {text("导出应急备份", "Export emergency backup")}
            </button>
          </div>
        </section>
      ) : null}
    </>
  );
}

export function DraftStorageNotice() {
  const { exportEmergencyBackup, retryDraft, state } = useWorkspace();
  const { text } = useI18n();
  if (!state.draftUnsaved || state.degraded) return null;
  return (
    <div className="draft-notice" aria-live="assertive">
      <div>
        <strong>{text("草稿未保存", "Draft not saved")}</strong>
        <span>
          {text(
            "关闭或刷新可能丢失最新草稿。",
            "Closing or refreshing may lose the latest draft.",
          )}
        </span>
      </div>
      <div className="draft-actions">
        <button type="button" onClick={retryDraft}>
          <RotateCcw size={15} aria-hidden="true" />
          {text("重试草稿", "Retry draft")}
        </button>
        <button type="button" onClick={exportEmergencyBackup}>
          <Download size={15} aria-hidden="true" />
          {text("导出应急备份", "Export emergency backup")}
        </button>
      </div>
      <small>
        {text(
          "备份包含任务和未提交草稿，文件未加密。",
          "The backup includes tasks and unsubmitted drafts and is not encrypted.",
        )}
      </small>
    </div>
  );
}
