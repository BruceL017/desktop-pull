import {
  backupDataSchema,
  type CategoryRef,
  type CategorySnapshot,
  categoryCreatedEventSchema,
  categoryDeletedEventSchema,
  categoryNameSchema,
  categoryRenamedEventSchema,
  categoryReorderedEventSchema,
  type HistoryEvent,
  type TaskPosition,
  type TaskPriority,
  type TaskStatus,
  taskCategoryChangedEventSchema,
  taskCompletedEventSchema,
  taskContentChangedEventSchema,
  taskMovedByCategoryDeletionEventSchema,
  taskPriorityChangedEventSchema,
  taskReopenedEventSchema,
  taskReorderedEventSchema,
  taskRestoredEventSchema,
  taskSchema,
  taskTrashedEventSchema,
  utcTimeSchema,
} from "./schemas";
import {
  categoryRefKey,
  inboxCategoryRef,
  taskMap,
  type WorkspaceSnapshot,
} from "./workspace";

export interface WorkspaceMutation {
  id: string;
  kind: string;
  expectedOperationSequence: string;
  result: WorkspaceSnapshot;
}

interface OperationOptions {
  occurredAt?: string;
  mutationId?: string;
}

function incrementSequence(value: string): string {
  return (BigInt(value) + 1n).toString();
}

function cloneWorkspace(workspace: WorkspaceSnapshot): WorkspaceSnapshot {
  return structuredClone(workspace);
}

function finish(
  workspace: WorkspaceSnapshot,
  kind: string,
  result: WorkspaceSnapshot,
  mutationId: string = crypto.randomUUID(),
): WorkspaceMutation {
  return {
    id: mutationId,
    kind,
    expectedOperationSequence: workspace.meta.nextOperationSequence,
    result: backupDataSchema.parse(result),
  };
}

function operationTime(value?: string): string {
  return utcTimeSchema.parse(value ?? new Date().toISOString());
}

export function categorySnapshot(
  workspace: WorkspaceSnapshot,
  categoryRef: CategoryRef,
): CategorySnapshot {
  if (categoryRef.kind === "inbox") return { ref: { kind: "inbox" } };
  const category = workspace.categories.find(({ id }) => id === categoryRef.categoryId);
  if (!category) throw new Error("分类不存在");
  return { ref: structuredClone(categoryRef), name: category.name };
}

export function taskCategoryRef(
  workspace: WorkspaceSnapshot,
  taskId: string,
): CategoryRef {
  const group = workspace.taskOrderByCategory.find(({ taskIds }) =>
    taskIds.includes(taskId),
  );
  if (!group) throw new Error("活动任务没有分类顺序");
  return structuredClone(group.categoryRef);
}

function groupFor(workspace: WorkspaceSnapshot, categoryRef: CategoryRef) {
  const group = workspace.taskOrderByCategory.find(
    (candidate) => categoryRefKey(candidate.categoryRef) === categoryRefKey(categoryRef),
  );
  if (!group) throw new Error("分类顺序不存在");
  return group;
}

function statusTaskIds(
  workspace: WorkspaceSnapshot,
  categoryRef: CategoryRef,
  status: TaskStatus,
): string[] {
  const tasks = taskMap(workspace);
  return groupFor(workspace, categoryRef).taskIds.filter(
    (taskId) => tasks.get(taskId)?.status === status,
  );
}

function historyTaskNeighbor(taskId: string, tasks: ReturnType<typeof taskMap>) {
  const task = tasks.get(taskId);
  if (!task) throw new Error("任务位置引用未知任务");
  return { kind: "task" as const, taskId, title: task.title };
}

function positionAt(
  workspace: WorkspaceSnapshot,
  orderedIds: string[],
  taskId: string,
): TaskPosition {
  const index = orderedIds.indexOf(taskId);
  if (index < 0) throw new Error("任务不在状态顺序中");
  const tasks = taskMap(workspace);
  return {
    previousTask: orderedIds[index - 1]
      ? historyTaskNeighbor(orderedIds[index - 1], tasks)
      : { kind: "start" },
    nextTask: orderedIds[index + 1]
      ? historyTaskNeighbor(orderedIds[index + 1], tasks)
      : { kind: "end" },
  };
}

