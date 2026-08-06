import {
  type CategoryRef,
  type CategorySnapshot,
  type DraftRecord,
  draftSchema,
  type Task,
  type TaskCreatedEvent,
  taskCreatedEventSchema,
  taskSchema,
  utcTimeSchema,
  uuidV4Schema,
} from "./schemas";
import {
  categoryRefKey,
  draftEntryKey,
  sameDraftEntry,
  taskMap,
  type WorkspaceSnapshot,
} from "./workspace";

export interface CreateTaskIntent {
  kind: "create-task";
  submissionId: string;
  task: Task;
  history: TaskCreatedEvent;
  targetCategoryRef: CategoryRef;
  expectedTaskIds: string[];
  resultTaskIds: string[];
  expectedOperationSequence: string;
  nextOperationSequence: string;
  consumedDraft: Pick<DraftRecord, "entry" | "generation">;
}

interface FreezeCreateIntentInput {
  workspace: WorkspaceSnapshot;
  draft: DraftRecord;
  previousTaskId?: string;
  taskId?: string;
  submissionId?: string;
  occurredAt?: string;
}

function incrementSequence(value: string): string {
  return (BigInt(value) + 1n).toString();
}

function categorySnapshot(
  workspace: WorkspaceSnapshot,
  categoryRef: CategoryRef,
): CategorySnapshot {
  if (categoryRef.kind === "inbox") return { ref: { kind: "inbox" } };
  const category = workspace.categories.find(({ id }) => id === categoryRef.categoryId);
  if (!category) throw new Error("快速入口引用的分类不存在");
  return { ref: categoryRef, name: category.name };
}

function targetForDraft(draft: DraftRecord): CategoryRef {
  return draft.entry.kind === "global" ? { kind: "inbox" } : draft.entry.categoryRef;
}

function taskPosition(taskId: string, tasks: Map<string, Task>) {
  const task = tasks.get(taskId);
  if (!task) throw new Error("任务顺序引用了不存在的任务");
  return { kind: "task" as const, taskId, title: task.title };
}

export function freezeCreateIntent({
  workspace,
  draft: inputDraft,
  previousTaskId,
  taskId = crypto.randomUUID(),
  submissionId = crypto.randomUUID(),
  occurredAt = new Date().toISOString(),
}: FreezeCreateIntentInput): CreateTaskIntent {
  const draft = draftSchema.parse(inputDraft);
  if (draft.title.trim().length === 0) throw new Error("任务标题不能为空");
  uuidV4Schema.parse(taskId);
  uuidV4Schema.parse(submissionId);
  utcTimeSchema.parse(occurredAt);

  const targetCategoryRef = targetForDraft(draft);
  const group = workspace.taskOrderByCategory.find(
    ({ categoryRef }) =>
      categoryRefKey(categoryRef) === categoryRefKey(targetCategoryRef),
  );
  if (!group) throw new Error("目标分类顺序缺失");

  const tasks = taskMap(workspace);
  const openTaskIds = group.taskIds.filter((id) => tasks.get(id)?.status === "open");
  const previousIsSessionTask =
    previousTaskId !== undefined && openTaskIds.includes(previousTaskId);
  const insertionIndex = previousIsSessionTask
    ? group.taskIds.indexOf(previousTaskId) + 1
    : openTaskIds.length === 0
      ? 0
      : group.taskIds.indexOf(openTaskIds[0]);
  const resultTaskIds = [...group.taskIds];
  resultTaskIds.splice(insertionIndex, 0, taskId);

  const resultOpenTaskIds = resultTaskIds.filter(
    (id) => id === taskId || tasks.get(id)?.status === "open",
  );
  const openIndex = resultOpenTaskIds.indexOf(taskId);
  const previousId = resultOpenTaskIds[openIndex - 1];
  const nextId = resultOpenTaskIds[openIndex + 1];
  const previousTask = previousId
    ? taskPosition(previousId, tasks)
    : { kind: "start" as const };
  const nextTask = nextId ? taskPosition(nextId, tasks) : { kind: "end" as const };

  const task = taskSchema.parse({
    id: taskId,
    title: draft.title,
    notes: "",
    status: "open",
    priority: "P3",
    createdAt: occurredAt,
    updatedAt: occurredAt,
    lifecycle: { kind: "active" },
  });
  const history = taskCreatedEventSchema.parse({
    subjectType: "task",
    subject: { taskId, title: draft.title },
    eventType: "task.created",
    occurredAt,
    operationSequence: workspace.meta.nextOperationSequence,
    eventOrder: 0,
    details: {
      categorySnapshot: categorySnapshot(workspace, targetCategoryRef),
      position: { previousTask, nextTask },
    },
  });

  return {
    kind: "create-task",
    submissionId,
    task,
    history,
    targetCategoryRef,
    expectedTaskIds: [...group.taskIds],
    resultTaskIds,
    expectedOperationSequence: workspace.meta.nextOperationSequence,
    nextOperationSequence: incrementSequence(workspace.meta.nextOperationSequence),
    consumedDraft: { entry: draft.entry, generation: draft.generation },
  };
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function applyCreateIntent(
  workspace: WorkspaceSnapshot,
  intent: CreateTaskIntent,
): WorkspaceSnapshot {
  const existingTask = workspace.tasks.find(({ id }) => id === intent.task.id);
  const existingHistory = workspace.history.find(
    ({ eventOrder, operationSequence }) =>
      operationSequence === intent.history.operationSequence &&
      eventOrder === intent.history.eventOrder,
  );
  const group = workspace.taskOrderByCategory.find(
    ({ categoryRef }) =>
      categoryRefKey(categoryRef) === categoryRefKey(intent.targetCategoryRef),
  );
  if (!group) throw new Error("目标分类顺序缺失");

  if (existingTask || existingHistory) {
    if (
      sameValue(existingTask, intent.task) &&
      sameValue(existingHistory, intent.history) &&
      sameValue(group.taskIds, intent.resultTaskIds) &&
      workspace.meta.nextOperationSequence === intent.nextOperationSequence
    ) {
      return workspace;
    }
    throw new Error("创建意图与现有工作状态冲突");
  }
  if (
    workspace.meta.nextOperationSequence !== intent.expectedOperationSequence ||
    !sameValue(group.taskIds, intent.expectedTaskIds)
  ) {
    throw new Error("创建意图基线不匹配");
  }

  return {
    ...workspace,
    meta: { nextOperationSequence: intent.nextOperationSequence },
    tasks: [...workspace.tasks, structuredClone(intent.task)],
    taskOrderByCategory: workspace.taskOrderByCategory.map((currentGroup) =>
      categoryRefKey(currentGroup.categoryRef) ===
      categoryRefKey(intent.targetCategoryRef)
        ? { ...currentGroup, taskIds: [...intent.resultTaskIds] }
        : currentGroup,
    ),
    drafts: workspace.drafts.filter(
      (draft) =>
        !(
          sameDraftEntry(draft.entry, intent.consumedDraft.entry) &&
          draft.generation === intent.consumedDraft.generation
        ),
    ),
    history: [...workspace.history, structuredClone(intent.history)],
  };
}

export function setWorkspaceDraft(
  workspace: WorkspaceSnapshot,
  entry: DraftRecord["entry"],
  draft: DraftRecord | null,
): WorkspaceSnapshot {
  const otherDrafts = workspace.drafts.filter(
    (current) => draftEntryKey(current.entry) !== draftEntryKey(entry),
  );
  return {
    ...workspace,
    drafts: draft ? [...otherDrafts, draftSchema.parse(draft)] : otherDrafts,
  };
}
