import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type WorkerReply =
  | { status: "ready" }
  | { status: "rollback" }
  | { status: "error"; message: string };

class FakeMessagePort {
  peer: FakeMessagePort | null = null;
  onmessage: ((event: MessageEvent<WorkerReply>) => void) | null = null;

  close() {}

  postMessage(data: WorkerReply) {
    this.peer?.onmessage?.({ data } as MessageEvent<WorkerReply>);
  }
}

class FakeMessageChannel {
  port1 = new FakeMessagePort();
  port2 = new FakeMessagePort();

  constructor() {
    this.port1.peer = this.port2;
    this.port2.peer = this.port1;
  }
}

function workerWithReplies(replies: WorkerReply[]) {
  return {
    scriptURL: "http://localhost/sw.js?app-version=0.2.0",
    state: "activated",
    postMessage: vi.fn((_message: object, ports?: FakeMessagePort[]) => {
      ports?.[0]?.postMessage(replies.shift() ?? { status: "ready" });
    }),
  };
}

describe("application version manager", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("PROD", true);
    vi.stubGlobal("MessageChannel", FakeMessageChannel);
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([
      { name: `${window.location.origin}/assets/app.js` } as PerformanceResourceTiming,
      { name: "https://cdn.example.com/ignored.js" } as PerformanceResourceTiming,
    ]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, "serviceWorker");
  });

  it("reuses the current worker and handles resource protocol replies", async () => {
    const worker = workerWithReplies([
      { status: "ready" },
      { status: "error", message: "promotion failed" },
      { status: "error", message: "rollback failed" },
    ]);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { controller: worker },
    });
    const manager = await import("../../src/storage/app-version-manager");

    await manager.prepareApplicationVersion("0.1.0");
    await expect(manager.promoteApplicationVersion()).rejects.toThrow("promotion failed");
    await expect(manager.rollbackApplicationVersion()).rejects.toThrow("rollback failed");

    expect(worker.postMessage).toHaveBeenNthCalledWith(
      1,
      {
        type: "prepare-version",
        version: "0.2.0",
        activeAppVersion: "0.1.0",
        urls: [`${window.location.origin}/`, `${window.location.origin}/assets/app.js`],
      },
      expect.any(Array),
    );
  });

  it("registers and activates a staged worker before preparing resources", async () => {
    const worker = new EventTarget() as EventTarget &
      ReturnType<typeof workerWithReplies> & { state: ServiceWorkerState };
    Object.assign(worker, workerWithReplies([{ status: "ready" }]), {
      state: "installed" as ServiceWorkerState,
    });
    worker.postMessage.mockImplementation(
      (_message: object, ports?: FakeMessagePort[]) => {
        if (!ports) {
          worker.state = "activated";
          worker.dispatchEvent(new Event("statechange"));
          return;
        }
        ports[0]?.postMessage({ status: "ready" });
      },
    );
    const registration = {
      installing: worker,
      waiting: null,
      active: worker,
      update: vi.fn(),
    };
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        controller: null,
        register: vi.fn().mockResolvedValue(registration),
        ready: Promise.resolve(registration),
      },
    });
    const manager = await import("../../src/storage/app-version-manager");

    await manager.prepareApplicationVersion("0.1.0");

    expect(navigator.serviceWorker.register).toHaveBeenCalledWith(
      "/sw.js?app-version=0.2.0",
      { scope: "/" },
    );
    expect(worker.postMessage).toHaveBeenCalledWith({ type: "activate-candidate" });
  });
});
