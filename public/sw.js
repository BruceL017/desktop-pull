const currentVersion = "0.2.0";
const shellCachePrefix = "desktop-pull-shell-";
const launcherCacheName = "desktop-pull-launcher";
const scopeUrl = new URL("./", self.registration.scope);
const stateUrl = new URL("__desktop-pull-launcher-state__", scopeUrl).href;
const shellUrls = [
  scopeUrl.href,
  new URL("manifest.webmanifest", scopeUrl).href,
  new URL("icon-192.png", scopeUrl).href,
  new URL("icon-512.png", scopeUrl).href,
];

function shellCacheName(version) {
  return `${shellCachePrefix}${version}`;
}

function versionFromCacheName(name) {
  return name.startsWith(shellCachePrefix) ? name.slice(shellCachePrefix.length) : null;
}

async function readLauncherState() {
  const launcher = await caches.open(launcherCacheName);
  const stored = await launcher.match(stateUrl);
  if (stored) return stored.json();

  const versions = (await caches.keys())
    .map(versionFromCacheName)
    .filter(Boolean)
    .sort();
  const previousVersion = versions.filter((version) => version !== currentVersion).at(-1);
  return {
    lastKnownGoodVersion: previousVersion ?? currentVersion,
    candidateVersion: previousVersion ? currentVersion : null,
    failedVersions: [],
  };
}

async function writeLauncherState(state) {
  const launcher = await caches.open(launcherCacheName);
  await launcher.put(
    stateUrl,
    new Response(JSON.stringify(state), {
      headers: { "content-type": "application/json" },
    }),
  );
}

function validResourceUrls(values) {
  if (!Array.isArray(values)) return [];
  return values.flatMap((value) => {
    if (typeof value !== "string") return [];
    const url = new URL(value, scopeUrl);
    return url.origin === scopeUrl.origin && url.href.startsWith(scopeUrl.href)
      ? [url.href]
      : [];
  });
}

async function cacheResources(version, urls) {
  const resources = [...new Set(validResourceUrls(urls))];
  if (resources.length === 0) return;
  await (await caches.open(shellCacheName(version))).addAll(resources);
}

async function resourcesAreComplete(version) {
  const cache = await caches.open(shellCacheName(version));
  const requests = await cache.keys();
  return (
    Boolean(await cache.match(scopeUrl.href)) &&
    requests.some(({ url }) => url.endsWith(".js")) &&
    requests.some(({ url }) => url.endsWith(".css"))
  );
}

function reply(event, value) {
  event.ports[0]?.postMessage(value);
}

async function prepareVersion(event) {
  const { activeAppVersion, urls, version } = event.data;
  if (version !== currentVersion) {
    reply(event, { status: "error", message: "候选应用版本与资源版本不匹配" });
    return;
  }
  const state = await readLauncherState();
  if (state.failedVersions.includes(currentVersion)) {
    reply(event, { status: "rollback" });
    return;
  }
  if (
    activeAppVersion !== currentVersion ||
    !(await resourcesAreComplete(currentVersion))
  ) {
    await cacheResources(currentVersion, urls);
  }
  if (
    activeAppVersion !== state.lastKnownGoodVersion &&
    activeAppVersion !== currentVersion
  ) {
    reply(event, { status: "error", message: "激活数据库没有兼容的离线应用资源" });
    return;
  }
  if (!(await resourcesAreComplete(state.lastKnownGoodVersion))) {
    reply(event, { status: "error", message: "最后已知良好应用资源不完整" });
    return;
  }
  if (!(await resourcesAreComplete(currentVersion))) {
    reply(event, { status: "error", message: "候选应用资源不完整" });
    return;
  }
  if (activeAppVersion !== currentVersion) {
    state.candidateVersion = currentVersion;
    await writeLauncherState(state);
  }
  reply(event, { status: "ready" });
}

async function promoteVersion(event) {
  if (event.data.version !== currentVersion) {
    reply(event, { status: "error", message: "无法提升不匹配的应用版本" });
    return;
  }
  const state = await readLauncherState();
  state.lastKnownGoodVersion = currentVersion;
  state.candidateVersion = null;
  state.failedVersions = state.failedVersions.filter(
    (version) => version !== currentVersion,
  );
  await writeLauncherState(state);
  await Promise.all(
    (await caches.keys()).flatMap((name) =>
      name.startsWith(shellCachePrefix) && name !== shellCacheName(currentVersion)
        ? [caches.delete(name)]
        : [],
    ),
  );
  reply(event, { status: "ready" });
}

async function rollbackVersion(event) {
  const state = await readLauncherState();
  if (
    event.data.version !== currentVersion ||
    state.lastKnownGoodVersion === currentVersion ||
    !(await resourcesAreComplete(state.lastKnownGoodVersion))
  ) {
    reply(event, { status: "error", message: "无法证明可离线回退的应用版本" });
    return;
  }
  state.candidateVersion = null;
  state.failedVersions = [...new Set([...state.failedVersions, currentVersion])];
  await writeLauncherState(state);
  await caches.delete(shellCacheName(currentVersion));
  reply(event, { status: "rollback" });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await (await caches.open(shellCacheName(currentVersion))).addAll(shellUrls);
      const state = await readLauncherState();
      if (
        state.lastKnownGoodVersion !== currentVersion &&
        !state.failedVersions.includes(currentVersion)
      ) {
        state.candidateVersion = currentVersion;
      }
      await writeLauncherState(state);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "activate-candidate") {
    event.waitUntil(self.skipWaiting());
    return;
  }
  if (event.data?.type === "cache-app-resources") {
    event.waitUntil(
      (async () => {
        const state = await readLauncherState();
        await cacheResources(
          event.data.version ?? state.lastKnownGoodVersion,
          event.data.urls,
        );
      })(),
    );
    return;
  }

  const handlers = {
    "prepare-version": prepareVersion,
    "promote-version": promoteVersion,
    "rollback-version": rollbackVersion,
  };
  const handler = handlers[event.data?.type];
  if (!handler) return;
  event.waitUntil(
    handler(event).catch((error) => {
      reply(event, {
        status: "error",
        message: error instanceof Error ? error.message : "应用资源版本协调失败",
      });
    }),
  );
});

async function selectedVersion() {
  const state = await readLauncherState();
  return state.candidateVersion === currentVersion &&
    !state.failedVersions.includes(currentVersion)
    ? currentVersion
    : state.lastKnownGoodVersion;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== scopeUrl.origin || !url.href.startsWith(scopeUrl.href)) return;

  event.respondWith(
    (async () => {
      const version = await selectedVersion();
      const cache = await caches.open(shellCacheName(version));
      if (event.request.mode === "navigate") {
        return (await cache.match(scopeUrl.href)) ?? fetch(event.request);
      }
      const cached = await cache.match(event.request, { ignoreVary: true });
      if (cached) return cached;
      const anyVersion = await caches.match(event.request, { ignoreVary: true });
      if (anyVersion) return anyVersion;
      const response = await fetch(event.request);
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    })(),
  );
});