function categoryPositionAt(workspace: WorkspaceSnapshot, categoryId: string) {
  const index = workspace.categoryOrder.indexOf(categoryId);
  if (index < 0) throw new Error("分类不在顺序中");
  const neighbor = (id: string | undefined, boundary: "start" | "end") => {
    if (!id) return { kind: boundary } as const;
    const category = workspace.categories.find((candidate) => candidate.id === id);
    if (!category) throw new Error("分类顺序引用未知分类");
    return { kind: "category" as const, categoryId: id, name: category.name };
  };
  return {
    previousCategory: neighbor(workspace.categoryOrder[index - 1], "start"),
    nextCategory: neighbor(workspace.categoryOrder[index + 1], "end"),
  };
}

function appendOperation(
  workspace: WorkspaceSnapshot,
  result: WorkspaceSnapshot,
  events: HistoryEvent[],
): void {
  result.history.push(...events);
  result.meta.nextOperationSequence = incrementSequence(
    workspace.meta.nextOperationSequence,
  );
}

function activeTask(workspace: WorkspaceSnapshot, taskId: string) {
  const task = workspace.tasks.find((candidate) => candidate.id === taskId);
  if (task?.lifecycle.kind !== "active") throw new Error("活动任务不存在");
  return task;
}

export function freezeTaskContent(
  workspace: WorkspaceSnapshot,
  taskId: string,
  title: string,
  notes: string,
  options: OperationOptions = {},
): WorkspaceMutation | null {
  const task = activeTask(workspace, taskId);
  taskSchema.shape.title.parse(title);
  const titleChanged = title !== task.title;
  const notesChanged = notes !== task.notes;
  if (!titleChanged && !notesChanged) return null;
  const occurredAt = operationTime(options.occurredAt);
  const result = cloneWorkspace(workspace);
  const target = result.tasks.find(({ id }) => id === taskId);
  if (!target) throw new Error("任务不存在");
  target.title = title;
  target.notes = notes;
  target.updatedAt = occurredAt;

  const details = titleChanged
    ? notesChanged
      ? {
          categorySnapshot: categorySnapshot(
            workspace,
            taskCategoryRef(workspace, taskId),
          ),
          beforeTitle: task.title,
          beforeNotes: task.notes,
          afterNotes: notes,
        }
      : {
          categorySnapshot: categorySnapshot(
            workspace,
            taskCategoryRef(workspace, taskId),
          ),
          beforeTitle: task.title,
        }
    : {
        categorySnapshot: categorySnapshot(workspace, taskCategoryRef(workspace, taskId)),
        beforeNotes: task.notes,
        afterNotes: notes,
      };
  const event = taskContentChangedEventSchema.parse({
    subjectType: "task",
    subject: { taskId, title },
    eventType: "task.content_changed",
    occurredAt,
    operationSequence: workspace.meta.nextOperationSequence,
    eventOrder: 0,
    details,
  });
  appendOperation(workspace, result, [event]);
  return finish(workspace, "task-content", result, options.mutationId);
}

export function freezeTaskPriority(
  workspace: WorkspaceSnapshot,
  taskId: string,
  priority: TaskPriority,
  options: OperationOptions = {},
): WorkspaceMutation | null {
  const task = activeTask(workspace, taskId);
  if (task.priority === priority) return null;
  const occurredAt = operationTime(options.occurredAt);
  const result = cloneWorkspace(workspace);
  const target = result.tasks.find(({ id }) => id === taskId);
  if (!target) throw new Error("任务不存在");
  target.priority = priority;
  target.updatedAt = occurredAt;
  const event = taskPriorityChangedEventSchema.parse({
    subjectType: "task",
    subject: { taskId, title: task.title },
    eventType: "task.priority_changed",
    occurredAt,
    operationSequence: workspace.meta.nextOperationSequence,
    eventOrder: 0,
    details: {
      categorySnapshot: categorySnapshot(workspace, taskCategoryRef(workspace, taskId)),
      beforePriority: task.priority,
      afterPriority: priority,
    },
  });
  appendOperation(workspace, result, [event]);
  return finish(workspace, "task-priority", result, options.mutationId);
}

