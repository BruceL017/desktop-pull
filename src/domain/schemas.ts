import { z } from "zod";

const uuidV4Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const utcTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const uuidV4Schema = z.string().regex(uuidV4Pattern);
export const operationSequenceSchema = z.string().regex(/^[1-9]\d*$/);
export const utcTimeSchema = z
  .string()
  .regex(utcTimePattern)
  .refine((value) => {
    const parsed = new Date(value);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
  });

export const inboxCategoryRefSchema = z.strictObject({
  kind: z.literal("inbox"),
});
export const customCategoryRefSchema = z.strictObject({
  kind: z.literal("custom"),
  categoryId: uuidV4Schema,
});
export const categoryRefSchema = z.discriminatedUnion("kind", [
  inboxCategoryRefSchema,
  customCategoryRefSchema,
]);

export const inboxCategorySnapshotSchema = z.strictObject({
  ref: inboxCategoryRefSchema,
});
export const customCategorySnapshotSchema = z.strictObject({
  ref: customCategoryRefSchema,
  name: z.string().refine((value) => value.trim() === value && value.length > 0),
});
export const categorySnapshotSchema = z.union([
  inboxCategorySnapshotSchema,
  customCategorySnapshotSchema,
]);

export const categoryNameSchema = z
  .string()
  .min(1)
  .refine((value) => value.trim() === value && value.trim().length > 0);
export const categorySchema = z.strictObject({
  id: uuidV4Schema,
  name: categoryNameSchema,
});

export const taskOrderGroupSchema = z.strictObject({
  categoryRef: categoryRefSchema,
  taskIds: z.array(uuidV4Schema),
});

const taskAnchorSchema = z.strictObject({
  kind: z.literal("task"),
  taskId: uuidV4Schema,
});
const previousTaskAnchorSchema = z.union([
  z.strictObject({ kind: z.literal("start") }),
  taskAnchorSchema,
  z.strictObject({ kind: z.literal("unavailable") }),
]);
const nextTaskAnchorSchema = z.union([
  z.strictObject({ kind: z.literal("end") }),
  taskAnchorSchema,
  z.strictObject({ kind: z.literal("unavailable") }),
]);

const activeLifecycleSchema = z.strictObject({ kind: z.literal("active") });
const trashedLifecycleSchema = z.strictObject({
  kind: z.literal("trashed"),
  deletedAt: utcTimeSchema,
  expiresAt: utcTimeSchema,
  categorySnapshotAtDeletion: categorySnapshotSchema,
  previousTaskAnchor: previousTaskAnchorSchema,
  nextTaskAnchor: nextTaskAnchorSchema,
});

export const taskTitleSchema = z
  .string()
  .refine((value) => value.trim().length > 0, "任务标题不能为空");
