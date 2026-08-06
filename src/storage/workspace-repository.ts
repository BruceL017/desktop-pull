import type { CreateTaskIntent } from "../domain/create-task";
import {
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

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
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
    return readWorkspace(this.handle.core);
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

  close(): void {
    this.handle.core.close();
    this.handle.control.close();
  }
}
