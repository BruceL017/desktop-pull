import { expect, type Page, test } from "@playwright/test";

async function createCategory(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "新建分类" }).click();
  const input = page.getByRole("textbox", { name: "新分类名称" }).last();
  await expect(input).toBeFocused();
  await input.fill(name);
  await page.locator(".new-category-form").getByRole("button", { name: "添加" }).click();
}

test("category creation and title quick-create use explicit focused entry points", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "desktop interaction");
  await page.goto("/");

  await expect(page.getByRole("textbox", { name: "新分类名称" })).toHaveCount(0);
  await createCategory(page, "工作");

  const work = page.locator(".category-section").filter({
    has: page.getByRole("heading", { name: "工作" }),
  });
  await work.getByRole("button", { name: "在工作快速添加任务" }).click();
  const input = work.getByRole("textbox", { name: "在工作添加任务" });
  await expect(input).toBeFocused();
  await input.fill("标题入口任务");
  await input.press("Enter");
  await expect(work.getByTestId("task-title")).toHaveText("标题入口任务");
});

test("the category heading reorders directly without requiring the grip", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "desktop interaction");
  await page.goto("/");
  await createCategory(page, "A");
  await createCategory(page, "B");
  await createCategory(page, "C");

  const aHeading = page.locator(".category-drag-region").filter({
    has: page.getByRole("heading", { name: "A" }),
  });
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await aHeading.dispatchEvent("dragstart", { dataTransfer });
  const finalMarker = page.locator('[data-category-drop-index="3"]');
  await finalMarker.dispatchEvent("dragover", { dataTransfer });
  await finalMarker.dispatchEvent("drop", { dataTransfer });
  await aHeading.dispatchEvent("dragend", { dataTransfer });
  await expect(page.locator(".category-section h2")).toHaveText([
    "收件箱",
    "B",
    "C",
    "A",
  ]);
});

test("pointer cancellation never commits the current task drop target", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "pointer contract");
  await page.addInitScript(() => {
    HTMLElement.prototype.setPointerCapture = () => undefined;
    HTMLElement.prototype.releasePointerCapture = () => undefined;
    HTMLElement.prototype.hasPointerCapture = () => true;
  });
  await page.goto("/");
  await createCategory(page, "目标");
  const input = page.getByRole("textbox", { name: "快速添加任务" });
  await input.fill("不可误投");
  await input.press("Enter");

  const source = page.getByRole("button", { name: "不可误投" });
  const target = page
    .locator(".category-section")
    .filter({ has: page.getByRole("heading", { name: "目标" }) })
    .getByRole("button", { name: "空任务列表，可将任务拖到这里" });
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  const pointer = {
    pointerType: "touch",
    pointerId: 7,
    isPrimary: true,
    buttons: 1,
  };
  await source.dispatchEvent("pointerdown", {
    ...pointer,
    clientX: sourceBox?.x,
    clientY: sourceBox?.y,
  });
  await page.waitForTimeout(220);
  await source.dispatchEvent("pointermove", {
    ...pointer,
    clientX: (targetBox?.x ?? 0) + 10,
    clientY: (targetBox?.y ?? 0) + 10,
  });
  await source.dispatchEvent("pointercancel", {
    ...pointer,
    buttons: 0,
    clientX: (targetBox?.x ?? 0) + 10,
    clientY: (targetBox?.y ?? 0) + 10,
  });

  await expect(page.getByRole("heading", { name: "收件箱" }).locator("..")).toBeVisible();
  await expect(target.getByText("不可误投")).toHaveCount(0);
  await expect(source).toBeVisible();
});

