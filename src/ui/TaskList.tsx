import { MoreHorizontal, Plus, Trash2 } from "lucide-react";
import {
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useI18n } from "../application/i18n";
import { useWorkspace } from "../application/workspace-controller";
import type { CategoryRef, Task, TaskPriority, TaskStatus } from "../domain/schemas";
import { categoryRefKey, taskMap, type WorkspaceSnapshot } from "../domain/workspace";
import { useDirectPointerDrag, useEdgeAutoScroll } from "./use-direct-drag";

const dragType = "application/x-desktop-pull-task";
const dragHoverEvent = "desktop-pull-task-drag-hover";
const priorities: TaskPriority[] = ["P0", "P1", "P2", "P3", "P4", "P5"];

interface TaskListProps {
  workspace: WorkspaceSnapshot;
  categoryRef: CategoryRef;
  status: TaskStatus;
  highlightedTaskId?: string;
  activeTaskStatus: TaskStatus | null;
  onOpen(taskId: string): void;
  onMoved(taskId: string, title: string): void;
  onDragSessionChange(status: TaskStatus | null): void;
  onDragCommitted(categoryRef: CategoryRef, status: TaskStatus): void;
}

interface DragPayload {
  taskId: string;
  status: TaskStatus;
  sourceCategoryKey: string;
  sourceIndex: number;
}

function orderedTasks(
  workspace: WorkspaceSnapshot,
  categoryRef: CategoryRef,
  status: TaskStatus,
): Task[] {
  const tasks = taskMap(workspace);
  const group = workspace.taskOrderByCategory.find(
    (candidate) => categoryRefKey(candidate.categoryRef) === categoryRefKey(categoryRef),
  );
  if (!group) return [];
  return group.taskIds.flatMap((taskId) => {
    const task = tasks.get(taskId);
    return task?.lifecycle.kind === "active" && task.status === status ? [task] : [];
  });
}

function dropCategory(element: Element): CategoryRef {
  const value = element.getAttribute("data-drop-category");
  return value === "inbox"
    ? { kind: "inbox" }
    : { kind: "custom", categoryId: value ?? "" };
}

