import type { CreateTaskIntent } from "../domain/create-task";
import {
  backupDataSchema,
  type DraftEntry,
  type DraftRecord,
  draftSchema,
  taskCreatedEventSchema,
  taskSchema,
} from "../domain/schemas";
import {
  categoryRefKey,
  draftEntryKey,
  type WorkspaceSnapshot,
} from "../domain/workspace";
import type { DatabaseHandle } from "./database";
import { readWorkspace } from "./database";
import { consumeTestFailure, type RepositoryFailurePoint } from "./database-schema";

export type FailureInjector = (point: RepositoryFailurePoint) => void;

export interface WorkspaceMutation {
  id: string;
  kind: string;
  expectedOperationSequence: string;
  result: WorkspaceSnapshot;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function canonicalWorkspace(workspace: WorkspaceSnapshot): WorkspaceSnapshot {
  return {
    ...workspace,
    tasks: [...workspace.tasks].sort((left, right) => left.id.localeCompare(right.id)),
    categories: [...workspace.categories].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    taskOrderByCategory: [...workspace.taskOrderByCategory].sort((left, right) =>
      categoryRefKey(left.categoryRef).localeCompare(categoryRefKey(right.categoryRef)),
    ),
    drafts: [...workspace.drafts].sort((left, right) =>
      draftEntryKey(left.entry).localeCompare(draftEntryKey(right.entry)),
    ),
    history: [...workspace.history].sort((left, right) => {
      const sequence = BigInt(left.operationSequence) - BigInt(right.operationSequence);
      return sequence === 0n
        ? left.eventOrder - right.eventOrder
        : sequence < 0n
          ? -1
          : 1;
    }),
  };
}

function abortSafely(transaction: { abort(): void }): void {
  try {
    transaction.abort();
  } catch {
    // A request failure may already have aborted the transaction.
  }
}

export class WorkspaceRepository {
  constructor(
    private readonly handle: DatabaseHandle,
    private readonly injectFailure?: FailureInjector,
  ) {}

  private fail(point: RepositoryFailurePoint): void {
    this.injectFailure?.(point);
    consumeTestFailure(point);
  }

  read(): Promise<WorkspaceSnapshot> {
    return readWorkspace(this.handle.core, this.handle.activation.schemaVersion);
  }

  async saveDraft(entry: DraftEntry, draft: DraftRecord | null): Promise<void> {
    const key = draftEntryKey(entry);
    if (draft && draftEntryKey(draft.entry) !== key) {
      throw new Error("草稿记录与物理入口键不匹配");
    }
    const parsedDraft = draft ? draftSchema.parse(draft) : null;
    const transaction = this.handle.core.transaction("drafts", "readwrite");
    try {
      this.fail("draft.beforeWrite");
      if (parsedDraft) {
        await transaction.objectStore("drafts").put(parsedDraft, key);
      } else {
        await transaction.objectStore("drafts").delete(key);
      }
      this.fail("draft.afterWrite");
      await transaction.done;
    } catch (error) {
      abortSafely(transaction);
      await transaction.done.catch(() => undefined);
      throw error;
    }
  }

