const cacheName = "desktop-pull-shell-0.1.0";
const scopeUrl = new URL("./", self.registration.scope);
const shellUrls = [
  scopeUrl.href,
  new URL("manifest.webmanifest", scopeUrl).href,
  new URL("icon-192.png", scopeUrl).href,
  new URL("icon-512.png", scopeUrl).href,
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(shellUrls)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "cache-app-resources" || !Array.isArray(event.data.urls)) {
    return;
  }
  const urls = event.data.urls.filter((value) => {
    if (typeof value !== "string") return false;
    const url = new URL(value, scopeUrl);
    return url.origin === scopeUrl.origin && url.href.startsWith(scopeUrl.href);
  });
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(urls)));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== scopeUrl.origin || !url.href.startsWith(scopeUrl.href)) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(cacheName);
            await cache.put(scopeUrl, response.clone());
          }
          return response;
        })
        .catch(async () => (await caches.match(scopeUrl)) ?? Response.error()),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request, { ignoreVary: true }).then(
      (cached) =>
        cached ??
        fetch(event.request).then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(cacheName);
            await cache.put(event.request, response.clone());
          }
          return response;
        }),
    ),
  );
});
