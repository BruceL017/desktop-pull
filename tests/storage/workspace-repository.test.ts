import { openDB } from "idb";
import { describe, expect, it } from "vitest";
import { freezeCreateIntent } from "../../src/domain/create-task";
import { freezeCategoryCreate } from "../../src/domain/operations";
import {
  categoryRefKey,
  draftEntryKey,
  emptyWorkspace,
  type WorkspaceSnapshot,
} from "../../src/domain/workspace";
import { bootstrapDatabase, readWorkspace } from "../../src/storage/database";
import {
  CONTROL_DATABASE_NAME,
  type ControlDatabaseSchema,
  type CoreDatabaseSchema,
  coreDatabaseName,
} from "../../src/storage/database-schema";
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

function legacyWorkspace(): WorkspaceSnapshot {
  const created = intent();
  const withTask: WorkspaceSnapshot = {
    ...emptyWorkspace(),
    meta: { nextOperationSequence: created.nextOperationSequence },
    tasks: [created.task],
    taskOrderByCategory: [
      { categoryRef: { kind: "inbox" }, taskIds: created.resultTaskIds },
    ],
    drafts: [draftB],
    history: [created.history],
  };
  return freezeCategoryCreate(withTask, "Work", undefined, {
    categoryId: "50000000-0000-4000-8000-000000000001",
    occurredAt: "2026-08-05T02:02:03.004Z",
  }).result;
}

async function installLegacyDatabase(workspace: WorkspaceSnapshot): Promise<string> {
  const generation = "60000000-0000-4000-8000-000000000001";
  const control = await openDB<ControlDatabaseSchema>(CONTROL_DATABASE_NAME, 1, {
    upgrade(database) {
      database.createObjectStore("activation");
    },
  });
  await control.put(
    "activation",
    {
      state: "active",
      generation,
      schemaVersion: 1,
      compatibleAppVersion: "0.1.0",
    },
    "current",
  );
  control.close();

  const core = await openDB<CoreDatabaseSchema>(coreDatabaseName(generation), 1, {
    upgrade(database) {
      database.createObjectStore("tasks", { keyPath: "id" });
      database.createObjectStore("categories", { keyPath: "id" });
      database.createObjectStore("taskOrderByCategory");
      database.createObjectStore("drafts");
      const history = database.createObjectStore("history");
      history.createIndex("byTaskSubject", "subject.taskId");
      history.createIndex("byCategorySubject", "subject.categoryId");
      database.createObjectStore("meta");
    },
  });
  const transaction = core.transaction(
    ["tasks", "categories", "taskOrderByCategory", "drafts", "history", "meta"],
    "readwrite",
  );
  for (const task of workspace.tasks) {
    await transaction.objectStore("tasks").put(task);
  }
  for (const category of workspace.categories) {
    await transaction.objectStore("categories").put(category);
  }
  for (const group of workspace.taskOrderByCategory) {
    await transaction
      .objectStore("taskOrderByCategory")
      .put(group, categoryRefKey(group.categoryRef));
  }
  for (const draft of workspace.drafts) {
    await transaction.objectStore("drafts").put(draft, draftEntryKey(draft.entry));
  }
  for (const event of workspace.history) {
    await transaction
      .objectStore("history")
      .put(event, [event.operationSequence, event.eventOrder]);
  }
  await transaction.objectStore("meta").put(workspace.categoryOrder, "categoryOrder");
  await transaction
    .objectStore("meta")
    .put(workspace.meta.nextOperationSequence, "nextOperationSequence");
  await transaction.done;
  core.close();
  return generation;
}

