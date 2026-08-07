import { type IDBPDatabase, openDB } from "idb";
import {
  activationRecordSchema,
  backupDataSchema,
  categorySchema,
  draftSchema,
  historyEventSchema,
  operationSequenceSchema,
  taskOrderGroupSchema,
  taskSchema,
  uuidV4Schema,
} from "../domain/schemas";
import type { WorkspaceSnapshot } from "../domain/workspace";
import { categoryRefKey, draftEntryKey } from "../domain/workspace";
import {
  prepareApplicationVersion,
  promoteApplicationVersion,
  rollbackApplicationVersion,
} from "./app-version-manager";
import {
  APP_VERSION,
  CONTROL_DATABASE_NAME,
  CONTROL_DATABASE_VERSION,
  CORE_DATABASE_VERSION,
  type ControlDatabaseSchema,
  type CoreDatabaseSchema,
  consumeTestFailure,
  coreDatabaseName,
} from "./database-schema";

export interface DatabaseHandle {
  control: IDBPDatabase<ControlDatabaseSchema>;
  core: IDBPDatabase<CoreDatabaseSchema>;
  activation: ReturnType<typeof activationRecordSchema.parse>;
}

const expectedStores = [
  "categories",
  "drafts",
  "history",
  "meta",
  "taskOrderByCategory",
  "tasks",
] as const;

async function databaseNames(): Promise<string[]> {
  if (typeof indexedDB.databases !== "function") {
    throw new Error("浏览器无法证明本地数据库代次");
  }
  return (await indexedDB.databases()).flatMap(({ name }) => (name ? [name] : []));
}

async function deleteDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(`无法清理非活跃数据库代次: ${name}`));
  });
}

async function openControlDatabase(): Promise<IDBPDatabase<ControlDatabaseSchema>> {
  return openDB<ControlDatabaseSchema>(CONTROL_DATABASE_NAME, CONTROL_DATABASE_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains("activation")) {
        database.createObjectStore("activation");
      }
    },
  });
}

function validateControlSchema(control: IDBPDatabase<ControlDatabaseSchema>): void {
  if (JSON.stringify([...control.objectStoreNames]) !== JSON.stringify(["activation"])) {
    throw new Error("控制数据库 object store 结构不匹配");
  }
  const transaction = control.transaction("activation", "readonly");
  if (transaction.objectStore("activation").keyPath !== null) {
    transaction.abort();
    throw new Error("控制数据库 activation 主键结构不匹配");
  }
}

async function openCoreDatabase(
  generation: string,
  version: 1 | 2,
): Promise<IDBPDatabase<CoreDatabaseSchema>> {
  return openDB<CoreDatabaseSchema>(coreDatabaseName(generation), version, {
    upgrade(database, oldVersion, _newVersion, transaction) {
      if (oldVersion === 0) {
        database.createObjectStore("tasks", { keyPath: "id" });
        database.createObjectStore("categories", { keyPath: "id" });
        database.createObjectStore("taskOrderByCategory");
        database.createObjectStore("drafts");
        const history = database.createObjectStore("history");
        history.createIndex("byTaskSubject", "subject.taskId");
        history.createIndex("byCategorySubject", "subject.categoryId");
        database.createObjectStore("meta");

        transaction
          .objectStore("taskOrderByCategory")
          .put({ categoryRef: { kind: "inbox" }, taskIds: [] }, "inbox");
        transaction.objectStore("meta").put([], "categoryOrder");
        transaction.objectStore("meta").put("1", "nextOperationSequence");
      }
      if (oldVersion < 2 && version >= 2) {
        transaction.objectStore("meta").put(2, "schemaVersion");
      }
    },
  });
}

function validatePhysicalSchema(
  core: IDBPDatabase<CoreDatabaseSchema>,
  schemaVersion: 1 | 2,
): void {
  if (
    core.version !== schemaVersion ||
    JSON.stringify([...core.objectStoreNames]) !== JSON.stringify(expectedStores)
  ) {
    throw new Error("核心数据库 object store 结构不匹配");
  }
  const transaction = core.transaction(expectedStores, "readonly");
  const tasks = transaction.objectStore("tasks");
  const categories = transaction.objectStore("categories");
  const groups = transaction.objectStore("taskOrderByCategory");
  const drafts = transaction.objectStore("drafts");
  const history = transaction.objectStore("history");
  const meta = transaction.objectStore("meta");
  if (
    tasks.keyPath !== "id" ||
    categories.keyPath !== "id" ||
    groups.keyPath !== null ||
    drafts.keyPath !== null ||
    history.keyPath !== null ||
    meta.keyPath !== null
  ) {
    transaction.abort();
    throw new Error("核心数据库 object store 主键结构不匹配");
  }
  const indexes = [...history.indexNames];
  if (
    JSON.stringify(indexes) !== JSON.stringify(["byCategorySubject", "byTaskSubject"])
  ) {
    transaction.abort();
    throw new Error("核心数据库历史索引结构不匹配");
  }
  const taskIndex = history.index("byTaskSubject");
  const categoryIndex = history.index("byCategorySubject");
  if (
    taskIndex.keyPath !== "subject.taskId" ||
    categoryIndex.keyPath !== "subject.categoryId" ||
    taskIndex.unique ||
    categoryIndex.unique ||
    taskIndex.multiEntry ||
    categoryIndex.multiEntry
  ) {
    transaction.abort();
    throw new Error("核心数据库历史索引定义不匹配");
  }
}

