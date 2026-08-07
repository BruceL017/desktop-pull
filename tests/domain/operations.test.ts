import { describe, expect, it } from "vitest";
import { applyCreateIntent, freezeCreateIntent } from "../../src/domain/create-task";
import {
  freezeCategoryCreate,
  freezeCategoryDelete,
  freezeCategoryRename,
  freezeCategoryReorder,
  freezeExpiredCleanup,
  freezePermanentDelete,
  freezeTaskContent,
  freezeTaskMove,
  freezeTaskPriority,
  freezeTaskRestore,
  freezeTaskStatus,
  freezeTaskTrash,
  type WorkspaceMutation,
} from "../../src/domain/operations";
import { backupDataSchema, historyEventSchema } from "../../src/domain/schemas";
import { emptyWorkspace, type WorkspaceSnapshot } from "../../src/domain/workspace";

const ids = {
  alpha: "10000000-0000-4000-8000-000000000001",
  beta: "10000000-0000-4000-8000-000000000002",
  gamma: "10000000-0000-4000-8000-000000000003",
  categoryA: "20000000-0000-4000-8000-000000000001",
  categoryB: "20000000-0000-4000-8000-000000000002",
};

function createTask(
  workspace: WorkspaceSnapshot,
  title: string,
  taskId: string,
  sequence: number,
  previousTaskId?: string,
): WorkspaceSnapshot {
  const draft = {
    entry: { kind: "global" as const },
    generation: `30000000-0000-4000-8000-${sequence.toString().padStart(12, "0")}`,
    title,
    cursorOffset: title.length,
  };
  return applyCreateIntent(
    { ...workspace, drafts: [draft] },
    freezeCreateIntent({
      workspace: { ...workspace, drafts: [draft] },
      draft,
      taskId,
      submissionId: `40000000-0000-4000-8000-${sequence.toString().padStart(12, "0")}`,
      occurredAt: `2026-01-${sequence.toString().padStart(2, "0")}T00:00:00.000Z`,
      previousTaskId,
    }),
  );
}

function result(mutation: WorkspaceMutation | null): WorkspaceSnapshot {
  expect(mutation).not.toBeNull();
  return (mutation as WorkspaceMutation).result;
}

