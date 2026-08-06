import { Inbox } from "lucide-react";
import { useWorkspace } from "../application/workspace-controller";
import { QuickCreate } from "./QuickCreate";
import { DataProtectionNotice, PendingCreateNotice } from "./StorageNotice";
import { TaskList } from "./TaskList";

export function TaskPage() {
  const { state } = useWorkspace();

  if (state.phase === "loading") {
    return (
      <main className="startup-state" aria-live="polite">
        <span className="loading-indicator" aria-hidden="true" />
        <p>正在读取本地数据...</p>
      </main>
    );
  }

  if (state.phase === "protection") {
    return (
      <main className="startup-state">
        <DataProtectionNotice />
      </main>
    );
  }

  if (!state.workspace) return null;
  return (
    <div className="app-shell">
      <aside className="side-rail" aria-label="应用">
        <div className="brand-mark">DP</div>
        <div className="brand-name">Desktop Pull</div>
        <div className="active-view" aria-current="page">
          <Inbox size={18} aria-hidden="true" />
          任务
        </div>
      </aside>
      <main className="task-page">
        <header className="mobile-brand">Desktop Pull</header>
        <PendingCreateNotice />
        <section className="task-section" aria-labelledby="inbox-heading">
          <div className="section-heading">
            <div>
              <span className="section-kicker">任务</span>
              <h1 id="inbox-heading">收件箱</h1>
            </div>
            <span className="task-count">
              {state.workspace.taskOrderByCategory[0]?.taskIds.length ?? 0}
            </span>
          </div>
          <QuickCreate />
          <TaskList workspace={state.workspace} />
        </section>
      </main>
    </div>
  );
}
