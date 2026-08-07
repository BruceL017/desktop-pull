import { Filter, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useI18n } from "../application/i18n";
import { useWorkspace } from "../application/workspace-controller";
import type { CategorySnapshot, HistoryEvent, TaskPosition } from "../domain/schemas";

type ActionGroup =
  | "create"
  | "content"
  | "status"
  | "priority"
  | "move"
  | "delete"
  | "restore"
  | "category";
type Text = (chinese: string, english: string) => string;

const actionGroups: ActionGroup[] = [
  "create",
  "content",
  "status",
  "priority",
  "move",
  "delete",
  "restore",
  "category",
];

interface HistoryFilters {
  taskId: string | null;
  categoryId: string | null;
  actions: ActionGroup[];
}

const emptyFilters: HistoryFilters = {
  taskId: null,
  categoryId: null,
  actions: [],
};
let sessionFilters: HistoryFilters = emptyFilters;

function actionGroupLabel(group: ActionGroup, text: Text): string {
  const labels: Record<ActionGroup, [string, string]> = {
    create: ["创建", "Created"],
    content: ["内容编辑", "Content editing"],
    status: ["完成状态", "Completion"],
    priority: ["优先级", "Priority"],
    move: ["移动与归类", "Moves and categories"],
    delete: ["删除", "Deletion"],
    restore: ["恢复", "Restore"],
    category: ["分类管理", "Category management"],
  };
  return text(...labels[group]);
}

function actionGroup(event: HistoryEvent): ActionGroup {
  if (event.eventType === "task.created") return "create";
  if (event.eventType === "task.content_changed") return "content";
  if (event.eventType === "task.completed" || event.eventType === "task.reopened") {
    return "status";
  }
  if (event.eventType === "task.priority_changed") return "priority";
  if (
    event.eventType === "task.reordered" ||
    event.eventType === "task.category_changed" ||
    event.eventType === "task.moved_to_inbox_by_category_deletion"
  ) {
    return "move";
  }
  if (event.eventType === "task.trashed") return "delete";
  if (event.eventType === "task.restored") return "restore";
  return "category";
}

function categoryName(snapshot: CategorySnapshot, text: Text): string {
  return "name" in snapshot ? snapshot.name : text("收件箱", "Inbox");
}

function categoryIdentity(snapshot: CategorySnapshot): string {
  return snapshot.ref.kind === "inbox" ? "inbox" : snapshot.ref.categoryId;
}

function taskPosition(position: TaskPosition, text: Text): string {
  const previous =
    position.previousTask.kind === "start"
      ? text("开头", "start")
      : position.previousTask.kind === "unavailable"
        ? text("不可用", "unavailable")
        : position.previousTask.title;
  const next =
    position.nextTask.kind === "end"
      ? text("末尾", "end")
      : position.nextTask.kind === "unavailable"
        ? text("不可用", "unavailable")
        : position.nextTask.title;
  return text(`${previous} 与 ${next} 之间`, `between ${previous} and ${next}`);
}

function categoryPosition(
  position: {
    previousCategory:
      | { kind: "start" }
      | { kind: "category"; categoryId: string; name: string };
    nextCategory:
      | { kind: "end" }
      | { kind: "category"; categoryId: string; name: string };
  },
  text: Text,
): string {
  const previous =
    position.previousCategory.kind === "start"
      ? text("开头", "start")
      : position.previousCategory.name;
  const next =
    position.nextCategory.kind === "end"
      ? text("末尾", "end")
      : position.nextCategory.name;
  return text(`${previous} 与 ${next} 之间`, `between ${previous} and ${next}`);
}

function statusName(status: "open" | "completed", text: Text): string {
  return status === "open" ? text("未完成", "Open") : text("已完成", "Completed");
}

function taskPlacement(position: TaskPosition, text: Text): string | null {
  const { nextTask, previousTask } = position;
  if (previousTask.kind === "start" && nextTask.kind === "end") return null;
  if (previousTask.kind === "start") return text("顶部", "the top");
  if (nextTask.kind === "end") return text("末尾", "the end");
  if (previousTask.kind === "task") {
    return text(`「${previousTask.title}」之后`, `after “${previousTask.title}”`);
  }
  return null;
}

