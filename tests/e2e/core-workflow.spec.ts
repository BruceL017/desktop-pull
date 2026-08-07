import { expect, test } from "@playwright/test";

test.setTimeout(60_000);

test("the desktop UI completes the local task lifecycle and backup round trip", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "desktop workflow");
  await page.goto("/");

  const quickCreate = page.getByRole("textbox", { name: "快速添加任务" });
  await quickCreate.fill("原任务");
  await quickCreate.press("Enter");

  await page.getByRole("button", { name: "新建分类" }).click();
  const newCategoryForm = page.locator(".new-category-form");
  await newCategoryForm.getByRole("textbox", { name: "新分类名称" }).fill("工作");
  await newCategoryForm.getByRole("button", { name: "添加" }).click();
  const workSection = page.locator(".category-section").filter({
    has: page.getByRole("heading", { name: "工作" }),
  });

  await page
    .getByRole("button", { name: "原任务" })
    .dragTo(workSection.getByRole("button", { name: "空任务列表，可将任务拖到这里" }));
  await expect(workSection.getByTestId("task-title")).toHaveText("原任务");

  await workSection.getByTestId("task-title").click();
  const dialog = page.getByRole("dialog", { name: "任务详情" });
  await dialog.getByLabel("标题", { exact: true }).fill("已编辑任务");
  await dialog.getByLabel("备注", { exact: true }).fill("第一行\n第二行");
  await dialog.getByLabel("备注", { exact: true }).blur();
  await expect(dialog.getByText("已保存")).toBeVisible();
  await dialog.getByLabel("优先级", { exact: true }).selectOption("P1");
  await dialog.getByRole("button", { name: "标记为已完成" }).click();
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();

  await workSection.locator(".completed-toggle").click();
  await expect(workSection.getByTestId("task-title")).toHaveText("已编辑任务");
  await workSection.getByRole("checkbox", { name: "重新打开已编辑任务" }).click();
  await expect(
    workSection.getByRole("checkbox", { name: "完成已编辑任务" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "重命名工作" }).click();
  await page.getByRole("textbox", { name: "分类名称", exact: true }).fill("归档");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByRole("heading", { name: "归档" })).toBeVisible();

  await page.getByRole("link", { name: "历史" }).click();
  await page.getByRole("button", { name: "筛选", exact: true }).click();
  await page.getByRole("textbox", { name: "搜索分类" }).fill("工作");
  await expect(page.getByRole("button", { name: "归档" })).toBeVisible();
  await page.getByRole("button", { name: "关闭筛选" }).click();
  await expect(page.getByText("优先级 P3 → P1")).toBeVisible();
  await expect(page.getByText("标记为已完成")).toBeVisible();
  await expect(page.getByText("重新打开")).toBeVisible();

  await page.getByRole("link", { name: "任务" }).click();
  page.once("dialog", (confirmation) => confirmation.accept());
  await page.getByRole("button", { name: "删除归档" }).click();
  await expect(page.getByRole("heading", { name: "归档" })).toHaveCount(0);
  await expect(
    page
      .locator(".category-section")
      .filter({
        has: page.getByRole("heading", { name: "收件箱" }),
      })
      .getByTestId("task-title"),
  ).toHaveText("已编辑任务");

  await page.locator('summary[aria-label="已编辑任务菜单"]').click();
  page.once("dialog", (confirmation) => confirmation.accept());
  await page.getByRole("button", { name: "移入垃圾箱" }).click();
  await page.getByRole("link", { name: "垃圾箱" }).click();
  await expect(page.getByText("已编辑任务")).toBeVisible();
  await page.getByRole("button", { name: "恢复", exact: true }).click();
  await expect(page.getByText("已恢复「已编辑任务」")).toBeVisible();

  await page.getByRole("link", { name: "备份" }).click();
  const backupDownload = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "下载 JSON" }).click(),
  ]).then(([download]) => download);
  const backupPath = await backupDownload.path();
  expect(backupPath).not.toBeNull();

  await page.getByRole("link", { name: "任务" }).click();
  await quickCreate.fill("导入后应消失");
  await quickCreate.press("Enter");
  await expect(page.getByText("导入后应消失")).toBeVisible();
  await page.getByRole("link", { name: "备份" }).click();
  await page.locator('input[type="file"]').setInputFiles(backupPath as string);
  await expect(page.locator(".import-summary")).toContainText("1");
  page.once("dialog", (confirmation) => confirmation.accept());
  await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "覆盖当前数据" }).click(),
  ]);

  await expect(page.getByRole("heading", { name: "我的任务" })).toBeVisible();
  await expect(page.getByText("已编辑任务")).toBeVisible();
  await expect(page.getByText("导入后应消失")).toHaveCount(0);

  await page.locator('summary[aria-label="已编辑任务菜单"]').click();
  page.once("dialog", (confirmation) => confirmation.accept());
  await page.getByRole("button", { name: "移入垃圾箱" }).click();
  await page.getByRole("link", { name: "垃圾箱" }).click();
  page.once("dialog", (confirmation) => confirmation.accept());
  await page.getByRole("button", { name: "永久删除", exact: true }).click();
  await expect(page.getByText("垃圾箱是空的")).toBeVisible();
});
