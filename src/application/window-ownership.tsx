import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useI18n } from "./i18n";

type OwnershipState =
  | "acquiring"
  | "active"
  | "inactive"
  | "requesting"
  | "handoff"
  | "blocked"
  | "unsupported";

type HandoffHandler = () => Promise<boolean>;

interface OwnershipValue {
  state: OwnershipState;
  isActive(): boolean;
  registerHandoffHandler(handler: HandoffHandler): () => void;
  requestControl(): void;
}

interface OwnershipMessage {
  type: "request" | "approved" | "blocked";
  requesterId: string;
}

const lockName = "desktop-pull-active-window-v1";
const channelName = "desktop-pull-window-ownership-v1";
const OwnershipContext = createContext<OwnershipValue | null>(null);

export function WindowOwnershipProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OwnershipState>("acquiring");
  const stateRef = useRef<OwnershipState>("acquiring");
  const instanceIdRef = useRef(crypto.randomUUID());
  const releaseRef = useRef<(() => void) | null>(null);
  const lockRequestRef = useRef<Promise<unknown> | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const handlersRef = useRef(new Set<HandoffHandler>());
  const cancelledRef = useRef(false);
  const lifecycleRef = useRef(0);
  const handingOffRef = useRef(false);

  const changeState = useCallback((next: OwnershipState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const acquire = useCallback(() => {
    if (
      !navigator.locks ||
      typeof BroadcastChannel === "undefined" ||
      cancelledRef.current
    ) {
      changeState("unsupported");
      return;
    }
    const lifecycle = lifecycleRef.current;
    changeState("acquiring");
    const request = navigator.locks.request(
      lockName,
      { ifAvailable: true },
      async (lock) => {
        if (cancelledRef.current || lifecycle !== lifecycleRef.current) return;
        if (!lock) {
          changeState("inactive");
          return;
        }
        changeState("active");
        await new Promise<void>((resolve) => {
          releaseRef.current = resolve;
        });
        releaseRef.current = null;
      },
    );
    lockRequestRef.current = request;
    void request.finally(() => {
      if (lockRequestRef.current === request) lockRequestRef.current = null;
    });
  }, [changeState]);

  useEffect(() => {
    cancelledRef.current = false;
    lifecycleRef.current += 1;
    if (typeof BroadcastChannel === "undefined") {
      changeState("unsupported");
      return;
    }
    const channel = new BroadcastChannel(channelName);
    channelRef.current = channel;

    channel.onmessage = (event: MessageEvent<OwnershipMessage>) => {
      const message = event.data;
      if (message.type === "request" && stateRef.current === "active") {
        if (handingOffRef.current) return;
        handingOffRef.current = true;
        changeState("handoff");
        void (async () => {
          let ready = true;
          for (const handler of handlersRef.current) {
            if (!(await handler())) {
              ready = false;
              break;
            }
          }
          if (!ready) {
            handingOffRef.current = false;
            changeState("active");
            channel.postMessage({
              type: "blocked",
              requesterId: message.requesterId,
            } satisfies OwnershipMessage);
            return;
          }
          releaseRef.current?.();
          await lockRequestRef.current;
          changeState("inactive");
          channel.postMessage({
            type: "approved",
            requesterId: message.requesterId,
          } satisfies OwnershipMessage);
          handingOffRef.current = false;
        })();
        return;
      }

      if (message.requesterId !== instanceIdRef.current) return;
      if (message.type === "approved") acquire();
      if (message.type === "blocked") changeState("blocked");
    };

    const previousRequest = lockRequestRef.current;
    if (previousRequest) {
      const lifecycle = lifecycleRef.current;
      void previousRequest.finally(() => {
        if (!cancelledRef.current && lifecycle === lifecycleRef.current) acquire();
      });
    } else {
      acquire();
    }
    return () => {
      cancelledRef.current = true;
      lifecycleRef.current += 1;
      channel.close();
      channelRef.current = null;
      releaseRef.current?.();
      releaseRef.current = null;
    };
  }, [acquire, changeState]);

  const registerHandoffHandler = useCallback((handler: HandoffHandler) => {
    handlersRef.current.add(handler);
    return () => handlersRef.current.delete(handler);
  }, []);

  const requestControl = useCallback(() => {
    if (stateRef.current === "requesting") return;
    changeState("requesting");
    channelRef.current?.postMessage({
      type: "request",
      requesterId: instanceIdRef.current,
    } satisfies OwnershipMessage);
  }, [changeState]);

  const value = useMemo<OwnershipValue>(
    () => ({
      state,
      isActive: () => stateRef.current === "active" || stateRef.current === "handoff",
      registerHandoffHandler,
      requestControl,
    }),
    [registerHandoffHandler, requestControl, state],
  );

  return <OwnershipContext.Provider value={value}>{children}</OwnershipContext.Provider>;
}

export function ActiveWindowBoundary({ children }: { children: ReactNode }) {
  const { requestControl, state } = useWindowOwnership();
  const { text } = useI18n();

  if (state === "active" || state === "handoff") {
    return (
      <>
        {children}
        {state === "handoff" ? (
          <div className="window-state window-state-overlay" aria-live="assertive">
            <h1>{text("正在安全移交窗口", "Safely handing off this window")}</h1>
            <p>
              {text(
                "正在完成本地保存并关闭数据连接。",
                "Finishing local saves and closing the data connection.",
              )}
            </p>
          </div>
        ) : null}
      </>
    );
  }

  if (state === "acquiring") {
    return (
      <main className="window-state" aria-live="polite">
        <h1>Desktop Pull</h1>
        <p>{text("正在确认窗口控制权...", "Checking window ownership...")}</p>
      </main>
    );
  }

  if (state === "unsupported") {
    return (
      <main className="window-state" aria-live="assertive">
        <h1>{text("无法安全打开本地数据", "Local data cannot be opened safely")}</h1>
        <p>
          {text(
            "当前浏览器不支持所需的排他窗口锁。Desktop Pull 未读取或改写任务数据。",
            "This browser does not support the required exclusive window lock. Desktop Pull has not read or changed task data.",
          )}
        </p>
      </main>
    );
  }

  return (
    <main className="window-state" aria-live="polite">
      <h1>
        {text("Desktop Pull 已在另一窗口打开", "Desktop Pull is open in another window")}
      </h1>
      <p>
        {state === "blocked"
          ? text(
              "原窗口仍有尚未安全保存的工作。请回到原窗口完成保存后重试。",
              "The other window still has work that is not safely saved. Finish saving there, then try again.",
            )
          : text(
              "此窗口尚未读取任务数据。你可以请求原窗口完成保存并移交控制权。",
              "This window has not read task data. Ask the other window to finish saving and hand over control.",
            )}
      </p>
      <button
        className="primary-button"
        type="button"
        disabled={state === "requesting"}
        onClick={requestControl}
      >
        {state === "requesting"
          ? text("正在请求...", "Requesting...")
          : text("在此窗口继续", "Continue in this window")}
      </button>
    </main>
  );
}

export function useWindowOwnership(): OwnershipValue {
  const context = useContext(OwnershipContext);
  if (!context) {
    throw new Error("useWindowOwnership must be used inside WindowOwnershipProvider");
  }
  return context;
}

export function useOptionalWindowOwnership(): OwnershipValue | null {
  return useContext(OwnershipContext);
}