export function freezeTaskStatus(
  workspace: WorkspaceSnapshot,
  taskId: string,
  status: TaskStatus,
  options: OperationOptions = {},
): WorkspaceMutation | null {
  const task = activeTask(workspace, taskId);
  if (task.status === status) return null;
  const occurredAt = operationTime(options.occurredAt);
  const result = cloneWorkspace(workspace);
  const target = result.tasks.find(({ id }) => id === taskId);
  if (!target) throw new Error("任务不存在");
  target.status = status;
  target.updatedAt = occurredAt;
  const payload = {
    subjectType: "task" as const,
    subject: { taskId, title: task.title },
    eventType:
      status === "completed" ? ("task.completed" as const) : ("task.reopened" as const),
    occurredAt,
    operationSequence: workspace.meta.nextOperationSequence,
    eventOrder: 0,
    details: {
      categorySnapshot: categorySnapshot(workspace, taskCategoryRef(workspace, taskId)),
    },
  };
  const event =
    status === "completed"
      ? taskCompletedEventSchema.parse(payload)
      : taskReopenedEventSchema.parse(payload);
  appendOperation(workspace, result, [event]);
  return finish(workspace, "task-status", result, options.mutationId);
}

function insertAtStatusIndex(
  workspace: WorkspaceSnapshot,
  categoryRef: CategoryRef,
  status: TaskStatus,
  taskId: string,
  requestedIndex: number,
): void {
  const group = groupFor(workspace, categoryRef);
  const tasks = taskMap(workspace);
  const statusIds = group.taskIds.filter(
    (id) => id !== taskId && tasks.get(id)?.status === status,
  );
  const index = Math.max(0, Math.min(requestedIndex, statusIds.length));
  const beforeId = statusIds[index];
  if (beforeId) {
    group.taskIds.splice(group.taskIds.indexOf(beforeId), 0, taskId);
    return;
  }
  if (status === "open") {
    const firstCompleted = group.taskIds.findIndex(
      (id) => tasks.get(id)?.status === "completed",
    );
    group.taskIds.splice(
      firstCompleted < 0 ? group.taskIds.length : firstCompleted,
      0,
      taskId,
    );
    return;
  }
  group.taskIds.push(taskId);
}