  async commitCreate(intent: CreateTaskIntent): Promise<void> {
    const task = taskSchema.parse(intent.task);
    const history = taskCreatedEventSchema.parse(intent.history);
    const groupKey = categoryRefKey(intent.targetCategoryRef);
    const transaction = this.handle.core.transaction(
      ["tasks", "taskOrderByCategory", "drafts", "history", "meta"],
      "readwrite",
    );

    try {
      const [existingTask, existingHistory, group, nextSequence] = await Promise.all([
        transaction.objectStore("tasks").get(task.id),
        transaction
          .objectStore("history")
          .get([history.operationSequence, history.eventOrder]),
        transaction.objectStore("taskOrderByCategory").get(groupKey),
        transaction.objectStore("meta").get("nextOperationSequence"),
      ]);
      if (!group) throw new Error("目标分类顺序缺失");

      if (existingTask || existingHistory) {
        if (
          sameValue(existingTask, task) &&
          sameValue(existingHistory, history) &&
          sameValue(group.taskIds, intent.resultTaskIds) &&
          nextSequence === intent.nextOperationSequence
        ) {
          await transaction.done;
          return;
        }
        throw new Error("持久化创建意图与现有事实冲突");
      }
      if (
        nextSequence !== intent.expectedOperationSequence ||
        !sameValue(group.taskIds, intent.expectedTaskIds)
      ) {
        throw new Error("持久化创建基线不匹配");
      }

      this.fail("create.beforeWrite");
      await transaction.objectStore("tasks").put(task);
      this.fail("create.afterTask");
      await transaction.objectStore("taskOrderByCategory").put(
        {
          categoryRef: intent.targetCategoryRef,
          taskIds: [...intent.resultTaskIds],
        },
        groupKey,
      );
      this.fail("create.afterOrder");
      await transaction
        .objectStore("history")
        .put(history, [history.operationSequence, history.eventOrder]);
      this.fail("create.afterHistory");
      await transaction
        .objectStore("meta")
        .put(intent.nextOperationSequence, "nextOperationSequence");
      this.fail("create.afterMeta");

      const draftKey = draftEntryKey(intent.consumedDraft.entry);
      const persistedDraft = await transaction.objectStore("drafts").get(draftKey);
      if (persistedDraft?.generation === intent.consumedDraft.generation) {
        await transaction.objectStore("drafts").delete(draftKey);
      }
      this.fail("create.afterDraft");
      await transaction.done;
    } catch (error) {
      abortSafely(transaction);
      await transaction.done.catch(() => undefined);
      throw error;
    }
  }

  async commitMutation(input: WorkspaceMutation): Promise<void> {
    const mutation = {
      ...input,
      result: backupDataSchema.parse(input.result),
    };
    const stores = [
      "tasks",
      "categories",
      "taskOrderByCategory",
      "drafts",
      "history",
      "meta",
    ] as const;
    const transaction = this.handle.core.transaction(stores, "readwrite");
    try {
      const currentSequence = await transaction
        .objectStore("meta")
        .get("nextOperationSequence");
      if (currentSequence !== mutation.expectedOperationSequence) {
        if (currentSequence === mutation.result.meta.nextOperationSequence) {
          await transaction.done;
          const current = await this.read();
          if (
            sameValue(canonicalWorkspace(current), canonicalWorkspace(mutation.result))
          ) {
            return;
          }
        }
        throw new Error("持久化正式操作基线不匹配");
      }

      this.fail("mutation.beforeWrite");
      await Promise.all(stores.map((store) => transaction.objectStore(store).clear()));
      this.fail("mutation.afterClear");

      for (const task of mutation.result.tasks) {
        await transaction.objectStore("tasks").put(task);
      }
      this.fail("mutation.afterTasks");
      for (const category of mutation.result.categories) {
        await transaction.objectStore("categories").put(category);
      }
      this.fail("mutation.afterCategories");
      for (const group of mutation.result.taskOrderByCategory) {
        await transaction
          .objectStore("taskOrderByCategory")
          .put(group, categoryRefKey(group.categoryRef));
      }
      this.fail("mutation.afterOrder");
      for (const draft of mutation.result.drafts) {
        await transaction.objectStore("drafts").put(draft, draftEntryKey(draft.entry));
      }
      this.fail("mutation.afterDrafts");
      for (const event of mutation.result.history) {
        await transaction
          .objectStore("history")
          .put(event, [event.operationSequence, event.eventOrder]);
      }
      this.fail("mutation.afterHistory");
      await transaction
        .objectStore("meta")
        .put(mutation.result.categoryOrder, "categoryOrder");
      await transaction
        .objectStore("meta")
        .put(mutation.result.meta.nextOperationSequence, "nextOperationSequence");
      if (this.handle.activation.schemaVersion >= 2) {
        await transaction
          .objectStore("meta")
          .put(this.handle.activation.schemaVersion, "schemaVersion");
      }
      this.fail("mutation.afterMeta");
      await transaction.done;
    } catch (error) {
      abortSafely(transaction);
      await transaction.done.catch(() => undefined);
      throw error;
    }
  }

  close(): void {
    this.handle.core.close();
    this.handle.control.close();
  }
}