export const taskStatusSchema = z.enum(["open", "completed"]);
export const taskPrioritySchema = z.enum(["P0", "P1", "P2", "P3", "P4", "P5"]);
export const taskSchema = z
  .strictObject({
    id: uuidV4Schema,
    title: taskTitleSchema,
    notes: z.string(),
    status: taskStatusSchema,
    priority: taskPrioritySchema,
    createdAt: utcTimeSchema,
    updatedAt: utcTimeSchema,
    lifecycle: z.discriminatedUnion("kind", [
      activeLifecycleSchema,
      trashedLifecycleSchema,
    ]),
  })
  .superRefine((task, context) => {
    if (task.lifecycle.kind !== "trashed") return;
    if (task.updatedAt !== task.lifecycle.deletedAt) {
      context.addIssue({
        code: "custom",
        message: "垃圾箱任务的 updatedAt 必须等于 deletedAt",
        path: ["updatedAt"],
      });
    }
    const expectedExpiry = new Date(
      new Date(task.lifecycle.deletedAt).valueOf() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    if (task.lifecycle.expiresAt !== expectedExpiry) {
      context.addIssue({
        code: "custom",
        message: "垃圾箱任务必须在删除 30 天后到期",
        path: ["lifecycle", "expiresAt"],
      });
    }
    const previous = task.lifecycle.previousTaskAnchor;
    const next = task.lifecycle.nextTaskAnchor;
    if (
      (previous.kind === "task" && previous.taskId === task.id) ||
      (next.kind === "task" && next.taskId === task.id)
    ) {
      context.addIssue({ code: "custom", message: "恢复锚点不能引用任务自身" });
    }
    if (
      previous.kind === "task" &&
      next.kind === "task" &&
      previous.taskId === next.taskId
    ) {
      context.addIssue({ code: "custom", message: "恢复锚点两侧不能引用同一任务" });
    }
  });

export const globalDraftEntrySchema = z.strictObject({
  kind: z.literal("global"),
});
export const categoryDraftEntrySchema = z.strictObject({
  kind: z.literal("category"),
  categoryRef: categoryRefSchema,
});
export const draftEntrySchema = z.discriminatedUnion("kind", [
  globalDraftEntrySchema,
  categoryDraftEntrySchema,
]);
export const draftSchema = z
  .strictObject({
    entry: draftEntrySchema,
    generation: uuidV4Schema,
    title: z.string().min(1),
    cursorOffset: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .refine(({ cursorOffset, title }) => cursorOffset <= title.length, {
    message: "草稿光标超出标题范围",
    path: ["cursorOffset"],
  });

export const previousTaskNeighborSchema = z.union([
  z.strictObject({ kind: z.literal("start") }),
  z.strictObject({
    kind: z.literal("task"),
    taskId: uuidV4Schema,
    title: taskTitleSchema,
  }),
  z.strictObject({ kind: z.literal("unavailable") }),
]);
export const nextTaskNeighborSchema = z.union([
  z.strictObject({ kind: z.literal("end") }),
  z.strictObject({
    kind: z.literal("task"),
    taskId: uuidV4Schema,
    title: taskTitleSchema,
  }),
  z.strictObject({ kind: z.literal("unavailable") }),
]);
export const taskPositionSchema = z
  .strictObject({
    previousTask: previousTaskNeighborSchema,
    nextTask: nextTaskNeighborSchema,
  })
  .superRefine(({ nextTask, previousTask }, context) => {
    if (
      previousTask.kind === "task" &&
      nextTask.kind === "task" &&
      previousTask.taskId === nextTask.taskId
    ) {
      context.addIssue({
        code: "custom",
        message: "位置两侧不能引用同一任务",
      });
    }
  });

type ParsedTaskPosition = z.infer<typeof taskPositionSchema>;

function taskIdsInPositions(positions: ParsedTaskPosition[]): string[] {
  return positions.flatMap((position) =>
    [position.previousTask, position.nextTask].flatMap((neighbor) =>
      neighbor.kind === "task" ? [neighbor.taskId] : [],
    ),
  );
}

function positionContainsUnavailable(position: ParsedTaskPosition): boolean {
  return (
    position.previousTask.kind === "unavailable" ||
    position.nextTask.kind === "unavailable"
  );
}

const categoryNeighborSchema = z.strictObject({
  kind: z.literal("category"),
  categoryId: uuidV4Schema,
  name: categoryNameSchema,
});
export const categoryPositionSchema = z
  .strictObject({
    previousCategory: z.union([
      z.strictObject({ kind: z.literal("start") }),
      categoryNeighborSchema,
    ]),
    nextCategory: z.union([
      z.strictObject({ kind: z.literal("end") }),
      categoryNeighborSchema,
    ]),
  })
  .superRefine(({ nextCategory, previousCategory }, context) => {
    if (
      previousCategory.kind === "category" &&
      nextCategory.kind === "category" &&
      previousCategory.categoryId === nextCategory.categoryId
    ) {
      context.addIssue({ code: "custom", message: "分类位置两侧不能引用同一分类" });
    }
  });

const taskSubjectSchema = z.strictObject({
  taskId: uuidV4Schema,
  title: taskTitleSchema,
});
const categorySubjectSchema = z.strictObject({
  categoryId: uuidV4Schema,
  name: categoryNameSchema,
});
const eventOrderSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const taskEventBase = {
  subjectType: z.literal("task"),
  subject: taskSubjectSchema,
  occurredAt: utcTimeSchema,
  operationSequence: operationSequenceSchema,
  eventOrder: eventOrderSchema,
};
const categoryEventBase = {
  subjectType: z.literal("category"),
  subject: categorySubjectSchema,
  occurredAt: utcTimeSchema,
  operationSequence: operationSequenceSchema,
  eventOrder: eventOrderSchema,
};

export const taskCreatedDetailsSchema = z.strictObject({
  categorySnapshot: categorySnapshotSchema,
  position: taskPositionSchema,
});
export const taskCreatedEventSchema = z
  .strictObject({
    ...taskEventBase,
    eventType: z.literal("task.created"),
    eventOrder: z.literal(0),
    details: taskCreatedDetailsSchema,
  })
  .superRefine(({ details, subject }, context) => {
    for (const neighbor of [details.position.previousTask, details.position.nextTask]) {
      if (neighbor.kind === "task" && neighbor.taskId === subject.taskId) {
        context.addIssue({ code: "custom", message: "创建位置不能引用任务自身" });
      }
    }
  });

const titleChangedDetailsSchema = z.strictObject({
  categorySnapshot: categorySnapshotSchema,
  beforeTitle: taskTitleSchema,
});
const notesChangedDetailsSchema = z
  .strictObject({
    categorySnapshot: categorySnapshotSchema,
    beforeNotes: z.string(),
    afterNotes: z.string(),
  })
  .refine(({ afterNotes, beforeNotes }) => afterNotes !== beforeNotes, {
    message: "备注变化前后必须不同",
  });
const titleAndNotesChangedDetailsSchema = z
  .strictObject({
    categorySnapshot: categorySnapshotSchema,
    beforeTitle: taskTitleSchema,
    beforeNotes: z.string(),
    afterNotes: z.string(),
  })
  .refine(({ afterNotes, beforeNotes }) => afterNotes !== beforeNotes, {
    message: "备注变化前后必须不同",
  });
export const taskContentChangedEventSchema = z
  .strictObject({
    ...taskEventBase,
    eventType: z.literal("task.content_changed"),
    eventOrder: z.literal(0),
    details: z.union([
      titleChangedDetailsSchema,
      notesChangedDetailsSchema,
      titleAndNotesChangedDetailsSchema,
    ]),
  })
  .superRefine(({ details, subject }, context) => {
    if ("beforeTitle" in details && details.beforeTitle === subject.title) {
      context.addIssue({ code: "custom", message: "标题变化前后必须不同" });
    }
  });

const statusDetailsSchema = z.strictObject({
  categorySnapshot: categorySnapshotSchema,
});
export const taskCompletedEventSchema = z.strictObject({
  ...taskEventBase,
  eventType: z.literal("task.completed"),
  eventOrder: z.literal(0),
  details: statusDetailsSchema,
});
export const taskReopenedEventSchema = z.strictObject({
  ...taskEventBase,
  eventType: z.literal("task.reopened"),
  eventOrder: z.literal(0),
  details: statusDetailsSchema,
});

const priorityDetailsSchema = z
  .strictObject({
    categorySnapshot: categorySnapshotSchema,
    beforePriority: taskPrioritySchema,
    afterPriority: taskPrioritySchema,
  })
  .refine(({ afterPriority, beforePriority }) => afterPriority !== beforePriority, {
    message: "优先级变化前后必须不同",
  });
export const taskPriorityChangedEventSchema = z.strictObject({
  ...taskEventBase,
  eventType: z.literal("task.priority_changed"),
  eventOrder: z.literal(0),
  details: priorityDetailsSchema,
});

const taskReorderedDetailsSchema = z.strictObject({
  categorySnapshot: categorySnapshotSchema,
  status: taskStatusSchema,
  beforePosition: taskPositionSchema,
  afterPosition: taskPositionSchema,
});
export const taskReorderedEventSchema = z
  .strictObject({
    ...taskEventBase,
    eventType: z.literal("task.reordered"),
    eventOrder: z.literal(0),
    details: taskReorderedDetailsSchema,
  })
  .superRefine(({ details, subject }, context) => {
    const positions = [details.beforePosition, details.afterPosition];
    if (taskIdsInPositions(positions).includes(subject.taskId)) {
      context.addIssue({ code: "custom", message: "任务顺序位置不能引用主体自身" });
    }
    if (
      !positions.some(positionContainsUnavailable) &&
      JSON.stringify(details.beforePosition) === JSON.stringify(details.afterPosition)
    ) {
      context.addIssue({ code: "custom", message: "任务顺序变化前后必须不同" });
    }
  });

const categoryPositionDetailsSchema = z.strictObject({
  categorySnapshot: categorySnapshotSchema,
  position: taskPositionSchema,
});
const categoryChangedDetailsSchema = z
  .strictObject({
    status: taskStatusSchema,
    source: categoryPositionDetailsSchema,
    target: categoryPositionDetailsSchema,
  })
  .refine(
    ({ source, target }) =>
      JSON.stringify(source.categorySnapshot.ref) !==
      JSON.stringify(target.categorySnapshot.ref),
    { message: "任务移动的来源和目标分类必须不同" },
  );
export const taskCategoryChangedEventSchema = z
  .strictObject({
    ...taskEventBase,
    eventType: z.literal("task.category_changed"),
    details: categoryChangedDetailsSchema,
  })
  .superRefine(({ details, subject }, context) => {
    const sourceIds = taskIdsInPositions([details.source.position]);
    const targetIds = taskIdsInPositions([details.target.position]);
    if ([...sourceIds, ...targetIds].includes(subject.taskId)) {
      context.addIssue({ code: "custom", message: "任务分类位置不能引用主体自身" });
    }
    if (sourceIds.some((taskId) => targetIds.includes(taskId))) {
      context.addIssue({ code: "custom", message: "跨分类位置不能重复引用同一邻居" });
    }
  });

const movedByCategoryDeletionDetailsSchema = z.strictObject({
  status: taskStatusSchema,
  source: categoryPositionDetailsSchema.extend({
    categorySnapshot: customCategorySnapshotSchema,
  }),
  targetPosition: taskPositionSchema,
});
export const taskMovedByCategoryDeletionEventSchema = z
  .strictObject({
    ...taskEventBase,
    eventType: z.literal("task.moved_to_inbox_by_category_deletion"),
    details: movedByCategoryDeletionDetailsSchema,
  })
  .refine(({ eventOrder }) => eventOrder > 0, {
    message: "分类删除派生任务事件顺序必须大于零",
  })
  .superRefine(({ details, subject }, context) => {
    if (
      taskIdsInPositions([details.source.position, details.targetPosition]).includes(
        subject.taskId,
      )
    ) {
      context.addIssue({ code: "custom", message: "分类删除移动位置不能引用主体自身" });
    }
  });

const lifecycleEventDetailsSchema = z.strictObject({
  categorySnapshot: categorySnapshotSchema,
  status: taskStatusSchema,
  position: taskPositionSchema,
});
export const taskTrashedEventSchema = z
  .strictObject({
    ...taskEventBase,
    eventType: z.literal("task.trashed"),
    eventOrder: z.literal(0),
    details: lifecycleEventDetailsSchema,
  })
  .superRefine(({ details, subject }, context) => {
    if (taskIdsInPositions([details.position]).includes(subject.taskId)) {
      context.addIssue({ code: "custom", message: "删除位置不能引用任务自身" });
    }
  });
export const taskRestoredEventSchema = z
  .strictObject({
    ...taskEventBase,
    eventType: z.literal("task.restored"),
    eventOrder: z.literal(0),
    details: lifecycleEventDetailsSchema,
  })
  .superRefine(({ details, subject }, context) => {
    if (taskIdsInPositions([details.position]).includes(subject.taskId)) {
      context.addIssue({ code: "custom", message: "恢复位置不能引用任务自身" });
    }
  });

export const categoryCreatedEventSchema = z.strictObject({
  ...categoryEventBase,
  eventType: z.literal("category.created"),
  eventOrder: z.literal(0),
  details: z.strictObject({}),
});
export const categoryRenamedEventSchema = z
  .strictObject({
    ...categoryEventBase,
    eventType: z.literal("category.renamed"),
    eventOrder: z.literal(0),
    details: z.strictObject({ beforeName: categoryNameSchema }),
  })
  .refine(({ details, subject }) => details.beforeName !== subject.name, {
    message: "分类名称变化前后必须不同",
  });
export const categoryReorderedEventSchema = z
  .strictObject({
    ...categoryEventBase,
    eventType: z.literal("category.reordered"),
    eventOrder: z.literal(0),
    details: z.strictObject({
      beforePosition: categoryPositionSchema,
      afterPosition: categoryPositionSchema,
    }),
  })
  .superRefine(({ details, subject }, context) => {
    for (const position of [details.beforePosition, details.afterPosition]) {
      for (const neighbor of [position.previousCategory, position.nextCategory]) {
        if (neighbor.kind === "category" && neighbor.categoryId === subject.categoryId) {
          context.addIssue({ code: "custom", message: "分类位置不能引用主体自身" });
        }
      }
    }
    if (
      JSON.stringify(details.beforePosition) === JSON.stringify(details.afterPosition)
    ) {
      context.addIssue({ code: "custom", message: "分类顺序变化前后必须不同" });
    }
  });
export const categoryDeletedEventSchema = z.strictObject({
  ...categoryEventBase,
  eventType: z.literal("category.deleted"),
  eventOrder: z.literal(0),
  details: z.strictObject({
    affectedTaskCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  }),
});

export const historyEventSchema = z.union([
  taskCreatedEventSchema,
  taskContentChangedEventSchema,
  taskCompletedEventSchema,
  taskReopenedEventSchema,
  taskPriorityChangedEventSchema,
  taskReorderedEventSchema,
  taskCategoryChangedEventSchema,
  taskMovedByCategoryDeletionEventSchema,
  taskTrashedEventSchema,
  taskRestoredEventSchema,
  categoryCreatedEventSchema,
  categoryRenamedEventSchema,
  categoryReorderedEventSchema,
  categoryDeletedEventSchema,
]);

function collectHistoryTaskReferences(value: unknown, references: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectHistoryTaskReferences(item, references);
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (record.kind === "task" && typeof record.taskId === "string") {
    references.push(record.taskId);
  }
  for (const nested of Object.values(record)) {
    collectHistoryTaskReferences(nested, references);
  }
}

export const activationRecordSchema = z
  .strictObject({
    state: z.enum(["initializing", "active"]),
    generation: uuidV4Schema,
    schemaVersion: z.union([z.literal(1), z.literal(2)]),
    compatibleAppVersion: z.union([z.literal("0.1.0"), z.literal("0.2.0")]),
  })
  .superRefine(({ compatibleAppVersion, schemaVersion }, context) => {
    if (
      (schemaVersion === 1 && compatibleAppVersion !== "0.1.0") ||
      (schemaVersion === 2 && compatibleAppVersion !== "0.2.0")
    ) {
      context.addIssue({ code: "custom", message: "数据库与应用版本不兼容" });
    }
  });

export const workspaceMetaSchema = z.strictObject({
  nextOperationSequence: operationSequenceSchema,
});

export const backupDataSchema = z
  .strictObject({
    meta: workspaceMetaSchema,
    categories: z.array(categorySchema),
    tasks: z.array(taskSchema),
    categoryOrder: z.array(uuidV4Schema),
    taskOrderByCategory: z.array(taskOrderGroupSchema),
    drafts: z.array(draftSchema),
    history: z.array(historyEventSchema),
  })
  .superRefine((workspace, context) => {
    const categoryIds = workspace.categories.map(({ id }) => id);
    const categoryIdSet = new Set(categoryIds);
    if (categoryIdSet.size !== categoryIds.length) {
      context.addIssue({ code: "custom", message: "分类标识必须唯一" });
    }
    const categoryNames = workspace.categories.map(({ name }) => name);
    if (
      new Set(categoryNames).size !== categoryNames.length ||
      categoryNames.some((name) => name.toLocaleLowerCase("en-US") === "inbox") ||
      workspace.categories.some(({ name }) => name === "收件箱")
    ) {
      context.addIssue({ code: "custom", message: "分类名称重复或使用系统保留名" });
    }
    if (
      workspace.categoryOrder.length !== categoryIds.length ||
      new Set(workspace.categoryOrder).size !== workspace.categoryOrder.length ||
      workspace.categoryOrder.some((id) => !categoryIdSet.has(id))
    ) {
      context.addIssue({ code: "custom", message: "分类顺序不完整" });
    }

    const taskIds = workspace.tasks.map(({ id }) => id);
    const taskIdSet = new Set(taskIds);
    if (taskIdSet.size !== taskIds.length) {
      context.addIssue({ code: "custom", message: "任务标识必须唯一" });
    }

    const groupKeys = workspace.taskOrderByCategory.map(({ categoryRef }) =>
      categoryRef.kind === "inbox" ? "inbox" : `custom:${categoryRef.categoryId}`,
    );
    const requiredGroupKeys = ["inbox", ...categoryIds.map((id) => `custom:${id}`)];
    if (
      groupKeys.length !== requiredGroupKeys.length ||
      new Set(groupKeys).size !== groupKeys.length ||
      requiredGroupKeys.some((key) => !groupKeys.includes(key))
    ) {
      context.addIssue({ code: "custom", message: "任务分类分组不完整" });
    }

    const orderedTaskIds = workspace.taskOrderByCategory.flatMap(
      ({ taskIds: groupTaskIds }) => groupTaskIds,
    );
    const activeTaskIds = workspace.tasks
      .filter(({ lifecycle }) => lifecycle.kind === "active")
      .map(({ id }) => id);
    if (
      orderedTaskIds.length !== activeTaskIds.length ||
      new Set(orderedTaskIds).size !== orderedTaskIds.length ||
      activeTaskIds.some((id) => !orderedTaskIds.includes(id)) ||
      orderedTaskIds.some((id) => !taskIdSet.has(id))
    ) {
      context.addIssue({ code: "custom", message: "活动任务顺序不完整" });
    }
    for (const task of workspace.tasks) {
      if (task.lifecycle.kind !== "trashed") continue;
      for (const anchor of [
        task.lifecycle.previousTaskAnchor,
        task.lifecycle.nextTaskAnchor,
      ]) {
        if (anchor.kind === "task" && !taskIdSet.has(anchor.taskId)) {
          context.addIssue({ code: "custom", message: "恢复锚点任务不存在" });
        }
      }
    }

    const entryKeys = workspace.drafts.map(({ entry }) =>
      entry.kind === "global"
        ? "global"
        : entry.categoryRef.kind === "inbox"
          ? "category:inbox"
          : `category:custom:${entry.categoryRef.categoryId}`,
    );
    const generations = workspace.drafts.map(({ generation }) => generation);
    if (new Set(entryKeys).size !== entryKeys.length) {
      context.addIssue({ code: "custom", message: "草稿入口必须唯一" });
    }
    if (new Set(generations).size !== generations.length) {
      context.addIssue({ code: "custom", message: "草稿代次必须唯一" });
    }
    for (const draft of workspace.drafts) {
      if (
        draft.entry.kind === "category" &&
        draft.entry.categoryRef.kind === "custom" &&
        !categoryIdSet.has(draft.entry.categoryRef.categoryId)
      ) {
        context.addIssue({ code: "custom", message: "草稿分类不存在" });
      }
    }

    const historyKeys = workspace.history.map(
      ({ eventOrder, operationSequence }) => `${operationSequence}:${eventOrder}`,
    );
    if (new Set(historyKeys).size !== historyKeys.length) {
      context.addIssue({ code: "custom", message: "历史逻辑键必须唯一" });
    }
    for (const event of workspace.history) {
      if (event.subjectType === "task" && !taskIdSet.has(event.subject.taskId)) {
        context.addIssue({ code: "custom", message: "历史任务主体不存在" });
      }
      const references: string[] = [];
      collectHistoryTaskReferences(event.details, references);
      for (const taskId of references) {
        if (!taskIdSet.has(taskId)) {
          context.addIssue({ code: "custom", message: "历史邻居不存在" });
        }
      }
      if (
        BigInt(event.operationSequence) >= BigInt(workspace.meta.nextOperationSequence)
      ) {
        context.addIssue({ code: "custom", message: "下一操作顺序未推进" });
      }
    }

    const eventsByOperation = new Map<string, HistoryEvent[]>();
    for (const event of workspace.history) {
      const events = eventsByOperation.get(event.operationSequence) ?? [];
      events.push(event);
      eventsByOperation.set(event.operationSequence, events);
    }
    for (const events of eventsByOperation.values()) {
      const ordered = [...events].sort(
        (left, right) => left.eventOrder - right.eventOrder,
      );
      if (new Set(ordered.map(({ occurredAt }) => occurredAt)).size !== 1) {
        context.addIssue({ code: "custom", message: "同一操作的事件时间必须一致" });
      }
      const base = ordered.find(({ eventOrder }) => eventOrder === 0);
      if (!base) {
        context.addIssue({ code: "custom", message: "历史操作缺少主事件" });
        continue;
      }

      if (base.eventType === "category.created") {
        if (ordered.length === 1) continue;
        const derived = ordered[1];
        if (
          ordered.length !== 2 ||
          derived?.eventOrder !== 1 ||
          derived.eventType !== "task.category_changed" ||
          derived.details.target.categorySnapshot.ref.kind !== "custom" ||
          derived.details.target.categorySnapshot.ref.categoryId !==
            base.subject.categoryId ||
          !("name" in derived.details.target.categorySnapshot) ||
          derived.details.target.categorySnapshot.name !== base.subject.name
        ) {
          context.addIssue({
            code: "custom",
            message: "分类创建操作的派生任务事件不匹配",
          });
        }
        continue;
      }

      if (base.eventType === "category.deleted") {
        for (const derived of ordered.slice(1)) {
          if (
            derived.eventType !== "task.moved_to_inbox_by_category_deletion" ||
            derived.eventOrder > base.details.affectedTaskCount ||
            derived.details.source.categorySnapshot.ref.categoryId !==
              base.subject.categoryId ||
            derived.details.source.categorySnapshot.name !== base.subject.name
          ) {
            context.addIssue({
              code: "custom",
              message: "分类删除操作的派生任务事件不匹配",
            });
          }
        }
        continue;
      }

      if (ordered.length !== 1) {
        context.addIssue({ code: "custom", message: "普通历史操作只能包含一个事件" });
      }
    }
  });

export const backupEnvelopeSchema = z.strictObject({
  format: z.literal("desktop-pull-backup"),
  formatVersion: z.literal(1),
  schemaVersion: z.literal(1),
  appVersion: z.union([z.literal("0.1.0"), z.literal("0.2.0")]),
  exportedAt: utcTimeSchema,
  data: backupDataSchema,
});

export type ActivationRecord = z.infer<typeof activationRecordSchema>;
export type Category = z.infer<typeof categorySchema>;
export type CategoryRef = z.infer<typeof categoryRefSchema>;
export type CategorySnapshot = z.infer<typeof categorySnapshotSchema>;
export type CategoryPosition = z.infer<typeof categoryPositionSchema>;
export type DraftEntry = z.infer<typeof draftEntrySchema>;
export type DraftRecord = z.infer<typeof draftSchema>;
export type HistoryEvent = z.infer<typeof historyEventSchema>;
export type Task = z.infer<typeof taskSchema>;
export type TaskCreatedEvent = z.infer<typeof taskCreatedEventSchema>;
export type TaskOrderGroup = z.infer<typeof taskOrderGroupSchema>;
export type TaskPosition = z.infer<typeof taskPositionSchema>;
export type TaskPriority = z.infer<typeof taskPrioritySchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;
