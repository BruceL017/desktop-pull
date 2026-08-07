import { APP_VERSION } from "./database-schema";

type WorkerReply =
  | { status: "ready" }
  | { status: "rollback" }
  | { status: "error"; message: string };

let workerPromise: Promise<ServiceWorker> | null = null;

function waitForActivation(worker: ServiceWorker): Promise<void> {
  if (worker.state === "activated") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onStateChange = () => {
      if (worker.state === "activated") {
        worker.removeEventListener("statechange", onStateChange);
        resolve();
      } else if (worker.state === "redundant") {
        worker.removeEventListener("statechange", onStateChange);
        reject(new Error("候选 Service Worker 激活失败"));
      }
    };
    worker.addEventListener("statechange", onStateChange);
  });
}

async function applicationWorker(): Promise<ServiceWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const controller = navigator.serviceWorker.controller;
      if (
        controller &&
        new URL(controller.scriptURL).searchParams.get("app-version") === APP_VERSION
      ) {
        return controller;
      }
      const registration = await navigator.serviceWorker.register(
        `${import.meta.env.BASE_URL}sw.js?app-version=${APP_VERSION}`,
        { scope: import.meta.env.BASE_URL },
      );
      let candidate = registration.installing ?? registration.waiting;
      if (
        !candidate &&
        new URL(registration.active?.scriptURL ?? window.location.href).searchParams.get(
          "app-version",
        ) !== APP_VERSION
      ) {
        await registration.update();
        candidate = registration.installing ?? registration.waiting;
      }
      if (candidate) {
        if (candidate.state === "installed") {
          candidate.postMessage({ type: "activate-candidate" });
        }
        await waitForActivation(candidate);
      }
      const ready = await navigator.serviceWorker.ready;
      if (!ready.active) throw new Error("Service Worker 尚未激活");
      if (
        new URL(ready.active.scriptURL).searchParams.get("app-version") !== APP_VERSION
      ) {
        throw new Error("候选 Service Worker 尚未接管当前版本");
      }
      return ready.active;
    })();
  }
  return workerPromise;
}

function appResources(): string[] {
  const base = new URL(import.meta.env.BASE_URL, window.location.origin).href;
  const resources = performance
    .getEntriesByType("resource")
    .flatMap((entry) =>
      entry.name.startsWith(window.location.origin) ? [entry.name] : [],
    );
  return [...new Set([base, ...resources])];
}

async function sendMessage(message: object): Promise<WorkerReply> {
  const worker = await applicationWorker();
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => {
      channel.port1.close();
      reject(new Error("Service Worker 版本协调超时"));
    }, 5000);
    channel.port1.onmessage = (event: MessageEvent<WorkerReply>) => {
      window.clearTimeout(timeout);
      channel.port1.close();
      resolve(event.data);
    };
    worker.postMessage(message, [channel.port2]);
  });
}

function available(): boolean {
  return import.meta.env.PROD && "serviceWorker" in navigator;
}

export async function prepareApplicationVersion(activeAppVersion: string): Promise<void> {
  if (!available()) return;
  const reply = await sendMessage({
    type: "prepare-version",
    version: APP_VERSION,
    activeAppVersion,
    urls: appResources(),
  });
  if (reply.status === "ready") return;
  if (reply.status === "rollback") {
    window.location.reload();
    throw new Error("候选版本已隔离，正在回退最后已知良好版本");
  }
  throw new Error(reply.message);
}

export async function promoteApplicationVersion(): Promise<void> {
  if (!available()) return;
  const reply = await sendMessage({ type: "promote-version", version: APP_VERSION });
  if (reply.status !== "ready") {
    throw new Error(reply.status === "error" ? reply.message : "应用资源版本提升失败");
  }
}

export async function rollbackApplicationVersion(): Promise<void> {
  if (!available()) return;
  const reply = await sendMessage({ type: "rollback-version", version: APP_VERSION });
  if (reply.status === "error") throw new Error(reply.message);
  window.location.reload();
}
