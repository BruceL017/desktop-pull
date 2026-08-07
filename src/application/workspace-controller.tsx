import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import {
  applyCreateIntent,
  type CreateTaskIntent,
  freezeCreateIntent,
  setWorkspaceDraft,
} from "../domain/create-task";
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
} from "../domain/operations";
import type {
  CategoryRef,
  DraftEntry,
  DraftRecord,
  TaskPriority,
  TaskStatus,
} from "../domain/schemas";
import { backupDataSchema } from "../domain/schemas";
import {
  draftEntryKey,
  globalDraftEntry,
  type WorkspaceSnapshot,
} from "../domain/workspace";
import { bootstrapDatabase } from "../storage/database";
import {
  type DeferredDraftWrite,
  downloadBackup,
  downloadEmergencyBackup,
} from "../storage/emergency-backup";
import { WorkspaceRepository } from "../storage/workspace-repository";
import { useOptionalWindowOwnership } from "./window-ownership";

type Phase = "loading" | "protection" | "ready";

interface ControllerState {
  phase: Phase;
  workspace: WorkspaceSnapshot | null;
  protectionMessage: string;
  pendingCount: number;
  savingCreates: boolean;
  degraded: boolean;
  draftUnsaved: boolean;
  cleanupPending: boolean;
}

type ControllerAction =
  | { type: "loading" }
  | { type: "protection"; message: string }
  | { type: "ready"; workspace: WorkspaceSnapshot }
  | { type: "workspace"; workspace: WorkspaceSnapshot }
  | {
      type: "queue";
      pendingCount: number;
      savingCreates: boolean;
      degraded: boolean;
    }
  | { type: "draft-unsaved"; value: boolean }
  | { type: "cleanup-pending"; value: boolean };

type PendingOperation =
  | { kind: "create"; intent: CreateTaskIntent }
  | { kind: "mutation"; mutation: WorkspaceMutation };

const initialState: ControllerState = {
  phase: "loading",
  workspace: null,
  protectionMessage: "",
  pendingCount: 0,
  savingCreates: false,
  degraded: false,
  draftUnsaved: false,
  cleanupPending: false,
};

function reducer(state: ControllerState, action: ControllerAction): ControllerState {
  switch (action.type) {
    case "loading":
      return { ...initialState };
    case "protection":
      return {
        ...initialState,
        phase: "protection",
        protectionMessage: action.message,
      };
    case "ready":
      return { ...initialState, phase: "ready", workspace: action.workspace };
    case "workspace":
      return { ...state, workspace: action.workspace };
    case "queue":
      return {
        ...state,
        pendingCount: action.pendingCount,
        savingCreates: action.savingCreates,
        degraded: action.degraded,
      };
    case "draft-unsaved":
      return { ...state, draftUnsaved: action.value };
    case "cleanup-pending":
      return { ...state, cleanupPending: action.value };
  }
}

export interface WorkspaceController {
  state: ControllerState;
  globalDraft: DraftRecord | null;
  draftFor(entry: DraftEntry): DraftRecord | null;
  updateDraft(entry: DraftEntry, title: string, cursorOffset: number): void;
  updateGlobalDraft(title: string, cursorOffset: number): void;
  submitDraft(entry: DraftEntry): boolean;
  submitGlobalTask(): boolean;
  updateTaskContent(taskId: string, title: string, notes: string): boolean;
  setTaskPriority(taskId: string, priority: TaskPriority): boolean;
  setTaskStatus(taskId: string, status: TaskStatus): boolean;
  moveTask(taskId: string, categoryRef: CategoryRef, targetIndex: number): boolean;
  createCategory(name: string, moveTaskId?: string): string;
  renameCategory(categoryId: string, name: string): boolean;
  reorderCategory(categoryId: string, targetIndex: number): boolean;
  deleteCategory(categoryId: string): boolean;
  trashTask(taskId: string): boolean;
  restoreTask(taskId: string): boolean;
  permanentlyDeleteTasks(taskIds: string[]): Promise<boolean>;
  exportBackup(): void;
  importWorkspace(workspace: WorkspaceSnapshot): Promise<boolean>;
  retryPendingCreates(): void;
  retryDraft(): void;
  retryCleanup(): void;
  retryBootstrap(): void;
  exportEmergencyBackup(): void;
  endQuickCreateSession(entry?: DraftEntry): void;
}

