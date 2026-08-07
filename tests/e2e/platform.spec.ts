import { expect, test } from "@playwright/test";

test("language switching is immediate, persistent, and leaves user data unchanged", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "desktop settings flow");
  await page.goto("/");
  const input = page.getByRole("textbox", { name: "快速添加任务" });
  await input.fill("用户原文");
  await input.press("Enter");

  await page.getByRole("link", { name: "设置" }).click();
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("button", { name: "English" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("link", { name: "Tasks" }).click();
  await expect(page.getByText("用户原文")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "My tasks" })).toBeVisible();
  await expect(page.getByText("用户原文")).toBeVisible();
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("button", { name: "简体中文" }).click();
  await expect(page.getByRole("heading", { name: "设置" })).toBeVisible();
});

test("a second window reads data only after a safe ownership handoff", async ({
  context,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "desktop window flow");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "我的任务" })).toBeVisible();

  const second = await context.newPage();
  await second.goto("/");
  await expect(
    second.getByRole("heading", { name: "Desktop Pull 已在另一窗口打开" }),
  ).toBeVisible();
  await second.getByRole("button", { name: "在此窗口继续" }).click();

  await expect(second.getByRole("heading", { name: "我的任务" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Desktop Pull 已在另一窗口打开" }),
  ).toBeVisible();
});
