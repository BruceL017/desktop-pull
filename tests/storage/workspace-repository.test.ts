import { describe, expect, it } from "vitest";
import { freezeCreateIntent } from "../../src/domain/create-task";
import { emptyWorkspace } from "../../src/domain/workspace";
import { bootstrapDatabase } from "../../src/storage/database";
import { WorkspaceRepository } from "../../src/storage/workspace-repository";

const taskId = "10000000-0000-4000-8000-000000000001";
const draftA = {
  entry: { kind: "global" as const },
  generation: "20000000-0000-4000-8000-000000000001",
  title: "A",
  cursorOffset: 1,
};
const draftB = {
  ...draftA,
  generation: "20000000-0000-4000-8000-000000000002",
  title: "B",
};

function intent() {
  return freezeCreateIntent({
    workspace: { ...emptyWorkspace(), drafts: [draftA] },
    draft: draftA,
    taskId,
    submissionId: "30000000-0000-4000-8000-000000000001",
    occurredAt: "2026-08-05T01:02:03.004Z",
  });
}

describe("WorkspaceRepository", () => {
  it("initializes and activates the exact empty v1 workspace", async () => {
    const handle = await bootstrapDatabase();
    const repository = new WorkspaceRepository(handle);

    expect(await repository.read()).toEqual(emptyWorkspace());
    expect(handle.activation.state).toBe("active");
    expect([...handle.core.objectStoreNames]).toEqual([
      "categories",
      "drafts",
      "history",
      "meta",
      "taskOrderByCategory",
      "tasks",
    ]);

    repository.close();
  });

  it("atomically writes task, order, history, sequence and matching draft consumption", async () => {
    const repository = new WorkspaceRepository(await bootstrapDatabase());
    await repository.saveDraft(draftA.entry, draftA);
    await repository.commitCreate(intent());

    const result = await repository.read();
    expect(result.tasks).toHaveLength(1);
    expect(result.taskOrderByCategory[0].taskIds).toEqual([taskId]);
    expect(result.history).toEqual([intent().history]);
    expect(result.meta.nextOperationSequence).toBe("2");
    expect(result.drafts).toEqual([]);

    repository.close();
  });

  it("rolls the whole create transaction back after an injected write failure", async () => {
    const repository = new WorkspaceRepository(await bootstrapDatabase(), (point) => {
      if (point === "create.afterTask") throw new Error("注入失败");
    });
    await repository.saveDraft(draftA.entry, draftA);

    await expect(repository.commitCreate(intent())).rejects.toThrow("注入失败");
    expect(await repository.read()).toEqual({
      ...emptyWorkspace(),
      drafts: [draftA],
    });

    repository.close();
  });

  it("does not duplicate an already committed frozen intent", async () => {
    const repository = new WorkspaceRepository(await bootstrapDatabase());
    await repository.commitCreate(intent());
    await repository.commitCreate(intent());

    const result = await repository.read();
    expect(result.tasks).toHaveLength(1);
    expect(result.history).toHaveLength(1);
    expect(result.taskOrderByCategory[0].taskIds).toEqual([taskId]);

    repository.close();
  });

  it("never lets an old A submission consume a persisted B generation", async () => {
    const repository = new WorkspaceRepository(await bootstrapDatabase());
    await repository.saveDraft(draftB.entry, draftB);
    await repository.commitCreate(intent());

    const result = await repository.read();
    expect(result.tasks).toHaveLength(1);
    expect(result.drafts).toEqual([draftB]);

    repository.close();
  });

  it("strictly rejects an incomplete full read instead of returning an empty workspace", async () => {
    const handle = await bootstrapDatabase();
    const transaction = handle.core.transaction("meta", "readwrite");
    await transaction.objectStore("meta").delete("nextOperationSequence");
    await transaction.done;
    handle.core.close();
    handle.control.close();

    await expect(bootstrapDatabase()).rejects.toThrow();
  });
});
