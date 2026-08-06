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
export const taskSchema = z
  .strictObject({
    id: uuidV4Schema,
    title: taskTitleSchema,
    notes: z.string(),
    status: z.enum(["open", "completed"]),
    priority: z.enum(["P0", "P1", "P2", "P3", "P4", "P5"]),
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

export const taskCreatedDetailsSchema = z.strictObject({
  categorySnapshot: categorySnapshotSchema,
  position: taskPositionSchema,
});
export const taskCreatedEventSchema = z
  .strictObject({
    subjectType: z.literal("task"),
    subject: z.strictObject({
      taskId: uuidV4Schema,
      title: taskTitleSchema,
    }),
    eventType: z.literal("task.created"),
    occurredAt: utcTimeSchema,
    operationSequence: operationSequenceSchema,
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

export const activationRecordSchema = z.strictObject({
  state: z.enum(["initializing", "active"]),
  generation: uuidV4Schema,
  schemaVersion: z.literal(1),
  compatibleAppVersion: z.literal("0.1.0"),
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
    history: z.array(taskCreatedEventSchema),
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
      if (!taskIdSet.has(event.subject.taskId)) {
        context.addIssue({ code: "custom", message: "历史任务主体不存在" });
      }
      for (const neighbor of [
        event.details.position.previousTask,
        event.details.position.nextTask,
      ]) {
        if (neighbor.kind === "task" && !taskIdSet.has(neighbor.taskId)) {
          context.addIssue({ code: "custom", message: "历史邻居不存在" });
        }
      }
      if (
        BigInt(event.operationSequence) >= BigInt(workspace.meta.nextOperationSequence)
      ) {
        context.addIssue({ code: "custom", message: "下一操作顺序未推进" });
      }
    }
  });

export const backupEnvelopeSchema = z.strictObject({
  format: z.literal("desktop-pull-backup"),
  formatVersion: z.literal(1),
  schemaVersion: z.literal(1),
  appVersion: z.literal("0.1.0"),
  exportedAt: utcTimeSchema,
  data: backupDataSchema,
});

export type ActivationRecord = z.infer<typeof activationRecordSchema>;
export type Category = z.infer<typeof categorySchema>;
export type CategoryRef = z.infer<typeof categoryRefSchema>;
export type CategorySnapshot = z.infer<typeof categorySnapshotSchema>;
export type DraftEntry = z.infer<typeof draftEntrySchema>;
export type DraftRecord = z.infer<typeof draftSchema>;
export type Task = z.infer<typeof taskSchema>;
export type TaskCreatedEvent = z.infer<typeof taskCreatedEventSchema>;
export type TaskOrderGroup = z.infer<typeof taskOrderGroupSchema>;
export type TaskPosition = z.infer<typeof taskPositionSchema>;