export async function readWorkspace(
  core: IDBPDatabase<CoreDatabaseSchema>,
  schemaVersion: 1 | 2 = CORE_DATABASE_VERSION,
): Promise<WorkspaceSnapshot> {
  validatePhysicalSchema(core, schemaVersion);
  const transaction = core.transaction(expectedStores, "readonly");
  const [
    tasks,
    categories,
    groups,
    groupKeys,
    drafts,
    draftKeys,
    history,
    historyKeys,
    categoryOrder,
    nextSequence,
    storedSchemaVersion,
    metaKeys,
  ] = await Promise.all([
    transaction.objectStore("tasks").getAll(),
    transaction.objectStore("categories").getAll(),
    transaction.objectStore("taskOrderByCategory").getAll(),
    transaction.objectStore("taskOrderByCategory").getAllKeys(),
    transaction.objectStore("drafts").getAll(),
    transaction.objectStore("drafts").getAllKeys(),
    transaction.objectStore("history").getAll(),
    transaction.objectStore("history").getAllKeys(),
    transaction.objectStore("meta").get("categoryOrder"),
    transaction.objectStore("meta").get("nextOperationSequence"),
    transaction.objectStore("meta").get("schemaVersion"),
    transaction.objectStore("meta").getAllKeys(),
  ]);
  await transaction.done;
  consumeTestFailure("bootstrap.fullRead");

  if (
    groups.some(
      (group, index) => groupKeys[index] !== categoryRefKey(group.categoryRef),
    ) ||
    drafts.some((draft, index) => draftKeys[index] !== draftEntryKey(draft.entry)) ||
    history.some(
      (event, index) =>
        JSON.stringify(historyKeys[index]) !==
        JSON.stringify([event.operationSequence, event.eventOrder]),
    ) ||
    JSON.stringify([...metaKeys].sort()) !==
      JSON.stringify(
        schemaVersion === 1
          ? ["categoryOrder", "nextOperationSequence"]
          : ["categoryOrder", "nextOperationSequence", "schemaVersion"],
      ) ||
    (schemaVersion === 1
      ? storedSchemaVersion !== undefined
      : storedSchemaVersion !== schemaVersion)
  ) {
    throw new Error("核心数据库物理键与逻辑记录不匹配");
  }

  return backupDataSchema.parse({
    meta: { nextOperationSequence: operationSequenceSchema.parse(nextSequence) },
    categories: categories.map((record) => categorySchema.parse(record)),
    tasks: tasks.map((record) => taskSchema.parse(record)),
    categoryOrder: zodUuidArray(categoryOrder),
    taskOrderByCategory: groups.map((record) => taskOrderGroupSchema.parse(record)),
    drafts: drafts.map((record) => draftSchema.parse(record)),
    history: history.map((record) => historyEventSchema.parse(record)),
  });
}

function zodUuidArray(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("分类顺序缺失");
  return value.map((item) => uuidV4Schema.parse(item));
}

async function replaceWorkspace(
  core: IDBPDatabase<CoreDatabaseSchema>,
  workspace: WorkspaceSnapshot,
): Promise<void> {
  const transaction = core.transaction(expectedStores, "readwrite");
  await Promise.all(
    expectedStores.map((store) => transaction.objectStore(store).clear()),
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
}

async function coreDatabaseVersions(): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  for (const database of await indexedDB.databases()) {
    if (database.name?.startsWith("desktop-pull-core-") && database.version) {
      result.set(database.name, database.version);
    }
  }
  return result;
}

async function deleteOtherCoreDatabases(activeName: string): Promise<void> {
  const versions = await coreDatabaseVersions();
  await Promise.all(
    [...versions.keys()]
      .filter((name) => name !== activeName)
      .map((name) => deleteDatabase(name)),
  );
  const remaining = await coreDatabaseVersions();
  if (remaining.size !== 1 || !remaining.has(activeName)) {
    throw new Error("无法证明唯一活跃核心数据库代次");
  }
}