const WorkspaceContext = createContext<WorkspaceController | null>(null);

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : "无法读取本地数据";
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const ownership = useOptionalWindowOwnership();
  const [state, dispatch] = useReducer(reducer, initialState);
  const mountedRef = useRef(false);
  const repositoryRef = useRef<WorkspaceRepository | null>(null);
  const workspaceRef = useRef<WorkspaceSnapshot | null>(null);
  const queueRef = useRef<PendingOperation[]>([]);
  const processingRef = useRef(false);
  const degradedRef = useRef(false);
  const cleanupPendingRef = useRef(false);
  const cleanupRunningRef = useRef(false);
  const acceptingOperationsRef = useRef(true);
  const lastCreatedTaskIdsRef = useRef(new Map<string, string>());
  const draftVersionRef = useRef(0);
  const draftWriteTailRef = useRef<Promise<void>>(Promise.resolve());
  const failedDraftRef = useRef<DeferredDraftWrite | null>(null);
  const deferredDraftRef = useRef<DeferredDraftWrite | null>(null);
  const operationRetryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const draftRetryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const bootstrapRetryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const cleanupRetryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const bootstrappingRef = useRef(false);
  const cleanupRef = useRef<() => Promise<void>>(async () => undefined);

  const setCleanupPending = useCallback((value: boolean) => {
    cleanupPendingRef.current = value;
    if (mountedRef.current) dispatch({ type: "cleanup-pending", value });
  }, []);

  const scheduleCleanupRetry = useCallback(() => {
    clearTimeout(cleanupRetryTimerRef.current);
    cleanupRetryTimerRef.current = setTimeout(() => {
      void cleanupRef.current();
    }, 2500);
  }, []);

  const updateQueueState = useCallback((savingCreates: boolean) => {
    if (!mountedRef.current) return;
    dispatch({
      type: "queue",
      pendingCount: queueRef.current.length,
      savingCreates,
      degraded: degradedRef.current,
    });
  }, []);

  const scheduleDraftRetry = useCallback(() => {
    clearTimeout(draftRetryTimerRef.current);
    draftRetryTimerRef.current = setTimeout(() => {
      void retryDraftRef.current();
    }, 2500);
  }, []);

  const persistDraft = useCallback(
    (write: DeferredDraftWrite) => {
      const run = async () => {
        const repository = repositoryRef.current;
        if (!repository) return;
        try {
          await repository.saveDraft(write.entry, write.draft);
          if (write.version === draftVersionRef.current) {
            failedDraftRef.current = null;
            if (mountedRef.current) dispatch({ type: "draft-unsaved", value: false });
          }
        } catch {
          const workspace = workspaceRef.current;
          const latestDraft =
            workspace?.drafts.find(
              ({ entry }) => draftEntryKey(entry) === draftEntryKey(write.entry),
            ) ?? null;
          failedDraftRef.current = {
            entry: write.entry,
            draft: latestDraft,
            version: draftVersionRef.current,
          };
          if (mountedRef.current) dispatch({ type: "draft-unsaved", value: true });
          scheduleDraftRetry();
        }
      };
      draftWriteTailRef.current = draftWriteTailRef.current.then(run, run);
    },
    [scheduleDraftRetry],
  );

  const flushDeferredDraft = useCallback(() => {
    const deferred = deferredDraftRef.current;
    if (!deferred || queueRef.current.length > 0 || cleanupRunningRef.current) return;
    deferredDraftRef.current = null;
    persistDraft(deferred);
  }, [persistDraft]);

  const processOperations = useCallback(async () => {
    if (
      processingRef.current ||
      !repositoryRef.current ||
      queueRef.current.length === 0
    ) {
      return;
    }
    processingRef.current = true;
    updateQueueState(true);
    await draftWriteTailRef.current;
    try {
      while (queueRef.current.length > 0) {
        const pending = queueRef.current[0];
        try {
          if (pending.kind === "create") {
            await repositoryRef.current.commitCreate(pending.intent);
          } else {
            await repositoryRef.current.commitMutation(pending.mutation);
          }
          queueRef.current.shift();
          updateQueueState(true);
        } catch {
          degradedRef.current = true;
          updateQueueState(false);
          clearTimeout(operationRetryTimerRef.current);
          operationRetryTimerRef.current = setTimeout(() => {
            void processOperationsRef.current();
          }, 2500);
          return;
        }
      }
      degradedRef.current = false;
      updateQueueState(false);
      flushDeferredDraft();
      if (cleanupPendingRef.current) void cleanupRef.current();
    } finally {
      processingRef.current = false;
    }
  }, [flushDeferredDraft, updateQueueState]);

  const processOperationsRef = useRef(processOperations);
  processOperationsRef.current = processOperations;

  const enqueueMutation = useCallback(
    (mutation: WorkspaceMutation | null): boolean => {
      if (!acceptingOperationsRef.current || (ownership && !ownership.isActive())) {
        return false;
      }
      if (!mutation) return false;
      workspaceRef.current = mutation.result;
      queueRef.current.push({ kind: "mutation", mutation });
      dispatch({ type: "workspace", workspace: mutation.result });
      updateQueueState(!degradedRef.current);
      if (!degradedRef.current && !cleanupRunningRef.current) {
        void processOperationsRef.current();
      }
      return true;
    },
    [ownership, updateQueueState],
  );

  const retryDraft = useCallback(async () => {
    if (queueRef.current.length > 0) return;
    const failed = failedDraftRef.current;
    if (!failed || !repositoryRef.current) return;
    failedDraftRef.current = null;
    try {
      await repositoryRef.current.saveDraft(failed.entry, failed.draft);
      if (failed.version === draftVersionRef.current) {
        if (mountedRef.current) dispatch({ type: "draft-unsaved", value: false });
      } else {
        flushDeferredDraft();
      }
    } catch {
      failedDraftRef.current = {
        ...failed,
        version: draftVersionRef.current,
        draft:
          workspaceRef.current?.drafts.find(
            ({ entry }) => draftEntryKey(entry) === draftEntryKey(failed.entry),
          ) ?? null,
      };
      if (mountedRef.current) dispatch({ type: "draft-unsaved", value: true });
      scheduleDraftRetry();
    }
  }, [flushDeferredDraft, scheduleDraftRetry]);

  const retryDraftRef = useRef(retryDraft);
  retryDraftRef.current = retryDraft;

  const runExpiredCleanup = useCallback(async () => {
    const workspace = workspaceRef.current;
    const repository = repositoryRef.current;
    if (!workspace || !repository || cleanupRunningRef.current) return;

    const projection = freezeExpiredCleanup(workspace);
    if (projection) {
      workspaceRef.current = projection.result;
      dispatch({ type: "workspace", workspace: projection.result });
      setCleanupPending(true);
    }
    if (!cleanupPendingRef.current) return;
    if (
      queueRef.current.length > 0 ||
      processingRef.current ||
      degradedRef.current ||
      failedDraftRef.current ||
      deferredDraftRef.current
    ) {
      scheduleCleanupRetry();
      return;
    }

    cleanupRunningRef.current = true;
    try {
      await draftWriteTailRef.current;
      if (
        queueRef.current.length > 0 ||
        processingRef.current ||
        degradedRef.current ||
        failedDraftRef.current ||
        deferredDraftRef.current
      ) {
        scheduleCleanupRetry();
        return;
      }
      const persisted = await repository.read();
      const cleanup = freezeExpiredCleanup(persisted);
      if (cleanup) await repository.commitMutation(cleanup);
      const verified = await repository.read();
      if (freezeExpiredCleanup(verified)) {
        scheduleCleanupRetry();
        return;
      }
      setCleanupPending(false);
    } catch {
      setCleanupPending(true);
      scheduleCleanupRetry();
    } finally {
      cleanupRunningRef.current = false;
      if (queueRef.current.length > 0 && !degradedRef.current) {
        void processOperationsRef.current();
      } else {
        flushDeferredDraft();
      }
    }
  }, [flushDeferredDraft, scheduleCleanupRetry, setCleanupPending]);

  cleanupRef.current = runExpiredCleanup;

  const bootstrap = useCallback(async () => {
    if (bootstrappingRef.current) return;
    bootstrappingRef.current = true;
    clearTimeout(bootstrapRetryTimerRef.current);
    repositoryRef.current?.close();
    repositoryRef.current = null;
    workspaceRef.current = null;
    queueRef.current = [];
    degradedRef.current = false;
    setCleanupPending(false);
    dispatch({ type: "loading" });

    try {
      const repository = new WorkspaceRepository(await bootstrapDatabase());
      const workspace = await repository.read();
      if (!mountedRef.current) {
        repository.close();
        return;
      }
      repositoryRef.current = repository;
      const cleanup = freezeExpiredCleanup(workspace);
      const visibleWorkspace = cleanup?.result ?? workspace;
      workspaceRef.current = visibleWorkspace;
      dispatch({ type: "ready", workspace: visibleWorkspace });
      if (cleanup) {
        setCleanupPending(true);
        void cleanupRef.current();
      }
    } catch (error) {
      if (!mountedRef.current) return;
      dispatch({ type: "protection", message: messageFromError(error) });
      bootstrapRetryTimerRef.current = setTimeout(
        () => void bootstrapRef.current(),
        3000,
      );
    } finally {
      bootstrappingRef.current = false;
    }
  }, [setCleanupPending]);

  const bootstrapRef = useRef(bootstrap);
  bootstrapRef.current = bootstrap;

  useEffect(() => {
    mountedRef.current = true;
    void bootstrapRef.current();
    return () => {
      mountedRef.current = false;
      clearTimeout(operationRetryTimerRef.current);
      clearTimeout(draftRetryTimerRef.current);
      clearTimeout(bootstrapRetryTimerRef.current);
      clearTimeout(cleanupRetryTimerRef.current);
      clearTimeout(expiryTimerRef.current);
      repositoryRef.current?.close();
    };
  }, []);

  useEffect(() => {
    clearTimeout(expiryTimerRef.current);
    if (state.phase !== "ready" || !state.workspace) return;
    const nextExpiry = state.workspace.tasks
      .flatMap((task) =>
        task.lifecycle.kind === "trashed" ? [Date.parse(task.lifecycle.expiresAt)] : [],
      )
      .filter(Number.isFinite)
      .sort((left, right) => left - right)[0];
    if (nextExpiry === undefined) return;
    const delay = Math.max(0, Math.min(nextExpiry - Date.now(), 2_147_000_000));
    expiryTimerRef.current = setTimeout(() => void cleanupRef.current(), delay);
    return () => clearTimeout(expiryTimerRef.current);
  }, [state.phase, state.workspace]);

  useEffect(() => {
    const runWhenVisible = () => {
      if (document.visibilityState === "visible") void cleanupRef.current();
    };
    document.addEventListener("visibilitychange", runWhenVisible);
    window.addEventListener("pageshow", runWhenVisible);
    return () => {
      document.removeEventListener("visibilitychange", runWhenVisible);
      window.removeEventListener("pageshow", runWhenVisible);
    };
  }, []);

  const updateDraft = useCallback(
    (entry: DraftEntry, title: string, cursorOffset: number) => {
      if (!acceptingOperationsRef.current || (ownership && !ownership.isActive())) return;
      const workspace = workspaceRef.current;
      if (!workspace) return;
      const current =
        workspace.drafts.find(
          (draft) => draftEntryKey(draft.entry) === draftEntryKey(entry),
        ) ?? null;
      const draft: DraftRecord | null =
        title === ""
          ? null
          : {
              entry: structuredClone(entry),
              generation: current?.generation ?? crypto.randomUUID(),
              title,
              cursorOffset: Math.min(Math.max(cursorOffset, 0), title.length),
            };
      const nextWorkspace = setWorkspaceDraft(workspace, entry, draft);
      workspaceRef.current = nextWorkspace;
      draftVersionRef.current += 1;
      const write = { entry, draft, version: draftVersionRef.current };
      if (queueRef.current.length > 0 || cleanupRunningRef.current) {
        deferredDraftRef.current = write;
      } else persistDraft(write);
      if (failedDraftRef.current) failedDraftRef.current = write;
      dispatch({ type: "workspace", workspace: nextWorkspace });
    },
    [ownership, persistDraft],
  );

  const submitDraft = useCallback(
    (entry: DraftEntry): boolean => {
      if (!acceptingOperationsRef.current || (ownership && !ownership.isActive())) {
        return false;
      }
      const workspace = workspaceRef.current;
      if (!workspace) return false;
      const draft = workspace.drafts.find(
        (candidate) => draftEntryKey(candidate.entry) === draftEntryKey(entry),
      );
      if (!draft || draft.title.trim().length === 0) return false;
      const entryKey = draftEntryKey(entry);
      const intent = freezeCreateIntent({
        workspace,
        draft,
        previousTaskId: lastCreatedTaskIdsRef.current.get(entryKey),
      });
      const nextWorkspace = applyCreateIntent(workspace, intent);
      workspaceRef.current = nextWorkspace;
      lastCreatedTaskIdsRef.current.set(entryKey, intent.task.id);
      queueRef.current.push({ kind: "create", intent });
      draftVersionRef.current += 1;
      if (failedDraftRef.current?.draft?.generation === intent.consumedDraft.generation) {
        failedDraftRef.current = null;
        dispatch({ type: "draft-unsaved", value: false });
      }
      if (
        deferredDraftRef.current?.draft?.generation === intent.consumedDraft.generation
      ) {
        deferredDraftRef.current = null;
      }
      dispatch({ type: "workspace", workspace: nextWorkspace });
      updateQueueState(!degradedRef.current);
      if (!degradedRef.current && !cleanupRunningRef.current) {
        void processOperationsRef.current();
      }
      return true;
    },
    [ownership, updateQueueState],
  );

  useEffect(() => {
    if (!ownership) return;
    return ownership.registerHandoffHandler(async () => {
      acceptingOperationsRef.current = false;
      await draftWriteTailRef.current;
      while (processingRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      if (queueRef.current.length > 0 && !degradedRef.current) {
        await processOperationsRef.current();
      }
      while (processingRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      await draftWriteTailRef.current;
      const ready =
        queueRef.current.length === 0 &&
        !degradedRef.current &&
        !cleanupPendingRef.current &&
        !cleanupRunningRef.current &&
        !failedDraftRef.current &&
        !deferredDraftRef.current;
      if (!ready) {
        acceptingOperationsRef.current = true;
        return false;
      }
      repositoryRef.current?.close();
      repositoryRef.current = null;
      workspaceRef.current = null;
      dispatch({ type: "loading" });
      return true;
    });
  }, [ownership]);

  const currentWorkspace = useCallback(() => {
    const workspace = workspaceRef.current;
    if (!workspace) throw new Error("工作区尚未加载");
    return workspace;
  }, []);

  const executeSensitiveMutation = useCallback(
    async (mutation: WorkspaceMutation | null): Promise<boolean> => {
      const repository = repositoryRef.current;
      if (
        !mutation ||
        !repository ||
        !acceptingOperationsRef.current ||
        queueRef.current.length > 0 ||
        processingRef.current ||
        degradedRef.current ||
        cleanupPendingRef.current ||
        cleanupRunningRef.current ||
        failedDraftRef.current ||
        deferredDraftRef.current ||
        (ownership && !ownership.isActive())
      ) {
        return false;
      }
      acceptingOperationsRef.current = false;
      try {
        await draftWriteTailRef.current;
        if (failedDraftRef.current || deferredDraftRef.current) return false;
        await repository.commitMutation(mutation);
        workspaceRef.current = mutation.result;
        dispatch({ type: "workspace", workspace: mutation.result });
        return true;
      } catch {
        return false;
      } finally {
        acceptingOperationsRef.current = true;
      }
    },
    [ownership],
  );

  const globalDraft =
    state.workspace?.drafts.find(({ entry }) => entry.kind === "global") ?? null;

  const value = useMemo<WorkspaceController>(
    () => ({
      state,
      globalDraft,
      draftFor: (entry) =>
        state.workspace?.drafts.find(
          (draft) => draftEntryKey(draft.entry) === draftEntryKey(entry),
        ) ?? null,
      updateDraft,
      updateGlobalDraft: (title, cursorOffset) =>
        updateDraft(globalDraftEntry, title, cursorOffset),
      submitDraft,
      submitGlobalTask: () => submitDraft(globalDraftEntry),
      updateTaskContent: (taskId, title, notes) =>
        enqueueMutation(freezeTaskContent(currentWorkspace(), taskId, title, notes)),
      setTaskPriority: (taskId, priority) =>
        enqueueMutation(freezeTaskPriority(currentWorkspace(), taskId, priority)),
      setTaskStatus: (taskId, status) =>
        enqueueMutation(freezeTaskStatus(currentWorkspace(), taskId, status)),
      moveTask: (taskId, categoryRef, targetIndex) =>
        enqueueMutation(
          freezeTaskMove(currentWorkspace(), taskId, categoryRef, targetIndex),
        ),
      createCategory: (name, moveTaskId) => {
        const categoryId = crypto.randomUUID();
        enqueueMutation(
          freezeCategoryCreate(currentWorkspace(), name, moveTaskId, { categoryId }),
        );
        return categoryId;
      },
      renameCategory: (categoryId, name) =>
        enqueueMutation(freezeCategoryRename(currentWorkspace(), categoryId, name)),
      reorderCategory: (categoryId, targetIndex) =>
        enqueueMutation(
          freezeCategoryReorder(currentWorkspace(), categoryId, targetIndex),
        ),
      deleteCategory: (categoryId) =>
        enqueueMutation(freezeCategoryDelete(currentWorkspace(), categoryId)),
      trashTask: (taskId) => enqueueMutation(freezeTaskTrash(currentWorkspace(), taskId)),
      restoreTask: (taskId) =>
        enqueueMutation(freezeTaskRestore(currentWorkspace(), taskId)),
      permanentlyDeleteTasks: (taskIds) =>
        executeSensitiveMutation(freezePermanentDelete(currentWorkspace(), taskIds)),
      exportBackup: () => {
        if (workspaceRef.current) downloadBackup(workspaceRef.current);
      },
      importWorkspace: async (workspace) => {
        if (
          cleanupPendingRef.current ||
          cleanupRunningRef.current ||
          queueRef.current.length > 0 ||
          degradedRef.current
        ) {
          return false;
        }
        const parsed = backupDataSchema.parse(workspace);
        const cleanup = freezeExpiredCleanup(parsed);
        const result = cleanup?.result ?? parsed;
        const imported = await executeSensitiveMutation({
          id: crypto.randomUUID(),
          kind: "backup-import",
          expectedOperationSequence: currentWorkspace().meta.nextOperationSequence,
          result,
        });
        if (imported) draftVersionRef.current += 1;
        return imported;
      },
      retryPendingCreates: () => void processOperationsRef.current(),
      retryDraft: () => void retryDraftRef.current(),
      retryCleanup: () => void cleanupRef.current(),
      retryBootstrap: () => void bootstrapRef.current(),
      exportEmergencyBackup: () => {
        if (workspaceRef.current) downloadEmergencyBackup(workspaceRef.current);
      },
      endQuickCreateSession: (entry = globalDraftEntry) => {
        lastCreatedTaskIdsRef.current.delete(draftEntryKey(entry));
      },
    }),
    [
      currentWorkspace,
      enqueueMutation,
      executeSensitiveMutation,
      globalDraft,
      state,
      submitDraft,
      updateDraft,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceController {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace 必须在 WorkspaceProvider 内使用");
  return context;
}
