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
import type { DraftRecord } from "../domain/schemas";
import {
  draftEntryKey,
  globalDraftEntry,
  type WorkspaceSnapshot,
} from "../domain/workspace";
import { bootstrapDatabase } from "../storage/database";
import {
  type DeferredDraftWrite,
  downloadEmergencyBackup,
} from "../storage/emergency-backup";
import { WorkspaceRepository } from "../storage/workspace-repository";

type Phase = "loading" | "protection" | "ready";

interface ControllerState {
  phase: Phase;
  workspace: WorkspaceSnapshot | null;
  protectionMessage: string;
  pendingCount: number;
  savingCreates: boolean;
  degraded: boolean;
  draftUnsaved: boolean;
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
  | { type: "draft-unsaved"; value: boolean };

const initialState: ControllerState = {
  phase: "loading",
  workspace: null,
  protectionMessage: "",
  pendingCount: 0,
  savingCreates: false,
  degraded: false,
  draftUnsaved: false,
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
  }
}

export interface WorkspaceController {
  state: ControllerState;
  globalDraft: DraftRecord | null;
  updateGlobalDraft(title: string, cursorOffset: number): void;
  submitGlobalTask(): boolean;
  retryPendingCreates(): void;
  retryDraft(): void;
  retryBootstrap(): void;
  exportEmergencyBackup(): void;
  endQuickCreateSession(): void;
}

const WorkspaceContext = createContext<WorkspaceController | null>(null);

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : "无法读取本地数据";
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const mountedRef = useRef(false);
  const repositoryRef = useRef<WorkspaceRepository | null>(null);
  const workspaceRef = useRef<WorkspaceSnapshot | null>(null);
  const queueRef = useRef<CreateTaskIntent[]>([]);
  const processingRef = useRef(false);
  const degradedRef = useRef(false);
  const lastCreatedTaskIdRef = useRef<string | undefined>(undefined);
  const draftVersionRef = useRef(0);
  const draftWriteTailRef = useRef<Promise<void>>(Promise.resolve());
  const failedDraftRef = useRef<DeferredDraftWrite | null>(null);
  const deferredDraftRef = useRef<DeferredDraftWrite | null>(null);
  const createRetryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const draftRetryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const bootstrapRetryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const bootstrappingRef = useRef(false);

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
    if (!deferred || queueRef.current.length > 0) return;
    deferredDraftRef.current = null;
    persistDraft(deferred);
  }, [persistDraft]);

  const processCreates = useCallback(async () => {
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
        const intent = queueRef.current[0];
        try {
          await repositoryRef.current.commitCreate(intent);
          queueRef.current.shift();
          updateQueueState(true);
        } catch {
          degradedRef.current = true;
          updateQueueState(false);
          clearTimeout(createRetryTimerRef.current);
          createRetryTimerRef.current = setTimeout(() => {
            void processCreatesRef.current();
          }, 2500);
          return;
        }
      }
      degradedRef.current = false;
      updateQueueState(false);
      flushDeferredDraft();
    } finally {
      processingRef.current = false;
    }
  }, [flushDeferredDraft, updateQueueState]);

  const processCreatesRef = useRef(processCreates);
  processCreatesRef.current = processCreates;

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

  const bootstrap = useCallback(async () => {
    if (bootstrappingRef.current) return;
    bootstrappingRef.current = true;
    clearTimeout(bootstrapRetryTimerRef.current);
    repositoryRef.current?.close();
    repositoryRef.current = null;
    workspaceRef.current = null;
    queueRef.current = [];
    degradedRef.current = false;
    dispatch({ type: "loading" });

    try {
      const repository = new WorkspaceRepository(await bootstrapDatabase());
      const workspace = await repository.read();
      if (!mountedRef.current) {
        repository.close();
        return;
      }
      repositoryRef.current = repository;
      workspaceRef.current = workspace;
      dispatch({ type: "ready", workspace });
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
  }, []);

  const bootstrapRef = useRef(bootstrap);
  bootstrapRef.current = bootstrap;

  useEffect(() => {
    mountedRef.current = true;
    void bootstrapRef.current();
    return () => {
      mountedRef.current = false;
      clearTimeout(createRetryTimerRef.current);
      clearTimeout(draftRetryTimerRef.current);
      clearTimeout(bootstrapRetryTimerRef.current);
      repositoryRef.current?.close();
    };
  }, []);

  const updateGlobalDraft = useCallback(
    (title: string, cursorOffset: number) => {
      const workspace = workspaceRef.current;
      if (!workspace) return;
      const current =
        workspace.drafts.find(({ entry }) => entry.kind === "global") ?? null;
      const draft: DraftRecord | null =
        title === ""
          ? null
          : {
              entry: { kind: "global" },
              generation: current?.generation ?? crypto.randomUUID(),
              title,
              cursorOffset: Math.min(Math.max(cursorOffset, 0), title.length),
            };
      const nextWorkspace = setWorkspaceDraft(workspace, globalDraftEntry, draft);
      workspaceRef.current = nextWorkspace;
      draftVersionRef.current += 1;
      const write = {
        entry: globalDraftEntry,
        draft,
        version: draftVersionRef.current,
      };
      if (queueRef.current.length > 0) {
        deferredDraftRef.current = write;
      } else {
        persistDraft(write);
      }
      if (failedDraftRef.current) failedDraftRef.current = write;
      dispatch({ type: "workspace", workspace: nextWorkspace });
    },
    [persistDraft],
  );

  const submitGlobalTask = useCallback((): boolean => {
    const workspace = workspaceRef.current;
    if (!workspace) return false;
    const draft = workspace.drafts.find(({ entry }) => entry.kind === "global");
    if (!draft || draft.title.trim().length === 0) return false;

    const intent = freezeCreateIntent({
      workspace,
      draft,
      previousTaskId: lastCreatedTaskIdRef.current,
    });
    const nextWorkspace = applyCreateIntent(workspace, intent);
    workspaceRef.current = nextWorkspace;
    lastCreatedTaskIdRef.current = intent.task.id;
    queueRef.current.push(intent);
    draftVersionRef.current += 1;
    if (failedDraftRef.current?.draft?.generation === intent.consumedDraft.generation) {
      failedDraftRef.current = null;
      dispatch({ type: "draft-unsaved", value: false });
    }
    if (deferredDraftRef.current?.draft?.generation === intent.consumedDraft.generation) {
      deferredDraftRef.current = null;
    }
    dispatch({ type: "workspace", workspace: nextWorkspace });
    updateQueueState(!degradedRef.current);
    if (!degradedRef.current) void processCreatesRef.current();
    return true;
  }, [updateQueueState]);

  const globalDraft =
    state.workspace?.drafts.find(({ entry }) => entry.kind === "global") ?? null;

  const value = useMemo<WorkspaceController>(
    () => ({
      state,
      globalDraft,
      updateGlobalDraft,
      submitGlobalTask,
      retryPendingCreates: () => void processCreatesRef.current(),
      retryDraft: () => void retryDraftRef.current(),
      retryBootstrap: () => void bootstrapRef.current(),
      exportEmergencyBackup: () => {
        if (workspaceRef.current) downloadEmergencyBackup(workspaceRef.current);
      },
      endQuickCreateSession: () => {
        lastCreatedTaskIdRef.current = undefined;
      },
    }),
    [globalDraft, state, submitGlobalTask, updateGlobalDraft],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceController {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace 必须在 WorkspaceProvider 内使用");
  return context;
}