function categoryPlacement(
  position: {
    previousCategory:
      | { kind: "start" }
      | { kind: "category"; categoryId: string; name: string };
    nextCategory:
      | { kind: "end" }
      | { kind: "category"; categoryId: string; name: string };
  },
  text: Text,
): string {
  if (position.previousCategory.kind === "start") {
    return text("移到分类顶部", "Moved to the top of categories");
  }
  if (position.nextCategory.kind === "end") {
    return text("移到分类末尾", "Moved to the end of categories");
  }
  return text(
    `移到「${position.previousCategory.name}」之后`,
    `Moved after “${position.previousCategory.name}”`,
  );
}

function countTasks(count: number, text: Text): string {
  return text(`${count} 个任务`, count === 1 ? "1 task" : `${count} tasks`);
}

function eventSummary(event: HistoryEvent, text: Text): string {
  switch (event.eventType) {
    case "task.created":
      return text(
        `创建于${categoryName(event.details.categorySnapshot, text)}`,
        `Created in ${categoryName(event.details.categorySnapshot, text)}`,
      );
    case "task.content_changed":
      if ("beforeTitle" in event.details && "beforeNotes" in event.details) {
        return text("修改了标题和备注", "Changed title and notes");
      }
      return "beforeTitle" in event.details
        ? text("修改了标题", "Changed title")
        : text("修改了备注", "Changed notes");
    case "task.completed":
      return text("标记为已完成", "Marked as completed");
    case "task.reopened":
      return text("重新打开", "Reopened");
    case "task.priority_changed":
      return text(
        `优先级 ${event.details.beforePriority} → ${event.details.afterPriority}`,
        `Priority ${event.details.beforePriority} → ${event.details.afterPriority}`,
      );
    case "task.reordered": {
      const category = categoryName(event.details.categorySnapshot, text);
      const status = statusName(event.details.status, text);
      const placement = taskPlacement(event.details.afterPosition, text);
      return placement
        ? text(
            `在「${category}」的${status}区移到${placement}`,
            `Moved to ${placement} in ${status} · ${category}`,
          )
        : text(
            `调整「${category}」的${status}区顺序`,
            `Reordered ${status} · ${category}`,
          );
    }
    case "task.category_changed": {
      const source = categoryName(event.details.source.categorySnapshot, text);
      const target = categoryName(event.details.target.categorySnapshot, text);
      const status = statusName(event.details.status, text);
      const placement = taskPlacement(event.details.target.position, text);
      return placement
        ? text(
            `从「${source}」移到「${target}」的${status}区${placement}`,
            `Moved from ${source} to ${placement} in ${status} · ${target}`,
          )
        : text(
            `从「${source}」移到「${target}」的${status}区`,
            `Moved from ${source} to ${status} · ${target}`,
          );
    }
    case "task.moved_to_inbox_by_category_deletion": {
      const source = categoryName(event.details.source.categorySnapshot, text);
      const status = statusName(event.details.status, text);
      const placement = taskPlacement(event.details.targetPosition, text);
      return placement
        ? text(
            `因删除「${source}」移到收件箱${status}区${placement}`,
            `Moved to ${placement} in ${status} · Inbox when ${source} was deleted`,
          )
        : text(
            `因删除「${source}」移到收件箱${status}区`,
            `Moved to ${status} · Inbox when ${source} was deleted`,
          );
    }
    case "task.trashed":
      return text(
        `从「${categoryName(event.details.categorySnapshot, text)}」的${statusName(event.details.status, text)}区移入垃圾箱`,
        `Moved from ${statusName(event.details.status, text)} · ${categoryName(event.details.categorySnapshot, text)} to Trash`,
      );
    case "task.restored": {
      const category = categoryName(event.details.categorySnapshot, text);
      const status = statusName(event.details.status, text);
      const placement = taskPlacement(event.details.position, text);
      return placement
        ? text(
            `恢复到「${category}」的${status}区${placement}`,
            `Restored to ${placement} in ${status} · ${category}`,
          )
        : text(
            `恢复到「${category}」的${status}区`,
            `Restored to ${status} · ${category}`,
          );
    }
    case "category.created":
      return text("创建分类", "Created category");
    case "category.renamed":
      return text(
        `从「${event.details.beforeName}」重命名为「${event.subject.name}」`,
        `Renamed from “${event.details.beforeName}” to “${event.subject.name}”`,
      );
    case "category.reordered":
      return categoryPlacement(event.details.afterPosition, text);
    case "category.deleted":
      return event.details.affectedTaskCount === 0
        ? text("删除分类，没有任务被移动", "Deleted category; no tasks were moved")
        : text(
            `删除分类，将${countTasks(event.details.affectedTaskCount, text)}移到收件箱`,
            `Deleted category and moved ${countTasks(event.details.affectedTaskCount, text)} to Inbox`,
          );
  }
}

