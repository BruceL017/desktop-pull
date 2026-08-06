import { RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useI18n } from "../application/i18n";
import { useWorkspace } from "../application/workspace-controller";

export function TrashPage() {
  const { permanentlyDeleteTasks, restoreTask, state } = useWorkspace();
  const { locale, text } = useI18n();
  const navigate = useNavigate();
  const [restored, setRestored] = useState<{ taskId: string; title: string } | null>(
    null,
  );
  const [deleteError, setDeleteError] = useState("");
  if (!state.workspace) return null;
  const tasks = state.workspace.tasks
    .filter((task) => task.lifecycle.kind === "trashed")
    .sort((left, right) => {
      if (left.lifecycle.kind !== "trashed" || right.lifecycle.kind !== "trashed") {
        return 0;
      }
      return right.lifecycle.deletedAt.localeCompare(left.lifecycle.deletedAt);
    });

  return (
    <main className="content-page trash-page">
      <header className="mobile-brand">Desktop Pull</header>
      <div className="page-heading">
        <div>
          <span className="section-kicker">{text("恢复", "Recovery")}</span>
          <h1>{text("垃圾箱", "Trash")}</h1>
        </div>
        {tasks.length > 0 ? (
          <button
            className="danger-command"
            type="button"
            disabled={state.pendingCount > 0 || state.degraded}
            onClick={() => {
              if (
                window.confirm(
                  text(
                    `永久删除垃圾箱中的 ${tasks.length} 个任务？此操作无法在当前数据库中恢复。删除前保存的备份仍可能包含这些任务。`,
                    `Permanently delete ${tasks.length} tasks from Trash? This cannot be undone in the current database. Earlier backups may still contain them.`,
                  ),
                )
              ) {
                void permanentlyDeleteTasks(tasks.map(({ id }) => id)).then((deleted) => {
                  if (!deleted) {
                    setDeleteError(
                      text(
                        "当前数据尚未处于可安全清理状态，请完成待保存工作后重试。",
                        "Data is not ready for safe deletion. Finish pending saves and try again.",
                      ),
                    );
                  }
                });
              }
            }}
          >
            <Trash2 size={16} aria-hidden="true" />
            {text("清空垃圾箱", "Empty Trash")}
          </button>
        ) : null}
      </div>

      {tasks.length === 0 ? (
        <div className="page-empty">{text("垃圾箱是空的", "Trash is empty")}</div>
      ) : (
        <ul className="trash-list">
          {tasks.map((task) => {
            if (task.lifecycle.kind !== "trashed") return null;
            const deletionCategory = task.lifecycle.categorySnapshotAtDeletion;
            const source =
              "name" in deletionCategory
                ? deletionCategory.name
                : text("收件箱", "Inbox");
            return (
              <li key={task.id}>
                <div className="trash-copy">
                  <strong>{task.title}</strong>
                  <span>
                    {text("来自", "From ")}
                    {source} ·{" "}
                    {task.status === "open"
                      ? text("未完成", "Open")
                      : text("已完成", "Completed")}
                  </span>
                  <time dateTime={task.lifecycle.expiresAt}>
                    {new Intl.DateTimeFormat(locale, {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    }).format(new Date(task.lifecycle.expiresAt))}
                    {text("后永久清理", " permanent deletion")}
                  </time>
                </div>
                <div className="trash-actions">
                  <button
                    type="button"
                    onClick={() => {
                      if (restoreTask(task.id)) {
                        setRestored({ taskId: task.id, title: task.title });
                      }
                    }}
                  >
                    <RotateCcw size={16} aria-hidden="true" />
                    {text("恢复", "Restore")}
                  </button>
                  <button
                    className="danger-command"
                    type="button"
                    disabled={state.pendingCount > 0 || state.degraded}
                    onClick={() => {
                      if (
                        window.confirm(
                          text(
                            `永久删除「${task.title}」？删除前保存的备份仍可能包含该任务。`,
                            `Permanently delete “${task.title}”? Earlier backups may still contain this task.`,
                          ),
                        )
                      ) {
                        void permanentlyDeleteTasks([task.id]).then((deleted) => {
                          if (!deleted) {
                            setDeleteError(
                              text(
                                "当前数据尚未处于可安全清理状态，请完成待保存工作后重试。",
                                "Data is not ready for safe deletion. Finish pending saves and try again.",
                              ),
                            );
                          }
                        });
                      }
                    }}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                    {text("永久删除", "Permanently delete")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {restored ? (
        <div className="restore-feedback" aria-live="polite">
          <span>
            {text(`已恢复「${restored.title}」`, `Restored “${restored.title}”`)}
          </span>
          <button
            type="button"
            onClick={() => navigate("/", { state: { locateTaskId: restored.taskId } })}
          >
            {text("查看任务", "View task")}
          </button>
        </div>
      ) : null}
      {deleteError ? <p className="field-error">{deleteError}</p> : null}
      <button className="text-command" type="button" onClick={() => navigate("/")}>
        {text("返回任务", "Back to tasks")}
      </button>
    </main>
  );
}