function moveTaskInResult(
  workspace: WorkspaceSnapshot,
  result: WorkspaceSnapshot,
  taskId: string,
  targetCategoryRef: CategoryRef,
  targetIndex: number,
  occurredAt: string,
  eventOrder: number,
): HistoryEvent | null {
  const task = activeTask(workspace, taskId);
  const sourceCategoryRef = taskCategoryRef(workspace, taskId);
  const beforePosition = positionAt(
    workspace,
    statusTaskIds(workspace, sourceCategoryRef, task.status),
    taskId,
  );
  const sourceGroup = groupFor(result, sourceCategoryRef);
  sourceGroup.taskIds = sourceGroup.taskIds.filter((id) => id !== taskId);
  insertAtStatusIndex(result, targetCategoryRef, task.status, taskId, targetIndex);
  const afterPosition = positionAt(
    result,
    statusTaskIds(result, targetCategoryRef, task.status),
    taskId,
  );
  if (
    categoryRefKey(sourceCategoryRef) === categoryRefKey(targetCategoryRef) &&
    JSON.stringify(groupFor(workspace, sourceCategoryRef).taskIds) ===
      JSON.stringify(groupFor(result, targetCategoryRef).taskIds)
  ) {
    return null;
  }
  const targetTask = result.tasks.find(({ id }) => id === taskId);
  if (!targetTask) throw new Error("任务不存在");
  targetTask.updatedAt = occurredAt;
  if (categoryRefKey(sourceCategoryRef) === categoryRefKey(targetCategoryRef)) {
    return taskReorderedEventSchema.parse({
      subjectType: "task",
      subject: { taskId, title: task.title },
      eventType: "task.reordered",
      occurredAt,
      operationSequence: workspace.meta.nextOperationSequence,
      eventOrder,
      details: {
        categorySnapshot: categorySnapshot(workspace, sourceCategoryRef),
        status: task.status,
        beforePosition,
        afterPosition,
      },
    });
  }
  return taskCategoryChangedEventSchema.parse({
    subjectType: "task",
    subject: { taskId, title: task.title },
    eventType: "task.category_changed",
    occurredAt,
    operationSequence: workspace.meta.nextOperationSequence,
    eventOrder,
    details: {
      status: task.status,
      source: {
        categorySnapshot: categorySnapshot(workspace, sourceCategoryRef),
        position: beforePosition,
      },
      target: {
        categorySnapshot: categorySnapshot(result, targetCategoryRef),
        position: afterPosition,
      },
    },
  });
}

export function freezeTaskMove(
  workspace: WorkspaceSnapshot,
  taskId: string,
  targetCategoryRef: CategoryRef,
  targetIndex: number,
  options: OperationOptions = {},
): WorkspaceMutation | null {
  const occurredAt = operationTime(options.occurredAt);
  const result = cloneWorkspace(workspace);
  const event = moveTaskInResult(
    workspace,
    result,
    taskId,
    targetCategoryRef,
    targetIndex,
    occurredAt,
    0,
  );
  if (!event) return null;
  appendOperation(workspace, result, [event]);
  return finish(workspace, "task-move", result, options.mutationId);
}

function normalizedCategoryName(
  workspace: WorkspaceSnapshot,
  name: string,
  selfId?: string,
) {
  const normalized = categoryNameSchema.parse(name.trim());
  const key = normalized.toLocaleLowerCase("en-US");
  if (key === "inbox" || normalized === "收件箱") {
    throw new Error("分类名称不能使用系统保留名");
  }
  if (
    workspace.categories.some(
      (category) =>
        category.id !== selfId && category.name.toLocaleLowerCase("en-US") === key,
    )
  ) {
    throw new Error("分类名称已存在");
  }
  return normalized;
}

export function freezeCategoryCreate(
  workspace: WorkspaceSnapshot,
  name: string,
  moveTaskId?: string,
  options: OperationOptions & { categoryId?: string } = {},
): WorkspaceMutation {
  const normalized = normalizedCategoryName(workspace, name);
  const occurredAt = operationTime(options.occurredAt);
  const categoryId = options.categoryId ?? crypto.randomUUID();
  const categoryRef: CategoryRef = { kind: "custom", categoryId };
  const result = cloneWorkspace(workspace);
  result.categories.push({ id: categoryId, name: normalized });
  result.categoryOrder.push(categoryId);
  result.taskOrderByCategory.push({ categoryRef, taskIds: [] });
  const events: HistoryEvent[] = [
    categoryCreatedEventSchema.parse({
      subjectType: "category",
      subject: { categoryId, name: normalized },
      eventType: "category.created",
      occurredAt,
      operationSequence: workspace.meta.nextOperationSequence,
      eventOrder: 0,
      details: {},
    }),
  ];
  if (moveTaskId) {
    const moved = moveTaskInResult(
      workspace,
      result,
      moveTaskId,
      categoryRef,
      0,
      occurredAt,
      1,
    );
    if (!moved) throw new Error("新分类移动没有产生变化");
    events.push(moved);
  }
  appendOperation(workspace, result, events);
  return finish(workspace, "category-create", result, options.mutationId);
}

