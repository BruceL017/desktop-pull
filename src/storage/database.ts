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
): Promise<IDBPDatabase<CoreDatabaseSchema>> {
  return openDB<CoreDatabaseSchema>(coreDatabaseName(generation), CORE_DATABASE_VERSION, {
    upgrade(database, oldVersion, _newVersion, transaction) {
      if (oldVersion !== 0) return;
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
    },
  });
}

function validatePhysicalSchema(core: IDBPDatabase<CoreDatabaseSchema>): void {
  if (JSON.stringify([...core.objectStoreNames]) !== JSON.stringify(expectedStores)) {
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
): Promise<WorkspaceSnapshot> {
  validatePhysicalSchema(core);
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
      JSON.stringify(["categoryOrder", "nextOperationSequence"])
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

export async function bootstrapDatabase(): Promise<DatabaseHandle> {
  const namesBefore = await databaseNames();
  const coreNames = namesBefore.filter((name) => name.startsWith("desktop-pull-core-"));
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
    if (coreNames.length > 0) {
      control.close();
      throw new Error("激活记录缺失，无法安全选择已有核心数据库");
    }
    const generation = crypto.randomUUID();
    const initializing = activationRecordSchema.parse({
      state: "initializing",
      generation,
      schemaVersion: 1,
      compatibleAppVersion: APP_VERSION,
    });
    await control.put("activation", initializing, "current");
    activationValue = initializing;
  }

  const activation = activationRecordSchema.parse(activationValue);
  const expectedCoreName = coreDatabaseName(activation.generation);
  if (activation.state === "active") {
    if (!coreNames.includes(expectedCoreName)) {
      control.close();
      throw new Error("无法证明唯一活跃核心数据库代次");
    }
    try {
      await Promise.all(
        coreNames
          .filter((name) => name !== expectedCoreName)
          .map((name) => deleteDatabase(name)),
      );
      const remainingCoreNames = (await databaseNames()).filter((name) =>
        name.startsWith("desktop-pull-core-"),
      );
      if (remainingCoreNames.length !== 1 || remainingCoreNames[0] !== expectedCoreName) {
        throw new Error("无法证明唯一活跃核心数据库代次");
      }
    } catch (error) {
      control.close();
      throw error;
    }
  }
  if (
    activation.state === "initializing" &&
    coreNames.some((name) => name !== expectedCoreName)
  ) {
    control.close();
    throw new Error("初始化代次与已有核心数据库冲突");
  }

  const core = await openCoreDatabase(activation.generation);
  try {
    await readWorkspace(core);
    const active = activationRecordSchema.parse({ ...activation, state: "active" });
    if (activation.state !== "active") {
      await control.put("activation", active, "current");
    }
    return { control, core, activation: active };
  } catch (error) {
    core.close();
    control.close();
    throw error;
  }
}