function eventFacts(event: HistoryEvent, text: Text): Array<[string, string]> {
  const category = (snapshot: CategorySnapshot): [string, string] => [
    text("分类", "Category"),
    categoryName(snapshot, text),
  ];
  switch (event.eventType) {
    case "task.created":
      return [
        category(event.details.categorySnapshot),
        [
          text("创建后位置", "Position after creation"),
          taskPosition(event.details.position, text),
        ],
      ];
    case "task.content_changed": {
      const facts: Array<[string, string]> = [category(event.details.categorySnapshot)];
      if ("beforeTitle" in event.details) {
        facts.push([text("原标题", "Previous title"), event.details.beforeTitle]);
      }
      if ("beforeNotes" in event.details) {
        facts.push([text("原备注", "Previous notes"), event.details.beforeNotes]);
        facts.push([text("新备注", "New notes"), event.details.afterNotes]);
      }
      return facts;
    }
    case "task.completed":
    case "task.reopened":
      return [category(event.details.categorySnapshot)];
    case "task.priority_changed":
      return [
        category(event.details.categorySnapshot),
        [text("原优先级", "Previous priority"), event.details.beforePriority],
        [text("新优先级", "New priority"), event.details.afterPriority],
      ];
    case "task.reordered":
      return [
        category(event.details.categorySnapshot),
        [text("状态", "Status"), statusName(event.details.status, text)],
        [
          text("移动前位置", "Position before move"),
          taskPosition(event.details.beforePosition, text),
        ],
        [
          text("移动后位置", "Position after move"),
          taskPosition(event.details.afterPosition, text),
        ],
      ];
    case "task.category_changed":
      return [
        [text("状态", "Status"), statusName(event.details.status, text)],
        [
          text("来源分类", "Source category"),
          categoryName(event.details.source.categorySnapshot, text),
        ],
        [
          text("来源位置", "Source position"),
          taskPosition(event.details.source.position, text),
        ],
        [
          text("目标分类", "Target category"),
          categoryName(event.details.target.categorySnapshot, text),
        ],
        [
          text("目标位置", "Target position"),
          taskPosition(event.details.target.position, text),
        ],
      ];
    case "task.moved_to_inbox_by_category_deletion":
      return [
        [text("状态", "Status"), statusName(event.details.status, text)],
        [
          text("来源分类", "Source category"),
          categoryName(event.details.source.categorySnapshot, text),
        ],
        [
          text("来源位置", "Source position"),
          taskPosition(event.details.source.position, text),
        ],
        [text("目标分类", "Target category"), text("收件箱", "Inbox")],
        [
          text("目标位置", "Target position"),
          taskPosition(event.details.targetPosition, text),
        ],
      ];
    case "task.trashed":
    case "task.restored":
      return [
        category(event.details.categorySnapshot),
        [text("状态", "Status"), statusName(event.details.status, text)],
        [text("位置", "Position"), taskPosition(event.details.position, text)],
      ];
    case "category.created":
      return [];
    case "category.renamed":
      return [
        [text("原名称", "Previous name"), event.details.beforeName],
        [text("新名称", "New name"), event.subject.name],
      ];
    case "category.reordered":
      return [
        [
          text("移动前位置", "Position before move"),
          categoryPosition(event.details.beforePosition, text),
        ],
        [
          text("移动后位置", "Position after move"),
          categoryPosition(event.details.afterPosition, text),
        ],
      ];
    case "category.deleted":
      return [
        [text("迁移任务数", "Tasks moved"), String(event.details.affectedTaskCount)],
      ];
  }
}

function subjectName(event: HistoryEvent): string {
  return event.subjectType === "task" ? event.subject.title : event.subject.name;
}

function matchesCategory(event: HistoryEvent, categoryId: string): boolean {
  if (event.subjectType === "category") return event.subject.categoryId === categoryId;
  switch (event.eventType) {
    case "task.category_changed":
      return categoryIdentity(event.details.target.categorySnapshot) === categoryId;
    case "task.moved_to_inbox_by_category_deletion":
      return categoryId === "inbox";
    case "task.created":
    case "task.content_changed":
    case "task.completed":
    case "task.reopened":
    case "task.priority_changed":
    case "task.reordered":
    case "task.trashed":
    case "task.restored":
      return categoryIdentity(event.details.categorySnapshot) === categoryId;
  }
}

