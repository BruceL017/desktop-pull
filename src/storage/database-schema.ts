import type { DBSchema } from "idb";
import type {
  ActivationRecord,
  Category,
  DraftRecord,
  HistoryEvent,
  Task,
  TaskOrderGroup,
} from "../domain/schemas";

export const CONTROL_DATABASE_NAME = "desktop-pull-control";
export const CONTROL_DATABASE_VERSION = 1;
export const CORE_DATABASE_VERSION = 2;
export const APP_VERSION = "0.2.0";

export interface ControlDatabaseSchema extends DBSchema {
  activation: {
    key: "current";
    value: ActivationRecord;
  };
}

export interface CoreDatabaseSchema extends DBSchema {
  tasks: {
    key: string;
    value: Task;
  };
  categories: {
    key: string;
    value: Category;
  };
  taskOrderByCategory: {
    key: string;
    value: TaskOrderGroup;
  };
  drafts: {
    key: string;
    value: DraftRecord;
  };
  history: {
    key: [string, number];
    value: HistoryEvent;
    indexes: {
      byTaskSubject: string;
      byCategorySubject: string;
    };
  };
  meta: {
    key: "categoryOrder" | "nextOperationSequence" | "schemaVersion";
    value: string[] | string | number;
  };
}

export type RepositoryFailurePoint =
  | "draft.beforeWrite"
  | "draft.afterWrite"
  | "create.beforeWrite"
  | "create.afterTask"
  | "create.afterOrder"
  | "create.afterHistory"
  | "create.afterMeta"
  | "create.afterDraft"
  | "mutation.beforeWrite"
  | "mutation.afterClear"
  | "mutation.afterTasks"
  | "mutation.afterCategories"
  | "mutation.afterOrder"
  | "mutation.afterDrafts"
  | "mutation.afterHistory"
  | "mutation.afterMeta";

export function consumeTestFailure(point: string): void {
  if (!import.meta.env.DEV) return;
  const failures = (
    globalThis as {
      __DESKTOP_PULL_TEST_FAILURES__?: Record<string, number>;
    }
  ).__DESKTOP_PULL_TEST_FAILURES__;
  const remaining = failures?.[point] ?? 0;
  if (!failures || remaining <= 0) return;
  failures[point] = remaining - 1;
  throw new Error(`测试注入存储失败: ${point}`);
}

export function coreDatabaseName(generation: string): string {
  return `desktop-pull-core-${generation}`;
}