export function freezeCategoryRename(
  workspace: WorkspaceSnapshot,
  categoryId: string,
  name: string,
  options: OperationOptions = {},
): WorkspaceMutation | null {
  const category = workspace.categories.find(({ id }) => id === categoryId);
  if (!category) throw new Error("分类不存在");
  const normalized = normalizedCategoryName(workspace, name, categoryId);
  if (normalized === category.name) return null;
  const occurredAt = operationTime(options.occurredAt);
  const result = cloneWorkspace(workspace);
  const target = result.categories.find(({ id }) => id === categoryId);
  if (!target) throw new Error("分类不存在");
  target.name = normalized;
  const event = categoryRenamedEventSchema.parse({
    subjectType: "category",
    subject: { categoryId, name: normalized },
    eventType: "category.renamed",
    occurredAt,
    operationSequence: workspace.meta.nextOperationSequence,
    eventOrder: 0,
    details: { beforeName: category.name },
  });
  appendOperation(workspace, result, [event]);
  return finish(workspace, "category-rename", result, options.mutationId);
}

export function freezeCategoryReorder(
  workspace: WorkspaceSnapshot,
  categoryId: string,
  targetIndex: number,
  options: OperationOptions = {},
): WorkspaceMutation | null {
  const category = workspace.categories.find(({ id }) => id === categoryId);
  if (!category) throw new Error("分类不存在");
  const currentIndex = workspace.categoryOrder.indexOf(categoryId);
  if (currentIndex < 0) throw new Error("分类顺序不存在");
  const result = cloneWorkspace(workspace);
  result.categoryOrder.splice(currentIndex, 1);
  const index = Math.max(0, Math.min(targetIndex, result.categoryOrder.length));
  result.categoryOrder.splice(index, 0, categoryId);
  if (JSON.stringify(result.categoryOrder) === JSON.stringify(workspace.categoryOrder)) {
    return null;
  }
  const occurredAt = operationTime(options.occurredAt);
  const event = categoryReorderedEventSchema.parse({
    subjectType: "category",
    subject: { categoryId, name: category.name },
    eventType: "category.reordered",
    occurredAt,
    operationSequence: workspace.meta.nextOperationSequence,
    eventOrder: 0,
    details: {
      beforePosition: categoryPositionAt(workspace, categoryId),
      afterPosition: categoryPositionAt(result, categoryId),
    },
  });
  appendOperation(workspace, result, [event]);
  return finish(workspace, "category-reorder", result, options.mutationId);
}

