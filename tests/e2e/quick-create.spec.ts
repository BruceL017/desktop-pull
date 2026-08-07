import { expect, test } from "@playwright/test";

test("cold start normalizes to the Chinese task route", async ({ page }) => {
  await page.goto("/#/unknown");
  await expect(page).toHaveURL(/\/#\/$/);
  await expect(page.getByRole("heading", { name: "收件箱" })).toBeVisible();
  await expect(page.locator(".brand-name:visible, .mobile-brand:visible")).toHaveText(
    "Desktop Pull",
  );
});

test("desktop creates A then B, keeps focus and restores after refresh", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "桌面场景");
  await page.goto("/");
  const input = page.getByRole("textbox", { name: "快速添加任务" });
  await input.fill("A");
  await input.press("Enter");
  await input.type("B");
  await input.press("Enter");

  await expect(input).toBeFocused();
  await expect(input).toHaveValue("");
  await expect(page.getByTestId("task-title")).toHaveText(["A", "B"]);

  await page.reload();
  await expect(page.getByTestId("task-title")).toHaveText(["A", "B"]);
  await expect(input).not.toBeFocused();
});

test("desktop restores an unsubmitted UTF-16 draft without restoring focus", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "桌面场景");
  await page.goto("/");
  const input = page.getByRole("textbox", { name: "快速添加任务" });
  await input.fill("草稿😀");
  await input.evaluate((element: HTMLInputElement) => element.setSelectionRange(3, 3));
  await input.press("ArrowLeft");
  await page.waitForTimeout(100);
  await page.reload();

  await expect(input).toHaveValue("草稿😀");
  await expect(input).not.toBeFocused();
});

test("mobile opens the same global entry from the fixed plus and creates a task", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "webkit-mobile", "移动场景");
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "快速添加任务" })).toBeHidden();

  await page.getByRole("button", { name: "打开快速添加" }).click();
  const input = page.getByRole("textbox", { name: "快速添加任务" });
  await expect(input).toBeFocused();
  await input.fill("移动任务");
  await page.getByRole("button", { name: "添加任务", exact: true }).click();

  await expect(page.getByText("移动任务")).toBeVisible();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("");
  await page.reload();
  await expect(page.getByText("移动任务")).toBeVisible();
});
