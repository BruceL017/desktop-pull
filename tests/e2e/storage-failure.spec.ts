import { expect, test } from "@playwright/test";

test("an initial full-read failure shows data protection before retry", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (
      window as typeof window & { __DESKTOP_PULL_TEST_FAILURES__: Record<string, number> }
    ).__DESKTOP_PULL_TEST_FAILURES__ = { "bootstrap.fullRead": 1 };
  });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "本地数据尚未加载" })).toBeVisible();
  await expect(page.getByText(/本地数据没有被改写/)).toBeVisible();
  await page.getByRole("button", { name: "重试加载" }).click();
  await expect(page.getByRole("heading", { name: "收件箱" })).toBeVisible();
});

test("failed creates stay ordered, exportable and retry idempotently", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "下载断言使用桌面项目");
  await page.addInitScript(() => {
    (
      window as typeof window & { __DESKTOP_PULL_TEST_FAILURES__: Record<string, number> }
    ).__DESKTOP_PULL_TEST_FAILURES__ = { "create.afterTask": 50 };
  });
  await page.goto("/");
  const input = page.getByRole("textbox", { name: "快速添加任务" });
  await input.fill("A");
  await input.press("Enter");
  await input.fill("B");
  await input.press("Enter");

  await expect(page.getByTestId("task-title")).toHaveText(["A", "B"]);
  await expect(page.getByText(/2 项变更尚未安全保存/)).toBeVisible();
  await expect(input).toBeFocused();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出应急备份" }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  let json = "";
  for await (const chunk of stream) json += chunk.toString();
  const backup = JSON.parse(json);
  expect(backup.format).toBe("desktop-pull-backup");
  expect(backup.data.tasks.map(({ title }: { title: string }) => title)).toEqual([
    "A",
    "B",
  ]);
  expect(backup.data.history).toHaveLength(2);
  expect(backup.data.meta.nextOperationSequence).toBe("3");

  await page.evaluate(() => {
    (
      window as typeof window & { __DESKTOP_PULL_TEST_FAILURES__: Record<string, number> }
    ).__DESKTOP_PULL_TEST_FAILURES__ = {};
  });
  await page.getByRole("button", { name: "重试保存" }).click();
  await expect(page.getByText(/尚未安全保存/)).toBeHidden();
  await page.reload();
  await expect(page.getByTestId("task-title")).toHaveText(["A", "B"]);
});

test("a failed draft remains editable, exportable and manually retryable", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "下载断言使用桌面项目");
  await page.addInitScript(() => {
    (
      window as typeof window & { __DESKTOP_PULL_TEST_FAILURES__: Record<string, number> }
    ).__DESKTOP_PULL_TEST_FAILURES__ = { "draft.beforeWrite": 50 };
  });
  await page.goto("/");
  const input = page.getByRole("textbox", { name: "快速添加任务" });
  await input.fill("草稿");
  await input.type("B");
  await expect(page.getByText("草稿未保存")).toBeVisible();
  await expect(page.getByText(/关闭或刷新可能丢失/)).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出应急备份" }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  let json = "";
  for await (const chunk of stream) json += chunk.toString();
  expect(JSON.parse(json).data.drafts[0].title).toBe("草稿B");

  await page.evaluate(() => {
    (
      window as typeof window & { __DESKTOP_PULL_TEST_FAILURES__: Record<string, number> }
    ).__DESKTOP_PULL_TEST_FAILURES__ = {};
  });
  await page.getByRole("button", { name: "重试草稿" }).click();
  await expect(page.getByText("草稿未保存")).toBeHidden();
  await page.reload();
  await expect(input).toHaveValue("草稿B");
});