test("a completed task can reveal and enter an empty completed target", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "desktop interaction");
  await page.goto("/");
  await createCategory(page, "来源");
  await createCategory(page, "目标");

  const sourceSection = page.locator(".category-section").filter({
    has: page.getByRole("heading", { name: "来源" }),
  });
  const targetSection = page.locator(".category-section").filter({
    has: page.getByRole("heading", { name: "目标" }),
  });
  await sourceSection.getByRole("button", { name: "在来源快速添加任务" }).click();
  const input = sourceSection.getByRole("textbox", { name: "在来源添加任务" });
  await input.fill("已完成移动");
  await input.press("Enter");
  await sourceSection.getByRole("checkbox", { name: "完成已完成移动" }).click();
  await sourceSection.locator(".completed-toggle").click();

  const source = sourceSection.getByRole("button", { name: "已完成移动" });
  const sourceHandle = await source.elementHandle();
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent("dragstart", { dataTransfer });

  const completedToggle = targetSection.locator(".completed-toggle");
  await expect(completedToggle).toBeVisible();
  await completedToggle.dispatchEvent("dragover", { dataTransfer });
  await page.waitForTimeout(550);
  const target = targetSection
    .locator(".completed-section")
    .getByRole("button", { name: "空任务列表，可将任务拖到这里" });
  await expect(target).toBeVisible();
  await target.dispatchEvent("dragover", { dataTransfer });
  await target.dispatchEvent("drop", { dataTransfer });
  await sourceHandle?.dispatchEvent("dragend", { dataTransfer });

  await expect(targetSection.getByTestId("task-title")).toHaveText("已完成移动");
  await expect(sourceSection.getByTestId("task-title")).toHaveCount(0);
});

test("history filters compose, persist for the session, and yield to task deep links", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "desktop interaction");
  await page.goto("/");
  const input = page.getByRole("textbox", { name: "快速添加任务" });
  await input.fill("原始标题");
  await input.press("Enter");
  await page.getByRole("button", { name: "原始标题" }).click();
  const editor = page.getByRole("dialog", { name: "任务详情" });
  await editor.getByLabel("标题", { exact: true }).fill("最终标题");
  await editor.getByLabel("标题", { exact: true }).blur();
  await expect(editor.getByText("已保存")).toBeVisible();
  await editor.getByRole("button", { name: "关闭", exact: true }).click();

  await page.getByRole("link", { name: "历史" }).click();
  await expect(page.locator(".history-day")).toHaveCount(1);
  await page.getByRole("button", { name: "筛选", exact: true }).click();
  const filter = page.getByRole("dialog", { name: "筛选历史" });
  await expect(filter.getByRole("checkbox")).toHaveCount(8);
  await filter.getByRole("textbox", { name: "搜索任务" }).fill("原始标题");
  await filter.getByRole("button", { name: "最终标题" }).click();
  await filter.getByRole("checkbox", { name: "创建" }).check();
  await filter.getByRole("checkbox", { name: "内容编辑" }).check();
  await filter.getByRole("button", { name: "关闭筛选" }).click();

  const chips = page.getByRole("group", { name: "筛选条件" });
  await expect(chips.getByRole("button")).toHaveCount(4);
  await expect(page.getByText("创建于收件箱")).toBeVisible();
  await expect(page.getByText("修改了标题")).toBeVisible();
  await page.getByRole("link", { name: "任务" }).click();
  await page.getByRole("link", { name: "历史" }).click();
  await expect(page.getByRole("group", { name: "筛选条件" })).toBeVisible();

  await page.getByRole("link", { name: "任务" }).click();
  await page.getByRole("button", { name: "最终标题" }).click();
  await page
    .getByRole("dialog", { name: "任务详情" })
    .getByRole("button", {
      name: "查看历史",
    })
    .click();
  await expect(page).not.toHaveURL(/task=/);
  const deepLinkChips = page.getByRole("group", { name: "筛选条件" });
  await expect(deepLinkChips.getByRole("button")).toHaveCount(2);
  await expect(deepLinkChips).not.toContainText("创建");
  await expect(deepLinkChips).not.toContainText("内容编辑");
});

test("history filters open as a functional mobile bottom sheet", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "webkit-mobile", "mobile interaction");
  await page.goto("/");
  await page.getByRole("button", { name: "打开快速添加" }).click();
  const input = page.getByRole("textbox", { name: "快速添加任务" });
  await input.fill("移动历史筛选");
  await input.press("Enter");
  await page.getByRole("link", { name: "历史" }).click();
  await page.getByRole("button", { name: "筛选", exact: true }).click();

  const panel = page.getByRole("dialog", { name: "筛选历史" });
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.x).toBeLessThanOrEqual(1);
  expect(box?.width).toBeGreaterThanOrEqual(389);
  expect(Math.abs((box?.y ?? 0) + (box?.height ?? 0) - 844)).toBeLessThanOrEqual(1);
  await panel.getByRole("checkbox", { name: "创建" }).check();
  await panel.getByRole("button", { name: "关闭筛选" }).click();

  await expect(page.getByRole("group", { name: "筛选条件" })).toContainText("创建");
  await expect(page.getByText("创建于收件箱")).toBeVisible();
});
