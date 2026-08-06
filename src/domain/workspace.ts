import type { backupDataSchema, CategoryRef, DraftEntry, Task } from "./schemas";

export type WorkspaceSnapshot = ReturnType<typeof backupDataSchema.parse>;

export const inboxCategoryRef: CategoryRef = { kind: "inbox" };
export const globalDraftEntry: DraftEntry = { kind: "global" };

export function categoryRefKey(categoryRef: CategoryRef): string {
  return categoryRef.kind === "inbox" ? "inbox" : `custom:${categoryRef.categoryId}`;
}

export function draftEntryKey(entry: DraftEntry): string {
  if (entry.kind === "global") return "global";
  return `category:${categoryRefKey(entry.categoryRef)}`;
}

export function sameDraftEntry(left: DraftEntry, right: DraftEntry): boolean {
  return draftEntryKey(left) === draftEntryKey(right);
}

export function emptyWorkspace(): WorkspaceSnapshot {
  return {
    meta: { nextOperationSequence: "1" },
    categories: [],
    tasks: [],
    categoryOrder: [],
    taskOrderByCategory: [
      {
        categoryRef: { kind: "inbox" },
        taskIds: [],
      },
    ],
    drafts: [],
    history: [],
  };
}

export function taskMap(workspace: WorkspaceSnapshot): Map<string, Task> {
  return new Map(workspace.tasks.map((task) => [task.id, task]));
}

export function inboxTasks(workspace: WorkspaceSnapshot): Task[] {
  const tasks = taskMap(workspace);
  const inbox = workspace.taskOrderByCategory.find(
    ({ categoryRef }) => categoryRef.kind === "inbox",
  );
  if (!inbox) throw new Error("收件箱顺序缺失");
  return inbox.taskIds.map((id) => {
    const task = tasks.get(id);
    if (!task) throw new Error(`任务顺序引用未知任务: ${id}`);
    return task;
  });
}
