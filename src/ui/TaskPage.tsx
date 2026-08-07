import {
  ChevronDown,
  ChevronRight,
  DatabaseBackup,
  GripVertical,
  Inbox,
  MoreHorizontal,
  Pencil,
  Plus,
  Settings,
  Trash2,
} from "lucide-react";
import { type DragEvent, type FormEvent, useEffect, useRef, useState } from "react";
import { useI18n } from "../application/i18n";
import { useWorkspace } from "../application/workspace-controller";
import type { CategoryRef } from "../domain/schemas";
import { categoryRefKey, taskMap, type WorkspaceSnapshot } from "../domain/workspace";
import { QuickCreate } from "./QuickCreate";
import { DataProtectionNotice } from "./StorageNotice";
import { TaskEditor } from "./TaskEditor";
import { TaskList } from "./TaskList";

const collapseStorageKey = "desktop-pull-collapse-v1";
const taskDragType = "application/x-desktop-pull-task";
const dragHoverEvent = "desktop-pull-task-drag-hover";

function readCollapsePreferences(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(collapseStorageKey) ?? "{}") as Record<
      string,
      boolean
    >;
  } catch {
    return {};
  }
}

interface CategorySectionProps {
  workspace: WorkspaceSnapshot;
  categoryRef: CategoryRef;
  name: string;
  index: number;
  collapsed: Record<string, boolean>;
  locatedTask: { taskId: string; categoryKey: string; completed: boolean } | null;
  setCollapsed(key: string, value: boolean): void;
  onOpen(taskId: string): void;
  onMoved(taskId: string, title: string): void;
}

