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
import {
  type DragEvent,
  type FormEvent,
  Fragment,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useI18n } from "../application/i18n";
import { useWorkspace } from "../application/workspace-controller";
import type { CategoryRef } from "../domain/schemas";
import { categoryRefKey, taskMap, type WorkspaceSnapshot } from "../domain/workspace";
import { QuickCreate } from "./QuickCreate";
import { DataProtectionNotice } from "./StorageNotice";
import { TaskEditor } from "./TaskEditor";
import { TaskList } from "./TaskList";
import { useDirectPointerDrag, useEdgeAutoScroll } from "./use-direct-drag";

const collapseStorageKey = "desktop-pull-collapse-v1";
const taskDragType = "application/x-desktop-pull-task";
const categoryDragType = "application/x-desktop-pull-category";
const dragHoverEvent = "desktop-pull-task-drag-hover";
let taskPageScrollY = 0;

interface SessionExpansion {
  group?: boolean;
  completed?: boolean;
}

interface CategoryDragPayload {
  categoryId: string;
  sourceIndex: number;
}

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
  activeTaskStatus: "open" | "completed" | null;
  sessionExpansion?: SessionExpansion;
  locatedTask: { taskId: string; categoryKey: string; completed: boolean } | null;
  setCollapsed(key: string, value: boolean): void;
  onOpen(taskId: string): void;
  onMoved(taskId: string, title: string): void;
  onTaskDragSessionChange(status: "open" | "completed" | null): void;
  onTaskDragCommitted(categoryRef: CategoryRef, status: "open" | "completed"): void;
  onCategoryDragStart(categoryId: string): void;
  onCategoryDragHover(index: number | null): void;
  onCategoryDrop(categoryId: string, sourceIndex: number, targetIndex: number): void;
  onCategoryDragEnd(): void;
}