describe("WorkspaceRepository", () => {
  it("initializes and activates the exact empty v2 workspace", async () => {
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

  it("atomically rolls back and idempotently retries a six-store mutation", async () => {
    (
      globalThis as { __DESKTOP_PULL_TEST_FAILURES__?: Record<string, number> }
    ).__DESKTOP_PULL_TEST_FAILURES__ = { "mutation.afterCategories": 1 };
    const repository = new WorkspaceRepository(await bootstrapDatabase());
    const mutation = freezeCategoryCreate(emptyWorkspace(), "Work", undefined, {
      categoryId: "50000000-0000-4000-8000-000000000001",
      occurredAt: "2026-08-05T01:02:03.004Z",
    });

    await expect(repository.commitMutation(mutation)).rejects.toThrow();
    expect(await repository.read()).toEqual(emptyWorkspace());

    await repository.commitMutation(mutation);
    await repository.commitMutation(mutation);
    const stored = await repository.read();
    repository.close();
    expect({
      ...stored,
      taskOrderByCategory: [...stored.taskOrderByCategory].sort((left, right) =>
        JSON.stringify(left.categoryRef).localeCompare(JSON.stringify(right.categoryRef)),
      ),
    }).toEqual({
      ...mutation.result,
      taskOrderByCategory: [...mutation.result.taskOrderByCategory].sort((left, right) =>
        JSON.stringify(left.categoryRef).localeCompare(JSON.stringify(right.categoryRef)),
      ),
    });
  });

  it("removes a provably inactive core generation before opening user data", async () => {
    const initial = await bootstrapDatabase();
    const activeName = coreDatabaseName(initial.activation.generation);
    initial.core.close();
    initial.control.close();
    const extraName = coreDatabaseName("60000000-0000-4000-8000-000000000001");
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(extraName, 1);
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });

    const handle = await bootstrapDatabase();
    const coreNames = (await indexedDB.databases()).flatMap(({ name }) =>
      name?.startsWith("desktop-pull-core-") ? [name] : [],
    );
    expect(coreNames).toEqual([activeName]);
    handle.core.close();
    handle.control.close();
  });

  it("migrates a complete v1 workspace through an isolated v2 candidate", async () => {
    const workspace = legacyWorkspace();
    const legacyGeneration = await installLegacyDatabase(workspace);

    const handle = await bootstrapDatabase();
    expect(handle.activation).toMatchObject({
      state: "active",
      schemaVersion: 2,
      compatibleAppVersion: "0.2.0",
    });
    expect(handle.activation.generation).not.toBe(legacyGeneration);
    expect(handle.core.version).toBe(2);
    const migrated = await readWorkspace(handle.core, 2);
    const coreNames = (await indexedDB.databases()).flatMap(({ name }) =>
      name?.startsWith("desktop-pull-core-") ? [name] : [],
    );
    handle.core.close();
    handle.control.close();
    expect({
      ...migrated,
      taskOrderByCategory: [...migrated.taskOrderByCategory].sort((left, right) =>
        categoryRefKey(left.categoryRef).localeCompare(categoryRefKey(right.categoryRef)),
      ),
    }).toEqual({
      ...workspace,
      taskOrderByCategory: [...workspace.taskOrderByCategory].sort((left, right) =>
        categoryRefKey(left.categoryRef).localeCompare(categoryRefKey(right.categoryRef)),
      ),
    });
    expect(coreNames).toEqual([coreDatabaseName(handle.activation.generation)]);
  });

  it("leaves the v1 activation and data untouched when candidate migration fails", async () => {
    const workspace = legacyWorkspace();
    const legacyGeneration = await installLegacyDatabase(workspace);
    (
      globalThis as { __DESKTOP_PULL_TEST_FAILURES__?: Record<string, number> }
    ).__DESKTOP_PULL_TEST_FAILURES__ = { "migration.beforeUpgrade": 1 };

    await expect(bootstrapDatabase()).rejects.toThrow();
    const control = await openDB<ControlDatabaseSchema>(CONTROL_DATABASE_NAME, 1);
    expect(await control.get("activation", "current")).toEqual({
      state: "active",
      generation: legacyGeneration,
      schemaVersion: 1,
      compatibleAppVersion: "0.1.0",
    });
    control.close();
    const coreNames = (await indexedDB.databases()).flatMap(({ name }) =>
      name?.startsWith("desktop-pull-core-") ? [name] : [],
    );
    expect(coreNames).toEqual([coreDatabaseName(legacyGeneration)]);
    const legacy = await openDB<CoreDatabaseSchema>(
      coreDatabaseName(legacyGeneration),
      1,
    );
    const retained = await readWorkspace(legacy, 1);
    legacy.close();
    expect({
      ...retained,
      taskOrderByCategory: [...retained.taskOrderByCategory].sort((left, right) =>
        categoryRefKey(left.categoryRef).localeCompare(categoryRefKey(right.categoryRef)),
      ),
    }).toEqual({
      ...workspace,
      taskOrderByCategory: [...workspace.taskOrderByCategory].sort((left, right) =>
        categoryRefKey(left.categoryRef).localeCompare(categoryRefKey(right.categoryRef)),
      ),
    });
  });

  it("resumes deterministically after activation but before old-generation cleanup", async () => {
    const workspace = legacyWorkspace();
    const legacyGeneration = await installLegacyDatabase(workspace);
    (
      globalThis as { __DESKTOP_PULL_TEST_FAILURES__?: Record<string, number> }
    ).__DESKTOP_PULL_TEST_FAILURES__ = { "migration.afterActivation": 1 };

    await expect(bootstrapDatabase()).rejects.toThrow();
    let coreNames = (await indexedDB.databases()).flatMap(({ name }) =>
      name?.startsWith("desktop-pull-core-") ? [name] : [],
    );
    expect(coreNames).toHaveLength(2);
    expect(coreNames).toContain(coreDatabaseName(legacyGeneration));

    delete (globalThis as { __DESKTOP_PULL_TEST_FAILURES__?: unknown })
      .__DESKTOP_PULL_TEST_FAILURES__;
    const resumed = await bootstrapDatabase();
    expect(resumed.activation.schemaVersion).toBe(2);
    const migrated = await readWorkspace(resumed.core, 2);
    coreNames = (await indexedDB.databases()).flatMap(({ name }) =>
      name?.startsWith("desktop-pull-core-") ? [name] : [],
    );
    resumed.core.close();
    resumed.control.close();
    expect({
      ...migrated,
      taskOrderByCategory: [...migrated.taskOrderByCategory].sort((left, right) =>
        categoryRefKey(left.categoryRef).localeCompare(categoryRefKey(right.categoryRef)),
      ),
    }).toEqual({
      ...workspace,
      taskOrderByCategory: [...workspace.taskOrderByCategory].sort((left, right) =>
        categoryRefKey(left.categoryRef).localeCompare(categoryRefKey(right.categoryRef)),
      ),
    });
    expect(coreNames).toEqual([coreDatabaseName(resumed.activation.generation)]);
  });
});
