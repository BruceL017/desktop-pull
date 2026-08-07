import { expect, test } from "@playwright/test";

test("the production app keeps its core workflow offline in its deployment scope", async ({
  page,
}, testInfo) => {
  const base = testInfo.project.name === "subpath" ? "/desktop-pull/" : "/";
  await page.goto(base);
  await expect(page.getByRole("heading", { name: "我的任务" })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
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