export function TaskList({
  workspace,
  categoryRef,
  status,
  highlightedTaskId,
  activeTaskStatus,
  onOpen,
  onMoved,
  onDragSessionChange,
  onDragCommitted,
}: TaskListProps) {
  const { createCategory, moveTask, setTaskPriority, setTaskStatus, trashTask } =
    useWorkspace();
  const { errorText, text } = useI18n();
  const tasks = orderedTasks(workspace, categoryRef, status);
  const [touchDragging, setTouchDragging] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [creatingForTaskId, setCreatingForTaskId] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const categoryInputRef = useRef<HTMLInputElement>(null);
  const categoryComposingRef = useRef(false);
  const nativeDragRef = useRef<DragPayload | null>(null);

  useEffect(() => {
    const handleHover = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          categoryKey: string | null;
          status?: TaskStatus;
          index?: number;
        }>
      ).detail;
      if (
        detail.categoryKey === categoryRefKey(categoryRef) &&
        detail.status === status &&
        Number.isInteger(detail.index)
      ) {
        setDropIndex(detail.index as number);
      } else {
        setDropIndex(null);
      }
    };
    window.addEventListener(dragHoverEvent, handleHover);
    return () => window.removeEventListener(dragHoverEvent, handleHover);
  }, [categoryRef, status]);

  function beginCategoryCreate(taskId: string): void {
    setCreatingForTaskId(taskId);
    setNewCategoryName("");
    setCategoryError("");
    requestAnimationFrame(() => categoryInputRef.current?.focus());
  }

  function createAndMove(event: FormEvent, task: Task): void {
    event.preventDefault();
    try {
      createCategory(newCategoryName, task.id);
      setCreatingForTaskId(null);
      setNewCategoryName("");
      setCategoryError("");
      onMoved(task.id, task.title);
    } catch (error) {
      setCategoryError(errorText(error, "无法创建分类", "Unable to create category"));
      requestAnimationFrame(() => categoryInputRef.current?.focus());
    }
  }

  function adjustedDropIndex(payload: DragPayload, target: CategoryRef, index: number) {
    if (
      payload.sourceCategoryKey === categoryRefKey(target) &&
      index > payload.sourceIndex
    ) {
      return index - 1;
    }
    return index;
  }

  function performDrop(payload: DragPayload, element: Element): boolean {
    if (payload.status !== element.getAttribute("data-drop-status")) return false;
    const index = Number(element.getAttribute("data-drop-index"));
    if (!Number.isInteger(index)) return false;
    const target = dropCategory(element);
    const moved = moveTask(
      payload.taskId,
      target,
      adjustedDropIndex(payload, target, index),
    );
    if (moved) onDragCommitted(target, payload.status);
    return moved;
  }

  function notifyHover(payload: DragPayload, x: number, y: number): void {
    const element = document.elementFromPoint(x, y);
    const categoryKey = element
      ?.closest<HTMLElement>("[data-category-key]")
      ?.getAttribute("data-category-key");
    const completedCategoryKey = element
      ?.closest<HTMLElement>("[data-completed-hover-category]")
      ?.getAttribute("data-completed-hover-category");
    const dropTarget = element?.closest<HTMLElement>("[data-drop-category]");
    window.dispatchEvent(
      new CustomEvent(dragHoverEvent, {
        detail: {
          categoryKey: categoryKey ?? null,
          completedCategoryKey: completedCategoryKey ?? null,
          dragStatus: payload.status,
          status: dropTarget?.getAttribute("data-drop-status") ?? undefined,
          index: Number(dropTarget?.getAttribute("data-drop-index")),
        },
      }),
    );
  }

  const nativeAutoScroll = useEdgeAutoScroll((x, y) => {
    const payload = nativeDragRef.current;
    if (payload) notifyHover(payload, x, y);
  });

  function dragStart(event: DragEvent, task: Task, sourceIndex: number): void {
    const payload: DragPayload = {
      taskId: task.id,
      status: task.status,
      sourceCategoryKey: categoryRefKey(categoryRef),
      sourceIndex,
    };
    nativeDragRef.current = payload;
    onDragSessionChange(task.status);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(dragType, JSON.stringify(payload));
  }

  function dragMove(event: DragEvent): void {
    const payload = nativeDragRef.current;
    if (!payload) return;
    notifyHover(payload, event.clientX, event.clientY);
    nativeAutoScroll.update(event.clientX, event.clientY);
  }

  function endDragHover(): void {
    nativeAutoScroll.stop();
    nativeDragRef.current = null;
    onDragSessionChange(null);
    setDropIndex(null);
    window.dispatchEvent(
      new CustomEvent(dragHoverEvent, {
        detail: { categoryKey: null, completedCategoryKey: null },
      }),
    );
  }

  function allowDrop(event: DragEvent, index: number): void {
    if (event.dataTransfer.types.includes(dragType) && activeTaskStatus === status) {
      event.preventDefault();
      setDropIndex(index);
    } else {
      setDropIndex(null);
    }
  }

  function drop(event: DragEvent, index: number): void {
    event.preventDefault();
    const raw = event.dataTransfer.getData(dragType);
    if (!raw) {
      setDropIndex(null);
      return;
    }
    const payload = JSON.parse(raw) as DragPayload;
    if (payload.status !== status) {
      setDropIndex(null);
      return;
    }
    setDropIndex(null);
    if (
      moveTask(
        payload.taskId,
        categoryRef,
        adjustedDropIndex(payload, categoryRef, index),
      )
    ) {
      onDragCommitted(categoryRef, payload.status);
    }
  }

  const pointerDrag = useDirectPointerDrag<DragPayload>({
    onStart: (payload) => {
      setTouchDragging(payload.taskId);
      onDragSessionChange(payload.status);
    },
    onHover: notifyHover,
    onDrop: (payload, x, y) => {
      const target = document.elementFromPoint(x, y)?.closest("[data-drop-category]");
      if (target) performDrop(payload, target);
      setTouchDragging(null);
      endDragHover();
    },
    onCancel: () => {
      setTouchDragging(null);
      endDragHover();
    },
  });

  useEffect(() => {
    window.addEventListener("blur", pointerDrag.abort);
    return () => window.removeEventListener("blur", pointerDrag.abort);
  }, [pointerDrag.abort]);

  function preventComposingSubmit(event: KeyboardEvent<HTMLInputElement>): void {
    if (
      event.key === "Enter" &&
      (categoryComposingRef.current || event.nativeEvent.isComposing)
    ) {
      event.preventDefault();
    }
  }

  if (tasks.length === 0) {
    return (
      <button
        type="button"
        tabIndex={-1}
        className={`empty-list drop-zone ${dropIndex === 0 ? "is-drop-target" : ""}`}
        aria-label={text(
          "空任务列表，可将任务拖到这里",
          "Empty task list; tasks can be dropped here",
        )}
        data-drop-category={
          categoryRef.kind === "inbox" ? "inbox" : categoryRef.categoryId
        }
        data-drop-status={status}
        data-drop-index="0"
        onDragOver={(event) => allowDrop(event, 0)}
        onDrop={(event) => drop(event, 0)}
      >
        {status === "open"
          ? text("这里还没有任务", "No tasks here yet")
          : text("这里还没有已完成任务", "No completed tasks here yet")}
      </button>
    );
  }

  return (
    <ul
      className="task-list"
      aria-label={
        status === "open"
          ? text("未完成任务", "Open tasks")
          : text("已完成任务", "Completed tasks")
      }
    >
      {tasks.map((task, index) => (
        <li
          className={`task-row ${touchDragging === task.id ? "is-dragging" : ""} ${highlightedTaskId === task.id ? "is-highlighted" : ""} ${dropIndex === index ? "is-drop-target" : ""}`}
          key={task.id}
          data-task-id={task.id}
          data-drop-category={
            categoryRef.kind === "inbox" ? "inbox" : categoryRef.categoryId
          }
          data-drop-status={status}
          data-drop-index={index}
          onDragOver={(event) => allowDrop(event, index)}
          onDrop={(event) => drop(event, index)}
        >
          <input
            className="task-checkbox"
            type="checkbox"
            checked={task.status === "completed"}
            aria-label={
              task.status === "open"
                ? text(`完成${task.title}`, `Complete ${task.title}`)
                : text(`重新打开${task.title}`, `Reopen ${task.title}`)
            }
            onChange={() =>
              setTaskStatus(task.id, task.status === "open" ? "completed" : "open")
            }
          />
          <button
            className="task-copy"
            type="button"
            draggable
            onDragStart={(event) => dragStart(event, task, index)}
            onDrag={dragMove}
            onDragEnd={endDragHover}
            onPointerDown={(event) =>
              pointerDrag.start(
                event,
                {
                  taskId: task.id,
                  status: task.status,
                  sourceCategoryKey: categoryRefKey(categoryRef),
                  sourceIndex: index,
                },
                task.title,
              )
            }
            onPointerMove={pointerDrag.move}
            onPointerUp={pointerDrag.end}
            onPointerCancel={pointerDrag.cancel}
            onContextMenu={(event) => {
              if (pointerDrag.isDragging) event.preventDefault();
            }}
            onClick={() => {
              if (!pointerDrag.suppressesClick()) onOpen(task.id);
            }}
          >
            <span className="task-title" data-testid="task-title">
              {task.title}
            </span>
            {task.notes ? <span className="task-notes-preview">{task.notes}</span> : null}
          </button>
          <select
            className={`priority-select priority-${task.priority.toLowerCase()}`}
            aria-label={text(`${task.title}的优先级`, `Priority for ${task.title}`)}
            value={task.priority}
            onChange={(event) =>
              setTaskPriority(task.id, event.currentTarget.value as TaskPriority)
            }
          >
            {priorities.map((priority) => (
              <option key={priority}>{priority}</option>
            ))}
          </select>
          <details className="task-menu">
            <summary
              aria-label={text(`${task.title}菜单`, `Menu for ${task.title}`)}
              title={text("任务菜单", "Task menu")}
            >
              <MoreHorizontal size={18} aria-hidden="true" />
            </summary>
            <div className="task-menu-popover">
              <button type="button" onClick={() => onOpen(task.id)}>
                {text("编辑", "Edit")}
              </button>
              <label>
                <span>{text("移动到", "Move to")}</span>
                <select
                  value={categoryRef.kind === "inbox" ? "inbox" : categoryRef.categoryId}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    if (
                      moveTask(
                        task.id,
                        value === "inbox"
                          ? { kind: "inbox" }
                          : { kind: "custom", categoryId: value },
                        0,
                      )
                    ) {
                      onMoved(task.id, task.title);
                    }
                  }}
                >
                  <option value="inbox">{text("收件箱", "Inbox")}</option>
                  {workspace.categoryOrder.map((categoryId) => {
                    const category = workspace.categories.find(
                      ({ id }) => id === categoryId,
                    );
                    return category ? (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ) : null;
                  })}
                </select>
              </label>
              {creatingForTaskId === task.id ? (
                <form
                  className="task-menu-category-form"
                  onSubmit={(event) => createAndMove(event, task)}
                >
                  <input
                    ref={categoryInputRef}
                    aria-label={text("新分类名称", "New category name")}
                    value={newCategoryName}
                    onChange={(event) => setNewCategoryName(event.currentTarget.value)}
                    onCompositionStart={() => {
                      categoryComposingRef.current = true;
                    }}
                    onCompositionEnd={() => {
                      categoryComposingRef.current = false;
                    }}
                    onKeyDown={preventComposingSubmit}
                  />
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        setCreatingForTaskId(null);
                        setNewCategoryName("");
                        setCategoryError("");
                      }}
                    >
                      {text("取消", "Cancel")}
                    </button>
                    <button type="submit" disabled={newCategoryName.trim().length === 0}>
                      {text("添加", "Add")}
                    </button>
                  </div>
                  {categoryError ? (
                    <span className="field-error">{categoryError}</span>
                  ) : null}
                </form>
              ) : (
                <button type="button" onClick={() => beginCategoryCreate(task.id)}>
                  <Plus size={15} aria-hidden="true" />
                  {text("新建分类并移动", "New category and move")}
                </button>
              )}
              <button
                className="danger-menu-item"
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      text(
                        `将「${task.title}」移入垃圾箱？`,
                        `Move “${task.title}” to Trash?`,
                      ),
                    )
                  )
                    trashTask(task.id);
                }}
              >
                <Trash2 size={15} aria-hidden="true" />
                {text("移入垃圾箱", "Move to Trash")}
              </button>
            </div>
          </details>
        </li>
      ))}
      <li
        className={`task-drop-end ${dropIndex === tasks.length ? "is-drop-target" : ""}`}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label={text("移动到列表末尾", "Move to the end of the list")}
          data-drop-category={
            categoryRef.kind === "inbox" ? "inbox" : categoryRef.categoryId
          }
          data-drop-status={status}
          data-drop-index={tasks.length}
          onDragOver={(event) => allowDrop(event, tasks.length)}
          onDrop={(event) => drop(event, tasks.length)}
        />
      </li>
      {pointerDrag.preview ? (
        <li
          className="drag-preview"
          style={{
            transform: `translate(${pointerDrag.preview.x + 12}px, ${pointerDrag.preview.y + 12}px)`,
          }}
        >
          {pointerDrag.preview.label}
        </li>
      ) : null}
    </ul>
  );
}