export async function bootstrapDatabase(): Promise<DatabaseHandle> {
  await databaseNames();
  let coreVersions = await coreDatabaseVersions();
  const control = await openControlDatabase();
  try {
    validateControlSchema(control);
    const activationKeys = await control.getAllKeys("activation");
    if (
      activationKeys.length > 1 ||
      (activationKeys.length === 1 && activationKeys[0] !== "current")
    ) {
      throw new Error("控制数据库 activation 物理键不匹配");
    }
  } catch (error) {
    control.close();
    throw error;
  }
  let activationValue = await control.get("activation", "current");

  if (!activationValue) {
    if (coreVersions.size > 0) {
      control.close();
      throw new Error("激活记录缺失，无法安全选择已有核心数据库");
    }
    const generation = crypto.randomUUID();
    const initializing = activationRecordSchema.parse({
      state: "initializing",
      generation,
      schemaVersion: CORE_DATABASE_VERSION,
      compatibleAppVersion: APP_VERSION,
    });
    await control.put("activation", initializing, "current");
    activationValue = initializing;
  }

  let activation = activationRecordSchema.parse(activationValue);
  const expectedCoreName = coreDatabaseName(activation.generation);
  let openedCore: IDBPDatabase<CoreDatabaseSchema> | null = null;
  if (
    activation.state === "initializing" &&
    [...coreVersions.keys()].some((name) => name !== expectedCoreName)
  ) {
    control.close();
    throw new Error("初始化代次与已有核心数据库冲突");
  }
  try {
    if (activation.state === "active") {
      if (!coreVersions.has(expectedCoreName)) {
        throw new Error("无法证明唯一活跃核心数据库代次");
      }
      if (coreVersions.get(expectedCoreName) !== activation.schemaVersion) {
        throw new Error("激活记录与核心数据库物理版本不匹配");
      }
    }
    await prepareApplicationVersion(activation.compatibleAppVersion);

    const source = await openCoreDatabase(
      activation.generation,
      activation.schemaVersion,
    );
    openedCore = source;
    const sourceWorkspace = await readWorkspace(source, activation.schemaVersion);
    if (activation.state === "initializing") {
      activation = activationRecordSchema.parse({ ...activation, state: "active" });
      await control.put("activation", activation, "current");
    }

    if (activation.schemaVersion === CORE_DATABASE_VERSION) {
      await deleteOtherCoreDatabases(expectedCoreName);
      await promoteApplicationVersion();
      return { control, core: source, activation };
    }

    await deleteOtherCoreDatabases(expectedCoreName);
    const candidateGeneration = crypto.randomUUID();
    const candidateName = coreDatabaseName(candidateGeneration);
    let candidate: IDBPDatabase<CoreDatabaseSchema> | null = null;
    let activated = false;
    try {
      candidate = await openCoreDatabase(candidateGeneration, 1);
      await replaceWorkspace(candidate, sourceWorkspace);
      consumeTestFailure("migration.afterCopy");
      candidate.close();
      consumeTestFailure("migration.beforeUpgrade");
      candidate = await openCoreDatabase(candidateGeneration, CORE_DATABASE_VERSION);
      consumeTestFailure("migration.afterUpgrade");
      const migratedWorkspace = await readWorkspace(candidate, CORE_DATABASE_VERSION);
      if (JSON.stringify(migratedWorkspace) !== JSON.stringify(sourceWorkspace)) {
        throw new Error("候选数据库迁移未逐值保留工作区");
      }
      consumeTestFailure("migration.candidateStartup");

      const promoted = activationRecordSchema.parse({
        state: "active",
        generation: candidateGeneration,
        schemaVersion: CORE_DATABASE_VERSION,
        compatibleAppVersion: APP_VERSION,
      });
      consumeTestFailure("migration.beforeActivation");
      await control.put("activation", promoted, "current");
      activated = true;
      consumeTestFailure("migration.afterActivation");

      source.close();
      await deleteOtherCoreDatabases(candidateName);
      await promoteApplicationVersion();
      return { control, core: candidate, activation: promoted };
    } catch (error) {
      candidate?.close();
      source.close();
      if (!activated) {
        await deleteDatabase(candidateName);
        coreVersions = await coreDatabaseVersions();
        if (
          coreVersions.size !== 1 ||
          coreVersions.get(expectedCoreName) !== activation.schemaVersion
        ) {
          throw new Error("候选迁移失败后无法证明旧代次完整", { cause: error });
        }
        await rollbackApplicationVersion();
      }
      throw error;
    }
  } catch (error) {
    openedCore?.close();
    control.close();
    throw error;
  }
}
