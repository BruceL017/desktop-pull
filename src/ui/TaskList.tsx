import type { WorkspaceSnapshot } from "../domain/workspace";
import { inboxTasks } from "../domain/workspace";

export function TaskList({ workspace }: { workspace: WorkspaceSnapshot }) {
  const tasks = inboxTasks(workspace).filter(
    ({ lifecycle, status }) => lifecycle.kind === "active" && status === "open",
  );

  if (tasks.length === 0) {
    return (
      <div className="empty-list">
        <p>收件箱是空的</p>
      </div>
    );
  }

  return (
    <ul className="task-list" aria-label="收件箱任务">
      {tasks.map((task) => (
        <li className="task-row" key={task.id}>
          <span className="task-status-dot" aria-hidden="true" />
          <span className="task-title" data-testid="task-title">
            {task.title}
          </span>
          <span className="task-priority">{task.priority}</span>
        </li>
      ))}
    </ul>
  );
}