describe("workspace operations", () => {
  it("produces the complete strict 14-event vocabulary through normal operations", () => {
    let workspace = emptyWorkspace();
    workspace = createTask(workspace, "Alpha", ids.alpha, 1);
    workspace = createTask(workspace, "Beta", ids.beta, 2, ids.alpha);
    workspace = createTask(workspace, "Gamma", ids.gamma, 3, ids.beta);
    workspace = result(
      freezeTaskContent(workspace, ids.alpha, "Alpha edited", "notes", {
        occurredAt: "2026-01-04T00:00:00.000Z",
      }),
    );
    workspace = result(
      freezeTaskPriority(workspace, ids.alpha, "P1", {
        occurredAt: "2026-01-05T00:00:00.000Z",
      }),
    );
    workspace = result(
      freezeTaskStatus(workspace, ids.alpha, "completed", {
        occurredAt: "2026-01-06T00:00:00.000Z",
      }),
    );
    workspace = result(
      freezeTaskStatus(workspace, ids.alpha, "open", {
        occurredAt: "2026-01-07T00:00:00.000Z",
      }),
    );
    workspace = result(
      freezeTaskMove(workspace, ids.gamma, { kind: "inbox" }, 0, {
        occurredAt: "2026-01-08T00:00:00.000Z",
      }),
    );
    workspace = freezeCategoryCreate(workspace, "Work", undefined, {
      categoryId: ids.categoryA,
      occurredAt: "2026-01-09T00:00:00.000Z",
    }).result;
    workspace = freezeCategoryCreate(workspace, "Personal", undefined, {
      categoryId: ids.categoryB,
      occurredAt: "2026-01-10T00:00:00.000Z",
    }).result;
    workspace = result(
      freezeCategoryReorder(workspace, ids.categoryB, 0, {
        occurredAt: "2026-01-11T00:00:00.000Z",
      }),
    );
    workspace = result(
      freezeTaskMove(
        workspace,
        ids.alpha,
        { kind: "custom", categoryId: ids.categoryA },
        0,
        { occurredAt: "2026-01-12T00:00:00.000Z" },
      ),
    );
    workspace = result(
      freezeCategoryRename(workspace, ids.categoryA, "Work renamed", {
        occurredAt: "2026-01-13T00:00:00.000Z",
      }),
    );
    workspace = freezeCategoryDelete(workspace, ids.categoryA, {
      occurredAt: "2026-01-14T00:00:00.000Z",
    }).result;
    workspace = freezeTaskTrash(workspace, ids.alpha, {
      occurredAt: "2026-01-15T00:00:00.000Z",
    }).result;
    workspace = result(
      freezeTaskRestore(workspace, ids.alpha, {
        occurredAt: "2026-01-16T00:00:00.000Z",
      }),
    );

    expect(workspace.history.map((event) => historyEventSchema.parse(event))).toEqual(
      workspace.history,
    );
    expect(new Set(workspace.history.map(({ eventType }) => eventType))).toEqual(
      new Set([
        "task.created",
        "task.content_changed",
        "task.completed",
        "task.reopened",
        "task.priority_changed",
        "task.reordered",
        "task.category_changed",
        "task.moved_to_inbox_by_category_deletion",
        "task.trashed",
        "task.restored",
        "category.created",
        "category.renamed",
        "category.reordered",
        "category.deleted",
      ]),
    );
  });

  it("permanently removes task identity and deidentifies retained references", () => {
    let workspace = createTask(emptyWorkspace(), "Alpha", ids.alpha, 1);
    workspace = createTask(workspace, "Beta", ids.beta, 2, ids.alpha);
    workspace = freezeTaskTrash(workspace, ids.alpha, {
      occurredAt: "2026-01-03T00:00:00.000Z",
    }).result;

    const cleaned = result(freezePermanentDelete(workspace, [ids.alpha]));
    const serialized = JSON.stringify(cleaned);

    expect(cleaned.meta.nextOperationSequence).toBe(workspace.meta.nextOperationSequence);
    expect(serialized).not.toContain(ids.alpha);
    expect(serialized).not.toContain("Alpha");
    expect(serialized).toContain('"kind":"unavailable"');
  });

  it("enforces the expiry boundary without consuming an operation sequence", () => {
    let workspace = createTask(emptyWorkspace(), "Alpha", ids.alpha, 1);
    workspace = freezeTaskTrash(workspace, ids.alpha, {
      occurredAt: "2026-01-01T00:00:00.000Z",
    }).result;
    const expiresAt = "2026-01-31T00:00:00.000Z";

    expect(
      freezeTaskRestore(workspace, ids.alpha, {
        occurredAt: expiresAt,
      }),
    ).toBeNull();
    const cleanup = freezeExpiredCleanup(workspace, expiresAt);
    expect(cleanup?.result.tasks).toEqual([]);
    expect(cleanup?.result.meta.nextOperationSequence).toBe(
      workspace.meta.nextOperationSequence,
    );
  });

  it("rejects malformed task-position references in imported workspaces", () => {
    let workspace = createTask(emptyWorkspace(), "Alpha", ids.alpha, 1);
    workspace = createTask(workspace, "Beta", ids.beta, 2, ids.alpha);
    const malformed = structuredClone(workspace);
    const created = malformed.history.find(
      (event) => event.eventType === "task.created" && event.subject.taskId === ids.beta,
    );
    expect(created?.eventType).toBe("task.created");
    if (created?.eventType !== "task.created") return;
    created.details.position.previousTask = {
      kind: "task",
      taskId: ids.beta,
      title: "Beta",
    };

    expect(backupDataSchema.safeParse(malformed).success).toBe(false);
  });

  it("validates compound history operations while accepting cleaned projections", () => {
    let workspace = createTask(emptyWorkspace(), "Alpha", ids.alpha, 1);
    workspace = freezeCategoryCreate(workspace, "Work", ids.alpha, {
      categoryId: ids.categoryA,
      occurredAt: "2026-01-02T00:00:00.000Z",
    }).result;
    expect(backupDataSchema.safeParse(workspace).success).toBe(true);

    const orphan = structuredClone(workspace);
    const createSequence = orphan.history.find(
      (event) => event.eventType === "category.created",
    )?.operationSequence;
    orphan.history = orphan.history.filter(
      (event) =>
        !(
          event.operationSequence === createSequence &&
          event.eventType === "category.created"
        ),
    );
    expect(backupDataSchema.safeParse(orphan).success).toBe(false);

    const mismatched = structuredClone(workspace);
    const moved = mismatched.history.find(
      (event) =>
        event.operationSequence === createSequence &&
        event.eventType === "task.category_changed",
    );
    expect(moved?.eventType).toBe("task.category_changed");
    if (moved?.eventType !== "task.category_changed") return;
    if (!("name" in moved.details.target.categorySnapshot)) return;
    moved.details.target.categorySnapshot.name = "Wrong category";
    expect(backupDataSchema.safeParse(mismatched).success).toBe(false);

    workspace = freezeTaskTrash(workspace, ids.alpha, {
      occurredAt: "2026-01-03T00:00:00.000Z",
    }).result;
    const cleaned = result(freezePermanentDelete(workspace, [ids.alpha]));
    expect(backupDataSchema.safeParse(cleaned).success).toBe(true);
    expect(
      cleaned.history.some(
        (event) =>
          event.operationSequence === createSequence &&
          event.eventType === "category.created",
      ),
    ).toBe(true);
  });

  it("rejects category-deletion events outside their declared operation bounds", () => {
    let workspace = createTask(emptyWorkspace(), "Alpha", ids.alpha, 1);
    workspace = freezeCategoryCreate(workspace, "Work", ids.alpha, {
      categoryId: ids.categoryA,
      occurredAt: "2026-01-02T00:00:00.000Z",
    }).result;
    workspace = freezeCategoryDelete(workspace, ids.categoryA, {
      occurredAt: "2026-01-03T00:00:00.000Z",
    }).result;
    const malformed = structuredClone(workspace);
    const moved = malformed.history.find(
      (event) => event.eventType === "task.moved_to_inbox_by_category_deletion",
    );
    expect(moved?.eventType).toBe("task.moved_to_inbox_by_category_deletion");
    if (moved?.eventType !== "task.moved_to_inbox_by_category_deletion") {
      return;
    }
    moved.eventOrder = 2;

    expect(backupDataSchema.safeParse(malformed).success).toBe(false);
  });
});