export function freezeCategoryDelete(
  workspace: WorkspaceSnapshot,
  categoryId: string,
  options: OperationOptions = {},
): WorkspaceMutation {
  const category = workspace.categories.find(({ id }) => id === categoryId);
  if (!category) throw new Error("分类不存在");
  const categoryRef: CategoryRef = { kind: "custom", categoryId };
  const sourceGroup = groupFor(workspace, categoryRef);
  const sourcePositions = new Map(
    sourceGroup.taskIds.map((taskId) => {
      const task = activeTask(workspace, taskId);
      return [
        taskId,
        positionAt(workspace, statusTaskIds(workspace, categoryRef, task.status), taskId),
      ];
    }),
  );
  const occurredAt = operationTime(options.occurredAt);
  const result = cloneWorkspace(workspace);
  result.categories = result.categories.filter(({ id }) => id !== categoryId);
  result.categoryOrder = result.categoryOrder.filter((id) => id !== categoryId);
  result.taskOrderByCategory = result.taskOrderByCategory.filter(
    ({ categoryRef: ref }) => categoryRefKey(ref) !== categoryRefKey(categoryRef),
  );
  result.drafts = result.drafts.filter(
    ({ entry }) =>
      !(
        entry.kind === "category" &&
        categoryRefKey(entry.categoryRef) === categoryRefKey(categoryRef)
      ),
  );
  for (const taskId of sourceGroup.taskIds) {
    const task = activeTask(workspace, taskId);
    insertAtStatusIndex(
      result,
      inboxCategoryRef,
      task.status,
      taskId,
      statusTaskIds(result, inboxCategoryRef, task.status).length,
    );
    const target = result.tasks.find(({ id }) => id === taskId);
    if (target) target.updatedAt = occurredAt;
  }
  const snapshot = categorySnapshot(workspace, categoryRef);
  const events: HistoryEvent[] = [
    categoryDeletedEventSchema.parse({
      subjectType: "category",
      subject: { categoryId, name: category.name },
      eventType: "category.deleted",
      occurredAt,
      operationSequence: workspace.meta.nextOperationSequence,
      eventOrder: 0,
      details: { affectedTaskCount: sourceGroup.taskIds.length },
    }),
  ];
  sourceGroup.taskIds.forEach((taskId, index) => {
    const task = activeTask(workspace, taskId);
    events.push(
      taskMovedByCategoryDeletionEventSchema.parse({
        subjectType: "task",
        subject: { taskId, title: task.title },
        eventType: "task.moved_to_inbox_by_category_deletion",
        occurredAt,
        operationSequence: workspace.meta.nextOperationSequence,
        eventOrder: index + 1,
        details: {
          status: task.status,
          source: { categorySnapshot: snapshot, position: sourcePositions.get(taskId) },
          targetPosition: positionAt(
            result,
            statusTaskIds(result, inboxCategoryRef, task.status),
            taskId,
          ),
        },
      }),
    );
  });
  appendOperation(workspace, result, events);
  return finish(workspace, "category-delete", result, options.mutationId);
}

