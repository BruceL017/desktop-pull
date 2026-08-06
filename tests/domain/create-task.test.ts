import { describe, expect, it } from "vitest";
import { applyCreateIntent, freezeCreateIntent } from "../../src/domain/create-task";
import {
  emptyWorkspace,
  inboxCategoryRef,
  type WorkspaceSnapshot,
} from "../../src/domain/workspace";

const ids = {
  first: "10000000-0000-4000-8000-000000000001",
  second: "10000000-0000-4000-8000-000000000002",
  third: "10000000-0000-4000-8000-000000000003",
  firstDraft: "20000000-0000-4000-8000-000000000001",
  secondDraft: "20000000-0000-4000-8000-000000000002",
  category: "40000000-0000-4000-8000-000000000001",
  firstSubmission: "30000000-0000-4000-8000-000000000001",
  secondSubmission: "30000000-0000-4000-8000-000000000002",
};

function draft(generation: string, title: string) {
  return {
    entry: { kind: "global" as const },
    generation,
    title,
    cursorOffset: title.length,
  };
}

describe("freezeCreateIntent", () => {
  it("freezes FORMAT-014 defaults and the exact FORMAT-022 history", () => {
    const workspace = emptyWorkspace();
    const intent = freezeCreateIntent({
      workspace,
      draft: draft(ids.firstDraft, "  第一项  "),
      taskId: ids.first,
      submissionId: ids.firstSubmission,
      occurredAt: "2026-08-05T01:02:03.004Z",
    });

    expect(intent.task).toEqual({
      id: ids.first,
      title: "  第一项  ",
      notes: "",
      status: "open",
      priority: "P3",
      createdAt: "2026-08-05T01:02:03.004Z",
      updatedAt: "2026-08-05T01:02:03.004Z",
      lifecycle: { kind: "active" },
    });
    expect(intent.history).toEqual({
      subjectType: "task",
      subject: { taskId: ids.first, title: "  第一项  " },
      eventType: "task.created",
      occurredAt: "2026-08-05T01:02:03.004Z",
      operationSequence: "1",
      eventOrder: 0,
      details: {
        categorySnapshot: { ref: inboxCategoryRef },
        position: {
          previousTask: { kind: "start" },
          nextTask: { kind: "end" },
        },
      },
    });
    expect(intent.nextOperationSequence).toBe("2");
  });

  it("keeps A then B as a contiguous session group without rewriting A", () => {
    const first = freezeCreateIntent({
      workspace: emptyWorkspace(),
      draft: draft(ids.firstDraft, "A"),
      taskId: ids.first,
      submissionId: ids.firstSubmission,
      occurredAt: "2026-08-05T01:00:00.000Z",
    });
    const afterFirst = applyCreateIntent(emptyWorkspace(), first);
    const frozenFirstHistory = structuredClone(afterFirst.history[0]);

    const second = freezeCreateIntent({
      workspace: afterFirst,
      draft: draft(ids.secondDraft, "B"),
      previousTaskId: ids.first,
      taskId: ids.second,
      submissionId: ids.secondSubmission,
      occurredAt: "2026-08-05T01:00:01.000Z",
    });
    const afterSecond = applyCreateIntent(afterFirst, second);

    expect(afterSecond.taskOrderByCategory[0].taskIds).toEqual([ids.first, ids.second]);
    expect(second.history.details.position.previousTask).toEqual({
      kind: "task",
      taskId: ids.first,
      title: "A",
    });
    expect(afterSecond.history[0]).toEqual(frozenFirstHistory);
  });

  it("inserts a new session before the first open task", () => {
    const existing = freezeCreateIntent({
      workspace: emptyWorkspace(),
      draft: draft(ids.firstDraft, "已有任务"),
      taskId: ids.first,
      submissionId: ids.firstSubmission,
      occurredAt: "2026-08-05T01:00:00.000Z",
    });
    const workspace = applyCreateIntent(emptyWorkspace(), existing);

    const nextSession = freezeCreateIntent({
      workspace,
      draft: draft(ids.secondDraft, "新会话任务"),
      taskId: ids.second,
      submissionId: ids.secondSubmission,
      occurredAt: "2026-08-05T01:00:01.000Z",
    });

    expect(nextSession.resultTaskIds).toEqual([ids.second, ids.first]);
    expect(nextSession.history.details.position).toEqual({
      previousTask: { kind: "start" },
      nextTask: { kind: "task", taskId: ids.first, title: "已有任务" },
    });
  });

  it("creates and applies a task for a custom category draft", () => {
    const categoryRef = { kind: "custom" as const, categoryId: ids.category };
    const categoryDraft = {
      entry: { kind: "category" as const, categoryRef },
      generation: ids.firstDraft,
      title: "分类任务",
      cursorOffset: 4,
    };
    const workspace: WorkspaceSnapshot = {
      ...emptyWorkspace(),
      categories: [{ id: ids.category, name: "工作" }],
      categoryOrder: [ids.category],
      taskOrderByCategory: [
        ...emptyWorkspace().taskOrderByCategory,
        { categoryRef, taskIds: [] },
      ],
      drafts: [categoryDraft],
    };

    const intent = freezeCreateIntent({
      workspace,
      draft: categoryDraft,
      taskId: ids.first,
      submissionId: ids.firstSubmission,
      occurredAt: "2026-08-05T01:00:00.000Z",
    });
    const result = applyCreateIntent(workspace, intent);

    expect(intent.history.details.categorySnapshot).toEqual({
      ref: categoryRef,
      name: "工作",
    });
    expect(result.taskOrderByCategory).toEqual([
      { categoryRef: inboxCategoryRef, taskIds: [] },
      { categoryRef, taskIds: [ids.first] },
    ]);
    expect(result.drafts).toEqual([]);
  });

  it("is idempotent for one frozen submission but allows duplicate titles", () => {
    const first = freezeCreateIntent({
      workspace: emptyWorkspace(),
      draft: draft(ids.firstDraft, "相同标题"),
      taskId: ids.first,
      submissionId: ids.firstSubmission,
      occurredAt: "2026-08-05T01:00:00.000Z",
    });
    const once = applyCreateIntent(emptyWorkspace(), first);
    const twice = applyCreateIntent(once, first);
    expect(twice).toEqual(once);

    const second = freezeCreateIntent({
      workspace: once,
      draft: draft(ids.secondDraft, "相同标题"),
      previousTaskId: ids.first,
      taskId: ids.second,
      submissionId: ids.secondSubmission,
      occurredAt: "2026-08-05T01:00:01.000Z",
    });
    const result = applyCreateIntent(once, second);
    expect(result.tasks).toHaveLength(2);
    expect(new Set(result.tasks.map(({ id }) => id))).toEqual(
      new Set([ids.first, ids.second]),
    );
  });

  it("rejects a pure-whitespace task while preserving it as a draft", () => {
    const workspace: WorkspaceSnapshot = {
      ...emptyWorkspace(),
      drafts: [draft(ids.firstDraft, "   ")],
    };

    expect(() =>
      freezeCreateIntent({
        workspace,
        draft: workspace.drafts[0],
        taskId: ids.third,
        submissionId: ids.firstSubmission,
        occurredAt: "2026-08-05T01:00:00.000Z",
      }),
    ).toThrow("任务标题不能为空");
    expect(workspace.drafts).toHaveLength(1);
  });
});