function CategorySection({
  workspace,
  categoryRef,
  name,
  index,
  collapsed,
  activeTaskStatus,
  sessionExpansion,
  locatedTask,
  setCollapsed,
  onOpen,
  onMoved,
  onTaskDragSessionChange,
  onTaskDragCommitted,
  onCategoryDragStart,
  onCategoryDragHover,
  onCategoryDrop,
  onCategoryDragEnd,
}: CategorySectionProps) {
  const { deleteCategory, endQuickCreateSession, renameCategory } = useWorkspace();
  const { errorText, text } = useI18n();
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(name);
  const [renameError, setRenameError] = useState("");
  const [dragExpanded, setDragExpanded] = useState(false);
  const [completedDragExpanded, setCompletedDragExpanded] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const dragExpandTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const completedExpandTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const nativeCategoryDragRef = useRef<CategoryDragPayload | null>(null);
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
    forcedExpanded || dragExpanded || quickCreateOpen || sessionExpansion?.group
      ? false
      : (collapsed[`group:${key}`] ?? false);
  const completedCollapsed =
    (forcedExpanded && locatedTask.completed) ||
    completedDragExpanded ||
    sessionExpansion?.completed
      ? false
      : (collapsed[`completed:${key}`] ?? true);

  useEffect(() => {
    if (!renaming) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [renaming]);

  useEffect(() => {
    const handleHover = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          categoryKey: string | null;
          completedCategoryKey: string | null;
          dragStatus?: "open" | "completed";
        }>
      ).detail;
      const categoryKey = detail.categoryKey;
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
      if (
        detail.dragStatus === "completed" &&
        detail.completedCategoryKey === key &&
        completedCollapsed &&
        !completedExpandTimerRef.current
      ) {
        completedExpandTimerRef.current = setTimeout(() => {
          completedExpandTimerRef.current = undefined;
          setCompletedDragExpanded(true);
        }, 500);
      } else if (detail.completedCategoryKey !== key) {
        clearTimeout(completedExpandTimerRef.current);
        completedExpandTimerRef.current = undefined;
        if (categoryKey === null) setCompletedDragExpanded(false);
      }
    };
    window.addEventListener(dragHoverEvent, handleHover);
    return () => {
      clearTimeout(dragExpandTimerRef.current);
      clearTimeout(completedExpandTimerRef.current);
      window.removeEventListener(dragHoverEvent, handleHover);
    };
  }, [completedCollapsed, groupCollapsed, key]);

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

  function categoryDropIndexAt(x: number, y: number): number | null {
    const value = document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>("[data-category-drop-index]")
      ?.getAttribute("data-category-drop-index");
    if (value === undefined || value === null) return null;
    const targetIndex = Number(value);
    return Number.isInteger(targetIndex) ? targetIndex : null;
  }

  const nativeCategoryScroll = useEdgeAutoScroll((x, y) => {
    onCategoryDragHover(categoryDropIndexAt(x, y));
  });

  const categoryPointerDrag = useDirectPointerDrag<CategoryDragPayload>({
    onStart: ({ categoryId }) => onCategoryDragStart(categoryId),
    onHover: (_payload, x, y) => onCategoryDragHover(categoryDropIndexAt(x, y)),
    onDrop: (payload, x, y) => {
      const targetIndex = categoryDropIndexAt(x, y);
      if (targetIndex !== null) {
        onCategoryDrop(payload.categoryId, payload.sourceIndex, targetIndex);
      }
      onCategoryDragEnd();
    },
    onCancel: onCategoryDragEnd,
  });

  function categoryDragStart(event: DragEvent): void {
    const startingControl = (event.target as Element).closest(
      "button, input, select, textarea, summary, details, a",
    );
    const startedFromControl =
      startingControl !== null && startingControl !== event.currentTarget;
    if (categoryRef.kind !== "custom" || startedFromControl) {
      event.preventDefault();
      return;
    }
    const payload = { categoryId: categoryRef.categoryId, sourceIndex: index };
    nativeCategoryDragRef.current = payload;
    onCategoryDragStart(categoryRef.categoryId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(categoryDragType, JSON.stringify(payload));
  }

  function categoryDragMove(event: DragEvent): void {
    if (!nativeCategoryDragRef.current) return;
    onCategoryDragHover(categoryDropIndexAt(event.clientX, event.clientY));
    nativeCategoryScroll.update(event.clientX, event.clientY);
  }

  function categoryDragEnd(): void {
    nativeCategoryScroll.stop();
    nativeCategoryDragRef.current = null;
    onCategoryDragEnd();
  }

  function taskDropOnSection(event: DragEvent): void {
    if (event.dataTransfer.types.includes(taskDragType)) {
      clearTimeout(dragExpandTimerRef.current);
      dragExpandTimerRef.current = undefined;
    }
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
      onDrop={taskDropOnSection}
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
        {renaming && categoryRef.kind === "custom" ? (
          <div className="category-drag-region is-static">
            <GripVertical className="category-grip" size={17} aria-hidden="true" />
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
            <span className="task-count">{openCount}</span>
          </div>
        ) : categoryRef.kind === "custom" ? (
          <button
            type="button"
            className="category-drag-region"
            draggable
            aria-label={text(
              `拖动${name}分类；也可用上下方向键排序`,
              `Drag ${name}; you can also reorder it with the arrow keys`,
            )}
            onPointerDown={(event) =>
              categoryPointerDrag.start(
                event,
                { categoryId: categoryRef.categoryId, sourceIndex: index },
                name,
              )
            }
            onPointerMove={categoryPointerDrag.move}
            onPointerUp={categoryPointerDrag.end}
            onPointerCancel={categoryPointerDrag.cancel}
            onContextMenu={(event) => {
              if (categoryPointerDrag.isDragging) event.preventDefault();
            }}
            onDragStart={categoryDragStart}
            onDrag={categoryDragMove}
            onDragEnd={categoryDragEnd}
            onClick={() => {
              if (!categoryPointerDrag.suppressesClick()) {
                setCollapsed(`group:${key}`, !groupCollapsed);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp") {
                event.preventDefault();
                onCategoryDrop(categoryRef.categoryId, index, index - 1);
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                onCategoryDrop(categoryRef.categoryId, index, index + 2);
              }
              if (event.key === "Escape") categoryPointerDrag.abort();
            }}
          >
            <GripVertical className="category-grip" size={17} aria-hidden="true" />
            <h2 className="category-title" id={`category-${key}`}>
              {name}
            </h2>
            <span className="task-count">{openCount}</span>
          </button>
        ) : (
          <div className="category-drag-region is-static">
            <Inbox className="category-icon" size={17} aria-hidden="true" />
            <h2 id={`category-${key}`}>{name}</h2>
            <span className="task-count">{openCount}</span>
          </div>
        )}
        <div className="category-actions">
          <button
            className="icon-button"
            type="button"
            aria-label={text(`在${name}快速添加任务`, `Quickly add a task to ${name}`)}
            title={text("快速添加任务", "Quick add task")}
            onClick={() => {
              if (quickCreateOpen) {
                endQuickCreateSession({ kind: "category", categoryRef });
              }
              setQuickCreateOpen((current) => !current);
            }}
          >
            <Plus size={15} aria-hidden="true" />
          </button>
          {categoryRef.kind === "custom" ? (
            <>
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
            </>
          ) : null}
        </div>
      </div>
      {renameError ? <p className="field-error category-error">{renameError}</p> : null}

      {!groupCollapsed ? (
        <div className="category-content">
          {quickCreateOpen ? (
            <QuickCreate
              autoFocus
              contextual
              entry={{ kind: "category", categoryRef }}
              label={name}
            />
          ) : null}
          <TaskList
            workspace={workspace}
            categoryRef={categoryRef}
            status="open"
            activeTaskStatus={activeTaskStatus}
            highlightedTaskId={locatedTask?.taskId}
            onOpen={onOpen}
            onMoved={onMoved}
            onDragSessionChange={onTaskDragSessionChange}
            onDragCommitted={onTaskDragCommitted}
          />
          {completedCount > 0 || activeTaskStatus === "completed" ? (
            <section className="completed-section">
              <button
                className="completed-toggle"
                type="button"
                aria-expanded={!completedCollapsed}
                data-completed-hover-category={key}
                onDragOver={(event) => {
                  if (activeTaskStatus !== "completed") return;
                  event.preventDefault();
                  if (completedCollapsed && !completedExpandTimerRef.current) {
                    completedExpandTimerRef.current = setTimeout(() => {
                      completedExpandTimerRef.current = undefined;
                      setCompletedDragExpanded(true);
                    }, 500);
                  }
                }}
                onDragLeave={() => {
                  clearTimeout(completedExpandTimerRef.current);
                  completedExpandTimerRef.current = undefined;
                }}
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
                  activeTaskStatus={activeTaskStatus}
                  highlightedTaskId={locatedTask?.taskId}
                  onOpen={onOpen}
                  onMoved={onMoved}
                  onDragSessionChange={onTaskDragSessionChange}
                  onDragCommitted={onTaskDragCommitted}
                />
              ) : null}
            </section>
          ) : null}
        </div>
      ) : null}
      {categoryPointerDrag.preview ? (
        <div
          className="drag-preview"
          style={{
            transform: `translate(${categoryPointerDrag.preview.x + 12}px, ${categoryPointerDrag.preview.y + 12}px)`,
          }}
        >
          {categoryPointerDrag.preview.label}
        </div>
      ) : null}
    </section>
  );
}