function CategorySection({
  workspace,
  categoryRef,
  name,
  index,
  collapsed,
  locatedTask,
  setCollapsed,
  onOpen,
  onMoved,
}: CategorySectionProps) {
  const { deleteCategory, renameCategory, reorderCategory } = useWorkspace();
  const { errorText, text } = useI18n();
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(name);
  const [renameError, setRenameError] = useState("");
  const [dragExpanded, setDragExpanded] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const dragExpandTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const key = categoryRefKey(categoryRef);
  const tasks = taskMap(workspace);
  const group = workspace.taskOrderByCategory.find(
    (candidate) => categoryRefKey(candidate.categoryRef) === key,
  );
  const contextualDraft = workspace.drafts.find(
    ({ entry }) =>
      entry.kind === "category" &&
      categoryRefKey(entry.categoryRef) === categoryRefKey(categoryRef),
  );
  const openCount =
    group?.taskIds.filter((taskId) => tasks.get(taskId)?.status === "open").length ?? 0;
  const completedCount =
    group?.taskIds.filter((taskId) => tasks.get(taskId)?.status === "completed").length ??
    0;
  const forcedExpanded = locatedTask?.categoryKey === key;
  const groupCollapsed =
    forcedExpanded || dragExpanded ? false : (collapsed[`group:${key}`] ?? false);
  const completedCollapsed =
    forcedExpanded && locatedTask.completed
      ? false
      : (collapsed[`completed:${key}`] ?? true);

  useEffect(() => {
    if (!renaming) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [renaming]);

  useEffect(() => {
    const handleHover = (event: Event) => {
      const categoryKey = (event as CustomEvent<{ categoryKey: string | null }>).detail
        .categoryKey;
      if (categoryKey === key && groupCollapsed && !dragExpandTimerRef.current) {
        dragExpandTimerRef.current = setTimeout(() => {
          dragExpandTimerRef.current = undefined;
          setDragExpanded(true);
        }, 500);
      } else if (categoryKey !== key) {
        clearTimeout(dragExpandTimerRef.current);
        dragExpandTimerRef.current = undefined;
        if (categoryKey === null) setDragExpanded(false);
      }
    };
    window.addEventListener(dragHoverEvent, handleHover);
    return () => {
      clearTimeout(dragExpandTimerRef.current);
      window.removeEventListener(dragHoverEvent, handleHover);
    };
  }, [groupCollapsed, key]);

  function submitRename(event: FormEvent): void {
    event.preventDefault();
    try {
      renameCategory((categoryRef as { categoryId: string }).categoryId, renameValue);
      setRenaming(false);
      setRenameError("");
    } catch (error) {
      setRenameError(errorText(error, "无法重命名分类", "Unable to rename category"));
    }
  }

  function categoryDragStart(event: DragEvent): void {
    if (categoryRef.kind !== "custom") return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(
      "application/x-desktop-pull-category",
      categoryRef.categoryId,
    );
  }

  function categoryDrop(event: DragEvent): void {
    if (event.dataTransfer.types.includes(taskDragType)) {
      clearTimeout(dragExpandTimerRef.current);
      dragExpandTimerRef.current = undefined;
      setDragExpanded(false);
      return;
    }
    const categoryId = event.dataTransfer.getData("application/x-desktop-pull-category");
    if (!categoryId || categoryRef.kind !== "custom") return;
    event.preventDefault();
    event.stopPropagation();
    reorderCategory(categoryId, index);
  }

  return (
    <section
      className="category-section"
      aria-labelledby={`category-${key}`}
      data-category-key={key}
      onDragOver={(event) => {
        if (
          groupCollapsed &&
          event.dataTransfer.types.includes(taskDragType) &&
          !dragExpandTimerRef.current
        ) {
          dragExpandTimerRef.current = setTimeout(() => {
            dragExpandTimerRef.current = undefined;
            setDragExpanded(true);
          }, 500);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          clearTimeout(dragExpandTimerRef.current);
          dragExpandTimerRef.current = undefined;
        }
      }}
      onDrop={categoryDrop}
    >
      <div className="category-heading">
        <button
          className="icon-button category-collapse"
          type="button"
          aria-label={
            groupCollapsed
              ? text(`展开${name}`, `Expand ${name}`)
              : text(`折叠${name}`, `Collapse ${name}`)
          }
          onClick={() => setCollapsed(`group:${key}`, !groupCollapsed)}
        >
          {groupCollapsed ? (
            <ChevronRight size={18} aria-hidden="true" />
          ) : (
            <ChevronDown size={18} aria-hidden="true" />
          )}
        </button>
        {categoryRef.kind === "custom" ? (
          <button
            className="icon-button category-grip"
            type="button"
            draggable
            aria-label={text(
              `拖动${name}分类；也可用上下方向键排序`,
              `Drag ${name}; you can also reorder it with the arrow keys`,
            )}
            onDragStart={categoryDragStart}
            onDragOver={(event) => {
              if (
                event.dataTransfer.types.includes("application/x-desktop-pull-category")
              ) {
                event.preventDefault();
              }
            }}
            onDrop={categoryDrop}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp") {
                event.preventDefault();
                reorderCategory(categoryRef.categoryId, index - 1);
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                reorderCategory(categoryRef.categoryId, index + 1);
              }
            }}
          >
            <GripVertical size={17} aria-hidden="true" />
          </button>
        ) : (
          <Inbox className="category-icon" size={17} aria-hidden="true" />
        )}
        {renaming && categoryRef.kind === "custom" ? (
          <form className="rename-form" onSubmit={submitRename}>
            <input
              ref={renameInputRef}
              aria-label={text("分类名称", "Category name")}
              value={renameValue}
              onChange={(event) => setRenameValue(event.currentTarget.value)}
              onBlur={() => {
                if (renameValue === name) setRenaming(false);
              }}
            />
            <button className="small-command" type="submit">
              {text("保存", "Save")}
            </button>
          </form>
        ) : (
          <h2 id={`category-${key}`}>{name}</h2>
        )}
        <span className="task-count">{openCount}</span>
        {categoryRef.kind === "custom" ? (
          <div className="category-actions">
            <button
              className="icon-button"
              type="button"
              aria-label={text(`重命名${name}`, `Rename ${name}`)}
              title={text("重命名分类", "Rename category")}
              onClick={() => {
                setRenameValue(name);
                setRenaming(true);
              }}
            >
              <Pencil size={15} aria-hidden="true" />
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label={text(`删除${name}`, `Delete ${name}`)}
              title={text("删除分类", "Delete category")}
              onClick={() => {
                if (
                  window.confirm(
                    contextualDraft
                      ? text(
                          `删除分类「${name}」并丢弃快速创建草稿「${contextualDraft.title}」？其中 ${openCount + completedCount} 个任务将移到收件箱。`,
                          `Delete “${name}” and discard the quick-create draft “${contextualDraft.title}”? ${openCount + completedCount} tasks will move to Inbox.`,
                        )
                      : text(
                          `删除分类「${name}」？其中 ${openCount + completedCount} 个任务将移到收件箱。`,
                          `Delete “${name}”? ${openCount + completedCount} tasks will move to Inbox.`,
                        ),
                  )
                ) {
                  deleteCategory(categoryRef.categoryId);
                }
              }}
            >
              <Trash2 size={15} aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
      {renameError ? <p className="field-error category-error">{renameError}</p> : null}

      {!groupCollapsed ? (
        <div className="category-content">
          <QuickCreate
            contextual
            entry={{ kind: "category", categoryRef }}
            label={name}
          />
          <TaskList
            workspace={workspace}
            categoryRef={categoryRef}
            status="open"
            highlightedTaskId={locatedTask?.taskId}
            onOpen={onOpen}
            onMoved={onMoved}
          />
          {completedCount > 0 ? (
            <section className="completed-section">
              <button
                className="completed-toggle"
                type="button"
                aria-expanded={!completedCollapsed}
                onClick={() => setCollapsed(`completed:${key}`, !completedCollapsed)}
              >
                {completedCollapsed ? (
                  <ChevronRight size={16} aria-hidden="true" />
                ) : (
                  <ChevronDown size={16} aria-hidden="true" />
                )}
                {text("已完成", "Completed")}
                <span>{completedCount}</span>
              </button>
              {!completedCollapsed ? (
                <TaskList
                  workspace={workspace}
                  categoryRef={categoryRef}
                  status="completed"
                  highlightedTaskId={locatedTask?.taskId}
                  onOpen={onOpen}
                  onMoved={onMoved}
                />
              ) : null}
            </section>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function TaskPage() {
  const { createCategory, state } = useWorkspace();
  const { errorText, text } = useI18n();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [moveFeedback, setMoveFeedback] = useState<{
    taskId: string;
    title: string;
  } | null>(null);
  const [collapsed, setCollapsedState] = useState(readCollapsePreferences);
  const [locatedTask, setLocatedTask] = useState<{
    taskId: string;
    categoryKey: string;
    completed: boolean;
  } | null>(null);
  const locationHandledRef = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(collapseStorageKey, JSON.stringify(collapsed));
    } catch {
      // Collapse preferences are optional when local storage is unavailable.
    }
  }, [collapsed]);

  useEffect(() => {
    if (!state.workspace || locationHandledRef.current) return;
    const routerState = window.history.state as {
      usr?: { locateTaskId?: string } | null;
    } | null;
    const taskId = routerState?.usr?.locateTaskId;
    if (!taskId) return;
    locationHandledRef.current = true;
    const task = state.workspace.tasks.find(
      (candidate) => candidate.id === taskId && candidate.lifecycle.kind === "active",
    );
    const group = state.workspace.taskOrderByCategory.find(({ taskIds }) =>
      taskIds.includes(taskId),
    );
    if (!task || !group) return;
    setLocatedTask({
      taskId,
      categoryKey: categoryRefKey(group.categoryRef),
      completed: task.status === "completed",
    });
    window.history.replaceState(
      routerState ? { ...routerState, usr: null } : routerState,
      "",
    );
    setTimeout(() => {
      document
        .querySelector(`[data-task-id="${taskId}"]`)
        ?.scrollIntoView({ block: "center" });
    }, 0);
    const timer = setTimeout(() => setLocatedTask(null), 2400);
    return () => clearTimeout(timer);
  }, [state.workspace]);

  if (state.phase === "loading") {
    return (
      <main className="startup-state" aria-live="polite">
        <span className="loading-indicator" aria-hidden="true" />
        <p>{text("正在读取本地数据...", "Loading local data...")}</p>
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
  const workspace = state.workspace;
  const selectedTask = workspace.tasks.find(({ id }) => id === selectedTaskId);
  const categories = workspace.categoryOrder.flatMap((categoryId) => {
    const category = workspace.categories.find(({ id }) => id === categoryId);
    return category ? [category] : [];
  });

  function setCollapsed(key: string, value: boolean): void {
    setCollapsedState((current) => ({ ...current, [key]: value }));
  }

  function addCategory(event: FormEvent): void {
    event.preventDefault();
    try {
      createCategory(newCategory);
      setNewCategory("");
      setCategoryError("");
    } catch (error) {
      setCategoryError(errorText(error, "无法创建分类", "Unable to create category"));
    }
  }

  function locateTask(taskId: string): void {
    const task = workspace.tasks.find(
      (candidate) => candidate.id === taskId && candidate.lifecycle.kind === "active",
    );
    const group = workspace.taskOrderByCategory.find(({ taskIds }) =>
      taskIds.includes(taskId),
    );
    if (!task || !group) return;
    setLocatedTask({
      taskId,
      categoryKey: categoryRefKey(group.categoryRef),
      completed: task.status === "completed",
    });
    setTimeout(() => {
      document
        .querySelector(`[data-task-id="${taskId}"]`)
        ?.scrollIntoView({ block: "center" });
    }, 0);
    setTimeout(() => setLocatedTask(null), 2400);
  }

  return (
    <main className="task-page">
      <header className="mobile-brand">Desktop Pull</header>
      <div className="task-page-header">
        <div>
          <span className="section-kicker">{text("任务", "Tasks")}</span>
          <h1>{text("我的任务", "My tasks")}</h1>
        </div>
        <details className="task-utility-menu">
          <summary className="icon-button" aria-label={text("更多页面", "More pages")}>
            <MoreHorizontal size={20} aria-hidden="true" />
          </summary>
          <div className="task-utility-menu-popover">
            <a href="#/settings">
              <Settings size={16} aria-hidden="true" />
              {text("设置", "Settings")}
            </a>
            <a href="#/backup">
              <DatabaseBackup size={16} aria-hidden="true" />
              {text("备份", "Backup")}
            </a>
          </div>
        </details>
      </div>
      <QuickCreate />

      <div className="category-list">
        <CategorySection
          workspace={workspace}
          categoryRef={{ kind: "inbox" }}
          name={text("收件箱", "Inbox")}
          index={0}
          collapsed={collapsed}
          locatedTask={locatedTask}
          setCollapsed={setCollapsed}
          onOpen={setSelectedTaskId}
          onMoved={(taskId, title) => setMoveFeedback({ taskId, title })}
        />
        {categories.map((category, index) => (
          <CategorySection
            key={category.id}
            workspace={workspace}
            categoryRef={{ kind: "custom", categoryId: category.id }}
            name={category.name}
            index={index}
            collapsed={collapsed}
            locatedTask={locatedTask}
            setCollapsed={setCollapsed}
            onOpen={setSelectedTaskId}
            onMoved={(taskId, title) => setMoveFeedback({ taskId, title })}
          />
        ))}
      </div>

      {moveFeedback ? (
        <div className="restore-feedback" aria-live="polite">
          <span>
            {text(`已移动「${moveFeedback.title}」`, `Moved “${moveFeedback.title}”`)}
          </span>
          <button type="button" onClick={() => locateTask(moveFeedback.taskId)}>
            {text("查看任务", "View task")}
          </button>
        </div>
      ) : null}

      <form className="new-category-form" onSubmit={addCategory}>
        <Plus size={17} aria-hidden="true" />
        <input
          aria-label={text("新分类名称", "New category name")}
          placeholder={text("新建分类", "New category")}
          value={newCategory}
          onChange={(event) => setNewCategory(event.currentTarget.value)}
        />
        <button type="submit" disabled={newCategory.trim().length === 0}>
          {text("添加", "Add")}
        </button>
      </form>
      {categoryError ? <p className="field-error">{categoryError}</p> : null}

      {selectedTask?.lifecycle.kind === "active" ? (
        <TaskEditor
          task={selectedTask}
          workspace={workspace}
          onClose={() => setSelectedTaskId(null)}
          onShowHistory={(taskId) => {
            window.location.hash = `/history?task=${encodeURIComponent(taskId)}`;
          }}
        />
      ) : null}
    </main>
  );
}
