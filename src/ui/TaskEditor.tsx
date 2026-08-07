import { Archive, Check, History, Plus, Trash2, X } from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useI18n } from "../application/i18n";
import { useWorkspace } from "../application/workspace-controller";
import type { CategoryRef, Task, TaskPriority } from "../domain/schemas";
import type { WorkspaceSnapshot } from "../domain/workspace";

const priorities: TaskPriority[] = ["P0", "P1", "P2", "P3", "P4", "P5"];

interface TaskEditorProps {
  task: Task;
  workspace: WorkspaceSnapshot;
  onClose(): void;
  onShowHistory(taskId: string): void;
}

export function TaskEditor({ task, workspace, onClose, onShowHistory }: TaskEditorProps) {
  const {
    createCategory,
    moveTask,
    setTaskPriority,
    setTaskStatus,
    state,
    trashTask,
    updateTaskContent,
  } = useWorkspace();
  const { errorText, text } = useI18n();
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const [error, setError] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "pending">(
    "idle",
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const categoryInputRef = useRef<HTMLInputElement>(null);
  const categoryComposingRef = useRef(false);

  const save = useCallback((): boolean => {
    clearTimeout(timerRef.current);
    if (title.trim().length === 0) {
      setError(text("标题不能为空", "Title cannot be empty"));
      if (notes !== task.notes) {
        updateTaskContent(task.id, task.title, notes);
        setSaveStatus("saving");
      }
      return false;
    }
    setError("");
    if (title !== task.title || notes !== task.notes) {
      updateTaskContent(task.id, title, notes);
      setSaveStatus("saving");
    }
    return true;
  }, [notes, task.id, task.notes, task.title, text, title, updateTaskContent]);

  useEffect(() => {
    clearTimeout(timerRef.current);
    if (title === task.title && notes === task.notes) return;
    timerRef.current = setTimeout(save, 600);
    return () => clearTimeout(timerRef.current);
  }, [notes, save, task.notes, task.title, title]);

  useEffect(() => {
    clearTimeout(savedTimerRef.current);
    if (state.degraded && saveStatus !== "idle") {
      setSaveStatus("pending");
      return;
    }
    if (saveStatus === "saving" && state.pendingCount === 0) {
      setSaveStatus("saved");
      savedTimerRef.current = setTimeout(() => setSaveStatus("idle"), 1400);
    }
    return () => clearTimeout(savedTimerRef.current);
  }, [saveStatus, state.degraded, state.pendingCount]);

  function close(): void {
    save();
    onClose();
  }

  function currentCategoryValue(): string {
    const group = workspace.taskOrderByCategory.find(({ taskIds }) =>
      taskIds.includes(task.id),
    );
    if (!group || group.categoryRef.kind === "inbox") return "inbox";
    return group.categoryRef.categoryId;
  }

  function changeCategory(value: string): void {
    save();
    const ref: CategoryRef =
      value === "inbox" ? { kind: "inbox" } : { kind: "custom", categoryId: value };
    moveTask(task.id, ref, 0);
  }

  function createAndMove(event: FormEvent): void {
    event.preventDefault();
    save();
    try {
      createCategory(newCategoryName, task.id);
      setAddingCategory(false);
      setNewCategoryName("");
      setCategoryError("");
    } catch (cause) {
      setCategoryError(errorText(cause, "无法创建分类", "Unable to create category"));
      requestAnimationFrame(() => categoryInputRef.current?.focus());
    }
  }

  function preventComposingSubmit(event: KeyboardEvent<HTMLInputElement>): void {
    if (
      event.key === "Enter" &&
      (categoryComposingRef.current || event.nativeEvent.isComposing)
    ) {
      event.preventDefault();
    }
  }

  return (
    <div className="editor-backdrop">
      <button
        className="editor-backdrop-dismiss"
        type="button"
        aria-label={text("关闭任务详情", "Close task details")}
        onClick={close}
      />
      <aside
        className="task-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-editor-title"
      >
        <header className="editor-header">
          <span id="task-editor-title">{text("任务详情", "Task details")}</span>
          <span className={`editor-save-status is-${saveStatus}`} aria-live="polite">
            {saveStatus === "saving" ? text("保存中...", "Saving...") : null}
            {saveStatus === "saved" ? text("已保存", "Saved") : null}
            {saveStatus === "pending" ? text("待保存", "Pending save") : null}
          </span>
          <button
            className="icon-button"
            type="button"
            aria-label={text("关闭", "Close")}
            onClick={close}
          >
            <X size={19} aria-hidden="true" />
          </button>
        </header>

        <div className="editor-body">
          <label className="field-label" htmlFor="task-title-input">
            {text("标题", "Title")}
          </label>
          <textarea
            id="task-title-input"
            className="title-editor"
            rows={2}
            maxLength={1000}
            value={title}
            aria-invalid={error !== ""}
            onChange={(event) => {
              setTitle(event.currentTarget.value);
              setSaveStatus("saving");
            }}
            onBlur={save}
          />
          {error ? <p className="field-error">{error}</p> : null}

          <label className="field-label" htmlFor="task-notes-input">
            {text("备注", "Notes")}
          </label>
          <textarea
            id="task-notes-input"
            className="notes-editor"
            rows={8}
            value={notes}
            onChange={(event) => {
              setNotes(event.currentTarget.value);
              setSaveStatus("saving");
            }}
            onBlur={save}
          />

          <div className="editor-fields">
            <label>
              <span>{text("优先级", "Priority")}</span>
              <select
                aria-label={text("优先级", "Priority")}
                value={task.priority}
                onChange={(event) => {
                  save();
                  setTaskPriority(task.id, event.currentTarget.value as TaskPriority);
                }}
              >
                {priorities.map((priority) => (
                  <option key={priority}>{priority}</option>
                ))}
              </select>
            </label>
            <label>
              <span>{text("分类", "Category")}</span>
              <select
                aria-label={text("分类", "Category")}
                value={currentCategoryValue()}
                onChange={(event) => changeCategory(event.currentTarget.value)}
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
          </div>

          {addingCategory ? (
            <form className="editor-category-form" onSubmit={createAndMove}>
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
                    setAddingCategory(false);
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
              {categoryError ? <p className="field-error">{categoryError}</p> : null}
            </form>
          ) : (
            <button
              className="editor-command"
              type="button"
              onClick={() => {
                setAddingCategory(true);
                setCategoryError("");
                requestAnimationFrame(() => categoryInputRef.current?.focus());
              }}
            >
              <Plus size={17} aria-hidden="true" />
              {text("新建分类并移动", "New category and move")}
            </button>
          )}

          <button
            className="editor-command"
            type="button"
            onClick={() => {
              save();
              setTaskStatus(task.id, task.status === "open" ? "completed" : "open");
            }}
          >
            {task.status === "open" ? (
              <Check size={17} aria-hidden="true" />
            ) : (
              <Archive size={17} aria-hidden="true" />
            )}
            {task.status === "open"
              ? text("标记为已完成", "Mark as completed")
              : text("重新打开", "Reopen")}
          </button>
          <button
            className="editor-command"
            type="button"
            onClick={() => {
              save();
              onShowHistory(task.id);
            }}
          >
            <History size={17} aria-hidden="true" />
            {text("查看历史", "View history")}
          </button>
        </div>

        <footer className="editor-footer">
          <button
            className="danger-command"
            type="button"
            onClick={() => {
              const validTitle = title.trim().length > 0 ? title : task.title;
              save();
              if (
                !window.confirm(
                  text(
                    `将「${validTitle}」移入垃圾箱？`,
                    `Move “${validTitle}” to Trash?`,
                  ),
                )
              ) {
                return;
              }
              trashTask(task.id);
              onClose();
            }}
          >
            <Trash2 size={17} aria-hidden="true" />
            {text("移入垃圾箱", "Move to Trash")}
          </button>
        </footer>
      </aside>
    </div>
  );
}