export function freezeTaskTrash(
  workspace: WorkspaceSnapshot,
  taskId: string,
  options: OperationOptions = {},
): WorkspaceMutation {
  const task = activeTask(workspace, taskId);
  const categoryRef = taskCategoryRef(workspace, taskId);
  const orderedIds = statusTaskIds(workspace, categoryRef, task.status);
  const position = positionAt(workspace, orderedIds, taskId);
  const index = orderedIds.indexOf(taskId);
  const occurredAt = operationTime(options.occurredAt);
  const expiresAt = new Date(
    new Date(occurredAt).valueOf() + 30 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const result = cloneWorkspace(workspace);
  const group = groupFor(result, categoryRef);
  group.taskIds = group.taskIds.filter((id) => id !== taskId);
  const target = result.tasks.find(({ id }) => id === taskId);
  if (!target) throw new Error("任务不存在");
  target.updatedAt = occurredAt;
  target.lifecycle = {
    kind: "trashed",
    deletedAt: occurredAt,
    expiresAt,
    categorySnapshotAtDeletion: categorySnapshot(workspace, categoryRef),
    previousTaskAnchor: orderedIds[index - 1]
      ? { kind: "task", taskId: orderedIds[index - 1] }
      : { kind: "start" },
    nextTaskAnchor: orderedIds[index + 1]
      ? { kind: "task", taskId: orderedIds[index + 1] }
      : { kind: "end" },
  };
  const event = taskTrashedEventSchema.parse({
    subjectType: "task",
    subject: { taskId, title: task.title },
    eventType: "task.trashed",
    occurredAt,
    operationSequence: workspace.meta.nextOperationSequence,
    eventOrder: 0,
    details: {
      categorySnapshot: categorySnapshot(workspace, categoryRef),
      status: task.status,
      position,
    },
  });
  appendOperation(workspace, result, [event]);
  return finish(workspace, "task-trash", result, options.mutationId);
}

export function freezeTaskRestore(
  workspace: WorkspaceSnapshot,
  taskId: string,
  options: OperationOptions = {},
): WorkspaceMutation | null {
  const task = workspace.tasks.find(({ id }) => id === taskId);
  if (task?.lifecycle.kind !== "trashed") throw new Error("垃圾箱任务不存在");
  const occurredAt = operationTime(options.occurredAt);
  if (occurredAt >= task.lifecycle.expiresAt) return null;
  const deletedSnapshot = task.lifecycle.categorySnapshotAtDeletion;
  const deletedRef = deletedSnapshot.ref;
  const targetCategoryRef: CategoryRef =
    deletedRef.kind === "custom" &&
    workspace.categories.some(({ id }) => id === deletedRef.categoryId)
      ? deletedRef
      : inboxCategoryRef;
  const targetIds = statusTaskIds(workspace, targetCategoryRef, task.status);
  const previous = task.lifecycle.previousTaskAnchor;
  const next = task.lifecycle.nextTaskAnchor;
  const previousIndex =
    previous.kind === "task" ? targetIds.indexOf(previous.taskId) : -1;
  const nextIndex = next.kind === "task" ? targetIds.indexOf(next.taskId) : -1;
  const insertionIndex =
    previousIndex >= 0
      ? previousIndex + 1
      : nextIndex >= 0
        ? nextIndex
        : targetIds.length;
  const result = cloneWorkspace(workspace);
  const target = result.tasks.find(({ id }) => id === taskId);
  if (!target) throw new Error("任务不存在");
  target.lifecycle = { kind: "active" };
  target.updatedAt = occurredAt;
  insertAtStatusIndex(result, targetCategoryRef, task.status, taskId, insertionIndex);
  const position = positionAt(
    result,
    statusTaskIds(result, targetCategoryRef, task.status),
    taskId,
  );
  const event = taskRestoredEventSchema.parse({
    subjectType: "task",
    subject: { taskId, title: task.title },
    eventType: "task.restored",
    occurredAt,
    operationSequence: workspace.meta.nextOperationSequence,
    eventOrder: 0,
    details: {
      categorySnapshot: categorySnapshot(result, targetCategoryRef),
      status: task.status,
      position,
    },
  });
  appendOperation(workspace, result, [event]);
  return finish(workspace, "task-restore", result, options.mutationId);
}

function removeTaskIdentity(value: unknown, removed: Set<string>): unknown {
  if (Array.isArray(value)) return value.map((item) => removeTaskIdentity(item, removed));
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (
    record.kind === "task" &&
    typeof record.taskId === "string" &&
    removed.has(record.taskId)
  ) {
    return { kind: "unavailable" };
  }
  return Object.fromEntries(
    Object.entries(record).map(([key, nested]) => [
      key,
      removeTaskIdentity(nested, removed),
    ]),
  );
}

export function freezePermanentDelete(
  workspace: WorkspaceSnapshot,
  taskIds: string[],
  options: Pick<OperationOptions, "mutationId"> = {},
): WorkspaceMutation | null {
  const removed = new Set(taskIds);
  if (removed.size === 0) return null;
  for (const taskId of removed) {
    const task = workspace.tasks.find(({ id }) => id === taskId);
    if (task?.lifecycle.kind !== "trashed") {
      throw new Error("只能永久删除垃圾箱任务");
    }
  }
  const result = cloneWorkspace(workspace);
  result.tasks = result.tasks
    .filter(({ id }) => !removed.has(id))
    .map((task) => {
      if (task.lifecycle.kind !== "trashed") return task;
      return taskSchema.parse(removeTaskIdentity(task, removed));
    });
  result.history = result.history
    .filter(
      (event) => !(event.subjectType === "task" && removed.has(event.subject.taskId)),
    )
    .map((event) => removeTaskIdentity(event, removed) as HistoryEvent);
  return finish(workspace, "permanent-delete", result, options.mutationId);
}

export function freezeExpiredCleanup(
  workspace: WorkspaceSnapshot,
  now = new Date().toISOString(),
  mutationId?: string,
): WorkspaceMutation | null {
  const expired = workspace.tasks
    .filter(
      (task) => task.lifecycle.kind === "trashed" && task.lifecycle.expiresAt <= now,
    )
    .map(({ id }) => id);
  return freezePermanentDelete(workspace, expired, { mutationId });
}