function collectCategorySnapshots(
  value: unknown,
  result: Map<string, Set<string>>,
): void {
  if (Array.isArray(value)) {
    for (const item of value) collectCategorySnapshots(item, result);
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (
    record.ref &&
    typeof record.ref === "object" &&
    (record.ref as Record<string, unknown>).kind === "custom" &&
    typeof (record.ref as Record<string, unknown>).categoryId === "string" &&
    typeof record.name === "string"
  ) {
    const categoryId = (record.ref as Record<string, string>).categoryId;
    const names = result.get(categoryId) ?? new Set<string>();
    names.add(record.name);
    result.set(categoryId, names);
  }
  for (const nested of Object.values(record)) collectCategorySnapshots(nested, result);
}

function compareHistory(left: HistoryEvent, right: HistoryEvent): number {
  const occurredAt = Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
  if (occurredAt !== 0) return occurredAt;
  const sequence = BigInt(right.operationSequence) - BigInt(left.operationSequence);
  if (sequence !== 0n) return sequence > 0n ? 1 : -1;
  return left.eventOrder - right.eventOrder;
}

function localDayKey(value: string): string {
  const date = new Date(value);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

interface FilterOption {
  id: string;
  label: string;
  searchText: string;
}

export function HistoryPage() {
  const { state } = useWorkspace();
  const { locale, text } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTaskId = useRef(searchParams.get("task")).current;
  const initialCategoryId = useRef(searchParams.get("category")).current;
  const [filters, setFilters] = useState<HistoryFilters>(() => {
    if (initialTaskId) {
      sessionFilters = { taskId: initialTaskId, categoryId: null, actions: [] };
    } else if (initialCategoryId) {
      sessionFilters = { taskId: null, categoryId: initialCategoryId, actions: [] };
    }
    return { ...sessionFilters, actions: [...sessionFilters.actions] };
  });
  const [panelOpen, setPanelOpen] = useState(false);
  const [taskSearch, setTaskSearch] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const filterRef = useRef<HTMLDivElement>(null);
  const workspace = state.workspace;

  useEffect(() => {
    if (initialTaskId || initialCategoryId) setSearchParams({}, { replace: true });
  }, [initialCategoryId, initialTaskId, setSearchParams]);

  useEffect(() => {
    if (!panelOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!filterRef.current?.contains(event.target as Node)) setPanelOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPanelOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [panelOpen]);

  const updateFilters = (
    update: HistoryFilters | ((current: HistoryFilters) => HistoryFilters),
  ) => {
    setFilters((current) => {
      const next = typeof update === "function" ? update(current) : update;
      sessionFilters = { ...next, actions: [...next.actions] };
      return sessionFilters;
    });
  };

  const { categoryOptions, taskOptions } = useMemo(() => {
    const taskNames = new Map<string, Set<string>>();
    const taskLabels = new Map<string, string>();
    const categoryNames = new Map<string, Set<string>>();
    const categoryLabels = new Map<string, string>();
    if (!workspace) return { categoryOptions: [], taskOptions: [] };

    for (const task of workspace.tasks) {
      taskNames.set(task.id, new Set([task.title]));
      taskLabels.set(task.id, task.title);
    }
    categoryNames.set("inbox", new Set([text("收件箱", "Inbox"), "Inbox", "收件箱"]));
    categoryLabels.set("inbox", text("收件箱", "Inbox"));
    for (const category of workspace.categories) {
      categoryNames.set(category.id, new Set([category.name]));
      categoryLabels.set(category.id, category.name);
    }

    for (const event of [...workspace.history].sort(compareHistory)) {
      if (event.subjectType === "task") {
        const names = taskNames.get(event.subject.taskId) ?? new Set<string>();
        names.add(event.subject.title);
        if (
          event.eventType === "task.content_changed" &&
          "beforeTitle" in event.details
        ) {
          names.add(event.details.beforeTitle);
        }
        taskNames.set(event.subject.taskId, names);
        if (!taskLabels.has(event.subject.taskId)) {
          taskLabels.set(event.subject.taskId, event.subject.title);
        }
      } else {
        const names = categoryNames.get(event.subject.categoryId) ?? new Set<string>();
        names.add(event.subject.name);
        if (event.eventType === "category.renamed") {
          names.add(event.details.beforeName);
        }
        categoryNames.set(event.subject.categoryId, names);
        if (!categoryLabels.has(event.subject.categoryId)) {
          categoryLabels.set(event.subject.categoryId, event.subject.name);
        }
      }
      collectCategorySnapshots(event.details, categoryNames);
    }

    const makeOptions = (
      names: Map<string, Set<string>>,
      labels: Map<string, string>,
    ): FilterOption[] =>
      [...names].map(([id, aliases]) => ({
        id,
        label: labels.get(id) ?? [...aliases][0] ?? id,
        searchText: [...aliases].join(" ").toLocaleLowerCase(),
      }));

    return {
      taskOptions: makeOptions(taskNames, taskLabels),
      categoryOptions: makeOptions(categoryNames, categoryLabels),
    };
  }, [text, workspace]);

  const events = useMemo(() => {
    if (!workspace) return [];
    return [...workspace.history]
      .filter((event) => {
        if (
          filters.taskId &&
          (event.subjectType !== "task" || event.subject.taskId !== filters.taskId)
        ) {
          return false;
        }
        if (filters.categoryId && !matchesCategory(event, filters.categoryId)) {
          return false;
        }
        return (
          filters.actions.length === 0 || filters.actions.includes(actionGroup(event))
        );
      })
      .sort(compareHistory);
  }, [filters, workspace]);

  const groupedEvents = useMemo(() => {
    const groups: Array<{ day: string; events: HistoryEvent[] }> = [];
    for (const event of events) {
      const day = localDayKey(event.occurredAt);
      const group = groups.at(-1);
      if (group?.day === day) group.events.push(event);
      else groups.push({ day, events: [event] });
    }
    return groups;
  }, [events]);

  const selectedTask = taskOptions.find((option) => option.id === filters.taskId);
  const selectedCategory = categoryOptions.find(
    (option) => option.id === filters.categoryId,
  );
  const activeFilterCount =
    Number(Boolean(filters.taskId)) +
    Number(Boolean(filters.categoryId)) +
    filters.actions.length;
  const normalizedTaskSearch = taskSearch.trim().toLocaleLowerCase();
  const normalizedCategorySearch = categorySearch.trim().toLocaleLowerCase();
  const visibleTasks = taskOptions.filter(
    (option) => !normalizedTaskSearch || option.searchText.includes(normalizedTaskSearch),
  );
  const visibleCategories = categoryOptions.filter(
    (option) =>
      !normalizedCategorySearch || option.searchText.includes(normalizedCategorySearch),
  );

  if (!workspace) return null;
  return (
    <main className="content-page history-page">
      <header className="mobile-brand">Desktop Pull</header>
      <div className="page-heading">
        <div>
          <span className="section-kicker">{text("记录", "Records")}</span>
          <h1>{text("历史", "History")}</h1>
        </div>
        <span className="task-count">{events.length}</span>
      </div>

      <div className="history-filter-shell" ref={filterRef}>
        <button
          type="button"
          className="history-filter-trigger"
          aria-expanded={panelOpen}
          aria-controls="history-filter-panel"
          onClick={() => setPanelOpen((open) => !open)}
        >
          <Filter size={16} aria-hidden="true" />
          {text("筛选", "Filter")}
          {activeFilterCount > 0 ? <span>{activeFilterCount}</span> : null}
        </button>

        {panelOpen ? (
          <div
            id="history-filter-panel"
            className="history-filter-panel"
            role="dialog"
            aria-label={text("筛选历史", "Filter history")}
          >
            <div className="history-filter-panel-heading">
              <strong>{text("筛选历史", "Filter history")}</strong>
              <button
                type="button"
                className="icon-button"
                aria-label={text("关闭筛选", "Close filters")}
                onClick={() => setPanelOpen(false)}
              >
                <X size={17} aria-hidden="true" />
              </button>
            </div>

            <fieldset className="history-filter-section">
              <legend>{text("任务", "Task")}</legend>
              <label className="history-filter-search">
                <Search size={15} aria-hidden="true" />
                <input
                  aria-label={text("搜索任务", "Search tasks")}
                  value={taskSearch}
                  onChange={(event) => setTaskSearch(event.currentTarget.value)}
                />
              </label>
              <div className="history-filter-options">
                {visibleTasks.map((option) => (
                  <button
                    type="button"
                    className={filters.taskId === option.id ? "selected" : undefined}
                    aria-pressed={filters.taskId === option.id}
                    key={option.id}
                    onClick={() =>
                      updateFilters((current) => ({
                        ...current,
                        taskId: current.taskId === option.id ? null : option.id,
                      }))
                    }
                  >
                    {option.label}
                  </button>
                ))}
                {visibleTasks.length === 0 ? (
                  <span>{text("没有匹配任务", "No matching tasks")}</span>
                ) : null}
              </div>
            </fieldset>

            <fieldset className="history-filter-section">
              <legend>{text("分类", "Category")}</legend>
              <label className="history-filter-search">
                <Search size={15} aria-hidden="true" />
                <input
                  aria-label={text("搜索分类", "Search categories")}
                  value={categorySearch}
                  onChange={(event) => setCategorySearch(event.currentTarget.value)}
                />
              </label>
              <div className="history-filter-options">
                {visibleCategories.map((option) => (
                  <button
                    type="button"
                    className={filters.categoryId === option.id ? "selected" : undefined}
                    aria-pressed={filters.categoryId === option.id}
                    key={option.id}
                    onClick={() =>
                      updateFilters((current) => ({
                        ...current,
                        categoryId: current.categoryId === option.id ? null : option.id,
                      }))
                    }
                  >
                    {option.label}
                  </button>
                ))}
                {visibleCategories.length === 0 ? (
                  <span>{text("没有匹配分类", "No matching categories")}</span>
                ) : null}
              </div>
            </fieldset>

            <fieldset className="history-filter-section history-action-options">
              <legend>{text("动作", "Actions")}</legend>
              {actionGroups.map((group) => (
                <label key={group}>
                  <input
                    type="checkbox"
                    checked={filters.actions.includes(group)}
                    onChange={() =>
                      updateFilters((current) => ({
                        ...current,
                        actions: current.actions.includes(group)
                          ? current.actions.filter((value) => value !== group)
                          : [...current.actions, group],
                      }))
                    }
                  />
                  <span>{actionGroupLabel(group, text)}</span>
                </label>
              ))}
            </fieldset>
          </div>
        ) : null}
      </div>

      {activeFilterCount > 0 ? (
        <fieldset
          className="history-filter-chips"
          aria-label={text("筛选条件", "Filters")}
        >
          {selectedTask ? (
            <button
              type="button"
              onClick={() => updateFilters((current) => ({ ...current, taskId: null }))}
            >
              {text("任务", "Task")}: {selectedTask.label}
              <X size={13} aria-hidden="true" />
            </button>
          ) : null}
          {selectedCategory ? (
            <button
              type="button"
              onClick={() =>
                updateFilters((current) => ({ ...current, categoryId: null }))
              }
            >
              {text("分类", "Category")}: {selectedCategory.label}
              <X size={13} aria-hidden="true" />
            </button>
          ) : null}
          {filters.actions.map((group) => (
            <button
              type="button"
              key={group}
              onClick={() =>
                updateFilters((current) => ({
                  ...current,
                  actions: current.actions.filter((value) => value !== group),
                }))
              }
            >
              {actionGroupLabel(group, text)}
              <X size={13} aria-hidden="true" />
            </button>
          ))}
          <button
            type="button"
            className="history-filter-clear"
            onClick={() => updateFilters(emptyFilters)}
          >
            {text("清除全部", "Clear all")}
          </button>
        </fieldset>
      ) : null}

      {events.length === 0 ? (
        <div className="page-empty">{text("没有匹配的历史", "No matching history")}</div>
      ) : (
        groupedEvents.map((group) => (
          <section className="history-day" key={group.day}>
            <h2>
              <time dateTime={group.day}>
                {new Intl.DateTimeFormat(locale, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  weekday: "short",
                }).format(new Date(`${group.day}T00:00:00`))}
              </time>
            </h2>
            <ol className="history-list">
              {group.events.map((event) => {
                const facts = eventFacts(event, text);
                return (
                  <li key={`${event.operationSequence}:${event.eventOrder}`}>
                    <span className={`history-mark history-${actionGroup(event)}`} />
                    <div className="history-copy">
                      <strong>{subjectName(event)}</strong>
                      <span>{eventSummary(event, text)}</span>
                      {facts.length > 0 ? (
                        <details className="history-details">
                          <summary>{text("查看详情", "View details")}</summary>
                          <dl>
                            {facts.map(([label, value]) => (
                              <div className="history-fact" key={`${label}:${value}`}>
                                <dt>{label}</dt>
                                <dd>{value || text("空", "Empty")}</dd>
                              </div>
                            ))}
                          </dl>
                        </details>
                      ) : null}
                    </div>
                    <time dateTime={event.occurredAt}>
                      {new Intl.DateTimeFormat(locale, {
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(event.occurredAt))}
                    </time>
                  </li>
                );
              })}
            </ol>
          </section>
        ))
      )}
    </main>
  );
}
