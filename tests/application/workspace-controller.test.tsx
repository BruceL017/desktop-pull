import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { WorkspaceProvider } from "../../src/application/workspace-controller";
import { applyCreateIntent, freezeCreateIntent } from "../../src/domain/create-task";
import { freezeTaskTrash } from "../../src/domain/operations";
import { emptyWorkspace } from "../../src/domain/workspace";
import { bootstrapDatabase } from "../../src/storage/database";
import { WorkspaceRepository } from "../../src/storage/workspace-repository";
import { PendingCreateNotice } from "../../src/ui/StorageNotice";
import { TaskPage } from "../../src/ui/TaskPage";

function renderPage() {
  return render(
    <WorkspaceProvider>
      <PendingCreateNotice />
      <TaskPage />
    </WorkspaceProvider>,
  );
}

describe("WorkspaceProvider", () => {
  it("keeps focus through the A-to-B flow and preserves submission order", async () => {
    const user = userEvent.setup();
    renderPage();
    const input = await screen.findByRole("textbox", { name: "快速添加任务" });

    await user.type(input, "A{Enter}B{Enter}");

    expect(await screen.findByText("A")).toBeVisible();
    expect(screen.getByText("B")).toBeVisible();
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(screen.getAllByTestId("task-title").map((node) => node.textContent)).toEqual([
      "A",
      "B",
    ]);
  });

  it("does not submit Enter while an IME composition is active", async () => {
    renderPage();
    const input = await screen.findByRole("textbox", { name: "快速添加任务" });

    fireEvent.compositionStart(input);
    fireEvent.change(input, {
      target: { value: "中文", selectionStart: 2 },
    });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter", isComposing: true });
    expect(screen.queryByTestId("task-title")).not.toBeInTheDocument();

    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    expect(await screen.findByText("中文")).toBeVisible();
  });

  it("retains working tasks and input ability after a create transaction fails", async () => {
    (
      globalThis as { __DESKTOP_PULL_TEST_FAILURES__?: Record<string, number> }
    ).__DESKTOP_PULL_TEST_FAILURES__ = { "create.afterTask": 20 };
    const user = userEvent.setup();
    renderPage();
    const input = await screen.findByRole("textbox", { name: "快速添加任务" });

    await user.type(input, "A{Enter}");
    expect(await screen.findByText("A")).toBeVisible();
    expect(await screen.findByText(/1 项变更尚未安全保存/)).toBeVisible();

    await user.type(input, "B{Enter}");
    expect(await screen.findByText("B")).toBeVisible();
    expect(input).toHaveFocus();

    (
      globalThis as { __DESKTOP_PULL_TEST_FAILURES__?: Record<string, number> }
    ).__DESKTOP_PULL_TEST_FAILURES__ = {};
    await user.click(screen.getByRole("button", { name: "重试保存" }));
    await waitFor(() =>
      expect(screen.queryByText(/尚未安全保存/)).not.toBeInTheDocument(),
    );
  });

  it("keeps only the latest failed draft snapshot and can retry it", async () => {
    (
      globalThis as { __DESKTOP_PULL_TEST_FAILURES__?: Record<string, number> }
    ).__DESKTOP_PULL_TEST_FAILURES__ = { "draft.beforeWrite": 20 };
    const user = userEvent.setup();
    renderPage();
    const input = await screen.findByRole("textbox", { name: "快速添加任务" });

    await user.type(input, "最新草稿");
    expect(await screen.findByText("草稿未保存")).toBeVisible();
    expect(input).toHaveValue("最新草稿");

    (
      globalThis as { __DESKTOP_PULL_TEST_FAILURES__?: Record<string, number> }
    ).__DESKTOP_PULL_TEST_FAILURES__ = {};
    await user.click(screen.getByRole("button", { name: "重试草稿" }));
    await waitFor(() => expect(screen.queryByText("草稿未保存")).not.toBeInTheDocument());
  });

  it("hides expired content immediately and retries physical cleanup separately", async () => {
    const taskId = "70000000-0000-4000-8000-000000000001";
    const draft = {
      entry: { kind: "global" as const },
      generation: "70000000-0000-4000-8000-000000000002",
      title: "Expired task",
      cursorOffset: 12,
    };
    const initial = { ...emptyWorkspace(), drafts: [draft] };
    const intent = freezeCreateIntent({
      workspace: initial,
      draft,
      taskId,
      submissionId: "70000000-0000-4000-8000-000000000003",
      occurredAt: "2026-05-01T00:00:00.000Z",
    });
    const repository = new WorkspaceRepository(await bootstrapDatabase());
    await repository.commitCreate(intent);
    await repository.commitMutation(
      freezeTaskTrash(applyCreateIntent(initial, intent), taskId, {
        occurredAt: "2026-06-01T00:00:00.000Z",
      }),
    );
    repository.close();
    (
      globalThis as { __DESKTOP_PULL_TEST_FAILURES__?: Record<string, number> }
    ).__DESKTOP_PULL_TEST_FAILURES__ = { "mutation.beforeWrite": 20 };

    const rendered = renderPage();
    expect(await screen.findByText("到期内容清理待完成")).toBeVisible();
    expect(screen.queryByText("Expired task")).not.toBeInTheDocument();

    (
      globalThis as { __DESKTOP_PULL_TEST_FAILURES__?: Record<string, number> }
    ).__DESKTOP_PULL_TEST_FAILURES__ = {};
    await userEvent.click(screen.getByRole("button", { name: "重试清理" }));
    await waitFor(() =>
      expect(screen.queryByText("到期内容清理待完成")).not.toBeInTheDocument(),
    );
    rendered.unmount();

    const verified = new WorkspaceRepository(await bootstrapDatabase());
    expect((await verified.read()).tasks).toEqual([]);
    verified.close();
  });
});
