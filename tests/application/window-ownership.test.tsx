import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ActiveWindowBoundary,
  useWindowOwnership,
  WindowOwnershipProvider,
} from "../../src/application/window-ownership";

interface Message {
  type: "request" | "approved" | "blocked" | "busy";
  requesterId: string;
}

class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];
  onmessage: ((event: MessageEvent<Message>) => void) | null = null;
  messages: Message[] = [];

  constructor(_name: string) {
    FakeBroadcastChannel.instances.push(this);
  }

  postMessage(message: Message): void {
    this.messages.push(message);
  }

  emit(message: Message): void {
    this.onmessage?.({ data: message } as MessageEvent<Message>);
  }

  close(): void {}
}

function installLocks(initiallyAvailable: boolean) {
  let available = initiallyAvailable;
  const request = vi.fn(
    async (
      name: string,
      _options: LockOptions,
      callback: (lock: Lock | null) => Promise<void> | void,
    ) => {
      if (!available) return callback(null);
      available = false;
      try {
        return await callback({ name, mode: "exclusive" } as Lock);
      } finally {
        available = true;
      }
    },
  );
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: { request },
  });
  return { request, setAvailable: (value: boolean) => (available = value) };
}

function renderBoundary(child: React.ReactNode = <span>Core data</span>) {
  return render(
    <WindowOwnershipProvider>
      <ActiveWindowBoundary>{child}</ActiveWindowBoundary>
    </WindowOwnershipProvider>,
  );
}

function BlockingHandler() {
  const ownership = useWindowOwnership();
  useEffect(() => ownership.registerHandoffHandler(async () => false), [ownership]);
  return <span>Core data</span>;
}

let finishDelayedHandoff: ((ready: boolean) => void) | undefined;

function DelayedHandler() {
  const ownership = useWindowOwnership();
  useEffect(
    () =>
      ownership.registerHandoffHandler(
        () =>
          new Promise<boolean>((resolve) => {
            finishDelayedHandoff = resolve;
          }),
      ),
    [ownership],
  );
  return <span>Core data</span>;
}

afterEach(() => {
  finishDelayedHandoff = undefined;
  FakeBroadcastChannel.instances = [];
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "locks");
});

describe("WindowOwnershipProvider", () => {
  it("refuses to mount core data without the required platform primitives", async () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    renderBoundary();
    expect(
      await screen.findByRole("heading", { name: "无法安全打开本地数据" }),
    ).toBeVisible();
    expect(screen.queryByText("Core data")).not.toBeInTheDocument();
  });

  it("releases an active lock before approving a handoff", async () => {
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    installLocks(true);
    renderBoundary();
    expect(await screen.findByText("Core data")).toBeVisible();
    const channel = FakeBroadcastChannel.instances[0];

    await act(async () => {
      channel.emit({ type: "request", requesterId: "other-window" });
    });

    expect(
      await screen.findByRole("heading", { name: "Desktop Pull 已在另一窗口打开" }),
    ).toBeVisible();
    expect(channel.messages).toContainEqual({
      type: "approved",
      requesterId: "other-window",
    });
  });

  it("waits for the Strict Mode probe lock to release before reacquiring", async () => {
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    const locks = installLocks(true);
    render(
      <StrictMode>
        <WindowOwnershipProvider>
          <ActiveWindowBoundary>
            <span>Core data</span>
          </ActiveWindowBoundary>
        </WindowOwnershipProvider>
      </StrictMode>,
    );

    expect(await screen.findByText("Core data")).toBeVisible();
    expect(locks.request).toHaveBeenCalledTimes(2);
  });

  it("blocks handoff while a registered save guard is not ready", async () => {
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    installLocks(true);
    renderBoundary(<BlockingHandler />);
    expect(await screen.findByText("Core data")).toBeVisible();
    const channel = FakeBroadcastChannel.instances[0];

    await act(async () => {
      channel.emit({ type: "request", requesterId: "other-window" });
    });

    expect(await screen.findByText("Core data")).toBeVisible();
    expect(channel.messages).toContainEqual({
      type: "blocked",
      requesterId: "other-window",
    });
  });

  it("lets concurrent handoff requesters retry instead of leaving them pending", async () => {
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    installLocks(true);
    renderBoundary(<DelayedHandler />);
    expect(await screen.findByText("Core data")).toBeVisible();
    const channel = FakeBroadcastChannel.instances[0];

    act(() => {
      channel.emit({ type: "request", requesterId: "first-window" });
    });
    expect(
      await screen.findByRole("heading", { name: "正在安全移交窗口" }),
    ).toBeVisible();

    act(() => {
      channel.emit({ type: "request", requesterId: "second-window" });
    });
    expect(channel.messages).toContainEqual({
      type: "busy",
      requesterId: "second-window",
    });

    await act(async () => finishDelayedHandoff?.(true));
  });

  it("acquires control after an inactive window receives approval", async () => {
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    const locks = installLocks(false);
    renderBoundary();
    const button = await screen.findByRole("button", { name: "在此窗口继续" });
    await userEvent.click(button);
    const channel = FakeBroadcastChannel.instances[0];
    const request = channel.messages.find(({ type }) => type === "request");
    expect(request).toBeDefined();
    expect(screen.getByRole("button", { name: "正在请求..." })).toBeDisabled();

    locks.setAvailable(true);
    act(() =>
      channel.emit({ type: "approved", requesterId: request?.requesterId ?? "" }),
    );
    await waitFor(() => expect(screen.getByText("Core data")).toBeVisible());
    expect(locks.request).toHaveBeenCalledTimes(3);
  });

  it("acquires an available lock when the previous active window has closed", async () => {
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    const locks = installLocks(false);
    renderBoundary();
    const button = await screen.findByRole("button", { name: "在此窗口继续" });

    locks.setAvailable(true);
    await userEvent.click(button);

    await waitFor(() => expect(screen.getByText("Core data")).toBeVisible());
    expect(FakeBroadcastChannel.instances[0].messages).not.toContainEqual(
      expect.objectContaining({ type: "request" }),
    );
  });
});