export function TaskPage() {
  const { createCategory, reorderCategory, state } = useWorkspace();
  const { errorText, text } = useI18n();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [activeTaskStatus, setActiveTaskStatus] = useState<"open" | "completed" | null>(
    null,
  );
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [categoryDropIndex, setCategoryDropIndex] = useState<number | null>(null);
  const [sessionExpansions, setSessionExpansions] = useState<
    Record<string, SessionExpansion>
  >({});
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
  const newCategoryInputRef = useRef<HTMLInputElement>(null);
  const categoryComposingRef = useRef(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => window.scrollTo(0, taskPageScrollY));
    return () => {
      cancelAnimationFrame(frame);
      taskPageScrollY = window.scrollY;
    };
  }, []);

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
    const separator = key.indexOf(":");
    const kind = key.slice(0, separator);
    const categoryKey = key.slice(separator + 1);
    if (categoryKey) {
      setSessionExpansions((current) => {
        const next = { ...current };
        const expansion = { ...next[categoryKey] };
        if (kind === "group") delete expansion.group;
        if (kind === "completed") delete expansion.completed;
        if (!expansion.group && !expansion.completed) delete next[categoryKey];
        else next[categoryKey] = expansion;
        return next;
      });
    }
    setCollapsedState((current) => ({ ...current, [key]: value }));
  }

  function addCategory(event: FormEvent): void {
    event.preventDefault();
    try {
      createCategory(newCategory);
      setNewCategory("");
      setCategoryError("");
      setAddingCategory(false);
    } catch (error) {
      setCategoryError(errorText(error, "无法创建分类", "Unable to create category"));
    }
  }

  function preventComposingCategorySubmit(event: KeyboardEvent<HTMLInputElement>): void {
    if (
      event.key === "Enter" &&
      (categoryComposingRef.current || event.nativeEvent.isComposing)
    ) {
      event.preventDefault();
    }
  }

  function commitCategoryDrop(
    categoryId: string,
    sourceIndex: number,
    targetMarkerIndex: number,
  ): void {
    const targetIndex =
      targetMarkerIndex > sourceIndex ? targetMarkerIndex - 1 : targetMarkerIndex;
    reorderCategory(categoryId, targetIndex);
    setActiveCategoryId(null);
    setCategoryDropIndex(null);
  }

  function endCategoryDrag(): void {
    setActiveCategoryId(null);
    setCategoryDropIndex(null);
  }

  function expandAfterTaskDrop(
    categoryRef: CategoryRef,
    status: "open" | "completed",
  ): void {
    const key = categoryRefKey(categoryRef);
    setSessionExpansions((current) => ({
      ...current,
      [key]: {
        ...current[key],
        group: true,
        ...(status === "completed" ? { completed: true } : {}),
      },
    }));
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

      <div className={`category-list ${activeCategoryId ? "is-category-dragging" : ""}`}>
        <CategorySection
          workspace={workspace}
          categoryRef={{ kind: "inbox" }}
          name={text("收件箱", "Inbox")}
          index={0}
          collapsed={collapsed}
          activeTaskStatus={activeTaskStatus}
          sessionExpansion={sessionExpansions.inbox}
          locatedTask={locatedTask}
          setCollapsed={setCollapsed}
          onOpen={setSelectedTaskId}
          onMoved={(taskId, title) => setMoveFeedback({ taskId, title })}
          onTaskDragSessionChange={setActiveTaskStatus}
          onTaskDragCommitted={expandAfterTaskDrop}
          onCategoryDragStart={setActiveCategoryId}
          onCategoryDragHover={setCategoryDropIndex}
          onCategoryDrop={commitCategoryDrop}
          onCategoryDragEnd={endCategoryDrag}
        />
        {categories.map((category, index) => (
          <Fragment key={category.id}>
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              className={`category-drop-marker ${categoryDropIndex === index ? "is-active" : ""}`}
              data-category-drop-index={index}
              onDragOver={(event) => {
                if (!event.dataTransfer.types.includes(categoryDragType)) return;
                event.preventDefault();
                setCategoryDropIndex(index);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const raw = event.dataTransfer.getData(categoryDragType);
                if (!raw) return;
                const payload = JSON.parse(raw) as CategoryDragPayload;
                commitCategoryDrop(payload.categoryId, payload.sourceIndex, index);
              }}
            />
            <CategorySection
              workspace={workspace}
              categoryRef={{ kind: "custom", categoryId: category.id }}
              name={category.name}
              index={index}
              collapsed={collapsed}
              activeTaskStatus={activeTaskStatus}
              sessionExpansion={sessionExpansions[`custom:${category.id}`]}
              locatedTask={locatedTask}
              setCollapsed={setCollapsed}
              onOpen={setSelectedTaskId}
              onMoved={(taskId, title) => setMoveFeedback({ taskId, title })}
              onTaskDragSessionChange={setActiveTaskStatus}
              onTaskDragCommitted={expandAfterTaskDrop}
              onCategoryDragStart={setActiveCategoryId}
              onCategoryDragHover={setCategoryDropIndex}
              onCategoryDrop={commitCategoryDrop}
              onCategoryDragEnd={endCategoryDrag}
            />
          </Fragment>
        ))}
        {categories.length > 0 ? (
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className={`category-drop-marker ${categoryDropIndex === categories.length ? "is-active" : ""}`}
            data-category-drop-index={categories.length}
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes(categoryDragType)) return;
              event.preventDefault();
              setCategoryDropIndex(categories.length);
            }}
            onDrop={(event) => {
              event.preventDefault();
              const raw = event.dataTransfer.getData(categoryDragType);
              if (!raw) return;
              const payload = JSON.parse(raw) as CategoryDragPayload;
              commitCategoryDrop(
                payload.categoryId,
                payload.sourceIndex,
                categories.length,
              );
            }}
          />
        ) : null}
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

      {addingCategory ? (
        <form className="new-category-form" onSubmit={addCategory}>
          <Plus size={17} aria-hidden="true" />
          <input
            ref={newCategoryInputRef}
            aria-label={text("新分类名称", "New category name")}
            placeholder={text("新建分类", "New category")}
            value={newCategory}
            onChange={(event) => setNewCategory(event.currentTarget.value)}
            onCompositionStart={() => {
              categoryComposingRef.current = true;
            }}
            onCompositionEnd={() => {
              categoryComposingRef.current = false;
            }}
            onKeyDown={preventComposingCategorySubmit}
          />
          <button
            type="button"
            onClick={() => {
              setAddingCategory(false);
              setNewCategory("");
              setCategoryError("");
            }}
          >
            {text("取消", "Cancel")}
          </button>
          <button type="submit" disabled={newCategory.trim().length === 0}>
            {text("添加", "Add")}
          </button>
        </form>
      ) : (
        <button
          className="new-category-trigger"
          type="button"
          onClick={() => {
            setAddingCategory(true);
            requestAnimationFrame(() => newCategoryInputRef.current?.focus());
          }}
        >
          <Plus size={17} aria-hidden="true" />
          {text("新建分类", "New category")}
        </button>
      )}
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
