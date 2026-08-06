import { Download, RotateCcw } from "lucide-react";
import { useWorkspace } from "../application/workspace-controller";

export function DataProtectionNotice() {
  const { retryBootstrap, state } = useWorkspace();
  return (
    <section className="protection-state" aria-live="polite">
      <div className="protection-mark" aria-hidden="true">
        DP
      </div>
      <h1>本地数据尚未加载</h1>
      <p>本地数据没有被改写。读取成功前，任务创建暂不可用。</p>
      <p className="technical-message">{state.protectionMessage}</p>
      <button className="primary-button" type="button" onClick={retryBootstrap}>
        <RotateCcw size={17} aria-hidden="true" />
        重试加载
      </button>
    </section>
  );
}

export function PendingCreateNotice() {
  const { exportEmergencyBackup, retryPendingCreates, state } = useWorkspace();
  if (!state.degraded) {
    return state.savingCreates ? (
      <p className="saving-line" aria-live="polite">
        正在保存任务...
      </p>
    ) : null;
  }

  return (
    <section className="storage-notice storage-notice-global" aria-live="assertive">
      <div>
        <strong>{state.pendingCount} 项变更尚未安全保存</strong>
        <p>关闭或刷新会丢失这些内存变更。系统会自动按顺序重试。</p>
        <p className="privacy-line">应急备份包含任务和未提交草稿，文件未加密。</p>
      </div>
      <div className="notice-actions">
        <button type="button" onClick={retryPendingCreates}>
          <RotateCcw size={16} aria-hidden="true" />
          重试保存
        </button>
        <button type="button" onClick={exportEmergencyBackup}>
          <Download size={16} aria-hidden="true" />
          导出应急备份
        </button>
      </div>
    </section>
  );
}

export function DraftStorageNotice() {
  const { exportEmergencyBackup, retryDraft, state } = useWorkspace();
  if (!state.draftUnsaved || state.degraded) return null;
  return (
    <div className="draft-notice" aria-live="assertive">
      <div>
        <strong>草稿未保存</strong>
        <span>关闭或刷新可能丢失最新草稿。</span>
      </div>
      <div className="draft-actions">
        <button type="button" onClick={retryDraft}>
          <RotateCcw size={15} aria-hidden="true" />
          重试草稿
        </button>
        <button type="button" onClick={exportEmergencyBackup}>
          <Download size={15} aria-hidden="true" />
          导出应急备份
        </button>
      </div>
      <small>备份包含任务和未提交草稿，文件未加密。</small>
    </div>
  );
}
