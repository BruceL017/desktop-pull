import { expect, test } from "@playwright/test";

test("the production app keeps its core workflow offline in its deployment scope", async ({
  page,
}, testInfo) => {
  const base = testInfo.project.name === "subpath" ? "/desktop-pull/" : "/";
  await page.goto(base);
  await expect(page.getByRole("heading", { name: "我的任务" })).toBeVisible();
  expect(
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return new URL(registration.active?.scriptURL ?? location.href).searchParams.get(
        "app-version",
      );
    }),
  ).toBe("0.2.0");
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const keys = await caches.keys();
        const key = keys.find((candidate) => candidate.startsWith("desktop-pull-shell-"));
        if (!key) return false;
        const requests = await (await caches.open(key)).keys();
        return (
          requests.some(({ url }) => url.endsWith(".js")) &&
          requests.some(({ url }) => url.endsWith(".css"))
        );
      }),
    )
    .toBe(true);
  await expect(
    page.evaluate(async (scope) => {
      const cache = await caches.open("desktop-pull-launcher");
      const response = await cache.match(
        new URL("__desktop-pull-launcher-state__", scope).href,
      );
      return response?.json();
    }, new URL(base, page.url()).href),
  ).resolves.toEqual({
    lastKnownGoodVersion: "0.2.0",
    candidateVersion: null,
    failedVersions: [],
  });

  await page.context().setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "我的任务" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${base.replaceAll("/", "\\/")}#/$`));

  const input = page.getByRole("textbox", { name: "快速添加任务" });
  await input.fill("离线任务");
  await input.press("Enter");
  await expect(page.getByText("离线任务")).toBeVisible();

  await page.getByRole("link", { name: "历史" }).click();
  await expect(page.getByRole("heading", { name: "历史" })).toBeVisible();
  await expect(page.getByText("创建于收件箱")).toBeVisible();

  await page.getByRole("link", { name: "设置" }).click();
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.getByRole("link", { name: "Tasks" }).click();
  await expect(page.getByText("离线任务")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "My tasks" })).toBeVisible();
  await expect(page.getByText("离线任务")).toBeVisible();
});

test("the launcher isolates a failed candidate and selects the cached last-known-good version", async ({
  page,
}, testInfo) => {
  const base = testInfo.project.name === "subpath" ? "/desktop-pull/" : "/";
  await page.goto(base);
  await expect(page.getByRole("heading", { name: "我的任务" })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);

  const result = await page.evaluate(async (scope) => {
    const currentName = "desktop-pull-shell-0.2.0";
    const legacyName = "desktop-pull-shell-0.1.0";
    const current = await caches.open(currentName);
    const legacy = await caches.open(legacyName);
    for (const request of await current.keys()) {
      const response = await current.match(request);
      if (response) await legacy.put(request, response);
    }
    const launcher = await caches.open("desktop-pull-launcher");
    const stateUrl = new URL("__desktop-pull-launcher-state__", scope).href;
    await launcher.put(
      stateUrl,
      new Response(
        JSON.stringify({
          lastKnownGoodVersion: "0.1.0",
          candidateVersion: "0.2.0",
          failedVersions: [],
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );

    const reply = await new Promise<{ status: string }>((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = (event) => resolve(event.data);
      const worker = navigator.serviceWorker.controller;
      if (!worker) throw new Error("Service Worker does not control the page");
      worker.postMessage({ type: "rollback-version", version: "0.2.0" }, [channel.port2]);
    });
    const state = await (await launcher.match(stateUrl))?.json();
    return { reply, state, cacheNames: await caches.keys() };
  }, new URL(base, page.url()).href);

  expect(result.reply).toEqual({ status: "rollback" });
  expect(result.state).toEqual({
    lastKnownGoodVersion: "0.1.0",
    candidateVersion: null,
    failedVersions: ["0.2.0"],
  });
  expect(result.cacheNames).toContain("desktop-pull-shell-0.1.0");
  expect(result.cacheNames).not.toContain("desktop-pull-shell-0.2.0");
});
