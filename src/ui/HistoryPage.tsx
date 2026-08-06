import { Filter, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useI18n } from "../application/i18n";
import { useWorkspace } from "../application/workspace-controller";
import type { CategorySnapshot, HistoryEvent, TaskPosition } from "../domain/schemas";

type ActionGroup =
  | "all"
  | "create"
  | "content"
  | "status"
  | "priority"
  | "move"
  | "lifecycle"
  | "category";
type Text = (chinese: string, english: string) => string;

const actionGroups: ActionGroup[] = [
  "all",
  "create",
  "content",
  "status",
  "priority",
  "move",
  "lifecycle",
  "category",
];

function actionGroupLabel(group: ActionGroup, text: Text): string {
  const labels: Record<ActionGroup, [string, string]> = {
    all: ["全部动作", "All actions"],
    create: ["创建", "Created"],
    content: ["内容", "Content"],
    status: ["完成状态", "Completion"],
    priority: ["优先级", "Priority"],
    move: ["移动与排序", "Moves and order"],
    lifecycle: ["删除与恢复", "Trash and restore"],
    category: ["分类管理", "Category management"],
  };
  return text(...labels[group]);
}

function actionGroup(event: HistoryEvent): Exclude<ActionGroup, "all"> {
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
  if (event.eventType === "task.trashed" || event.eventType === "task.restored") {
    return "lifecycle";
  }
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
    case "task.reordered":
      return text(
        `调整了${categoryName(event.details.categorySnapshot, text)}内的顺序`,
        `Reordered within ${categoryName(event.details.categorySnapshot, text)}`,
      );
    case "task.category_changed":
      return text(
        `从${categoryName(event.details.source.categorySnapshot, text)}移到${categoryName(event.details.target.categorySnapshot, text)}`,
        `Moved from ${categoryName(event.details.source.categorySnapshot, text)} to ${categoryName(event.details.target.categorySnapshot, text)}`,
      );
    case "task.moved_to_inbox_by_category_deletion":
      return text(
        `因删除${categoryName(event.details.source.categorySnapshot, text)}移到收件箱`,
        `Moved to Inbox when ${categoryName(event.details.source.categorySnapshot, text)} was deleted`,
      );
    case "task.trashed":
      return text(
        `从${categoryName(event.details.categorySnapshot, text)}移入垃圾箱`,
        `Moved from ${categoryName(event.details.categorySnapshot, text)} to Trash`,
      );
    case "task.restored":
      return text(
        `恢复到${categoryName(event.details.categorySnapshot, text)}`,
        `Restored to ${categoryName(event.details.categorySnapshot, text)}`,
      );
    case "category.created":
      return text("创建分类", "Created category");
    case "category.renamed":
      return text(
        `从「${event.details.beforeName}」重命名`,
        `Renamed from “${event.details.beforeName}”`,
      );
    case "category.reordered":
      return text("调整分类顺序", "Reordered category");
    case "category.deleted":
      return text(
        `删除分类，移动 ${event.details.affectedTaskCount} 个任务到收件箱`,
        `Deleted category and moved ${event.details.affectedTaskCount} tasks to Inbox`,
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

function collectCategorySnapshots(value: unknown, result: Map<string, string>): void {
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
    if (!result.has(categoryId)) result.set(categoryId, record.name);
  }
  for (const nested of Object.values(record)) collectCategorySnapshots(nested, result);
}

export function HistoryPage() {
  const { state } = useWorkspace();
  const { locale, text } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<ActionGroup>("all");
  const taskSubject = searchParams.get("task");
  const categorySubject = searchParams.get("category");
  const subject = taskSubject
    ? `task:${taskSubject}`
    : categorySubject
      ? `category:${categorySubject}`
      : "all";
  const workspace = state.workspace;

  const categories = useMemo(() => {
    const result = new Map<string, string>();
    if (!workspace) return result;
    result.set("inbox", text("收件箱", "Inbox"));
    for (const category of workspace.categories) result.set(category.id, category.name);
    const newestEvents = [...workspace.history].sort((left, right) => {
      const sequence = BigInt(right.operationSequence) - BigInt(left.operationSequence);
      return sequence === 0n
        ? right.eventOrder - left.eventOrder
        : sequence > 0n
          ? 1
          : -1;
    });
    for (const event of newestEvents) {
      if (event.subjectType === "category" && !result.has(event.subject.categoryId)) {
        result.set(event.subject.categoryId, event.subject.name);
      }
      collectCategorySnapshots(event.details, result);
    }
    return result;
  }, [text, workspace]);

  const events = useMemo(() => {
    if (!workspace) return [];
    return [...workspace.history]
      .filter((event) => {
        if (
          taskSubject &&
          (event.subjectType !== "task" || event.subject.taskId !== taskSubject)
        ) {
          return false;
        }
        if (categorySubject && !matchesCategory(event, categorySubject)) return false;
        if (group !== "all" && actionGroup(event) !== group) return false;
        const search = query.trim().toLocaleLowerCase();
        if (!search) return true;
        const facts = eventFacts(event, text).flat().join(" ");
        return `${subjectName(event)} ${eventSummary(event, text)} ${facts}`
          .toLocaleLowerCase()
          .includes(search);
      })
      .sort((left, right) => {
        const sequence = BigInt(right.operationSequence) - BigInt(left.operationSequence);
        return sequence === 0n
          ? right.eventOrder - left.eventOrder
          : sequence > 0n
            ? 1
            : -1;
      });
  }, [categorySubject, group, query, taskSubject, text, workspace]);

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

      <div className="history-filters">
        <label className="search-field">
          <Search size={17} aria-hidden="true" />
          <input
            aria-label={text("搜索历史", "Search history")}
            placeholder={text("搜索任务或分类", "Search tasks or categories")}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
        <label className="filter-field">
          <Filter size={16} aria-hidden="true" />
          <select
            aria-label={text("筛选主体", "Filter subject")}
            value={subject}
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (value === "all") setSearchParams({});
              else if (value.startsWith("task:")) {
                setSearchParams({ task: value.slice(5) });
              } else setSearchParams({ category: value.slice(9) });
            }}
          >
            <option value="all">
              {text("全部任务与分类", "All tasks and categories")}
            </option>
            <optgroup label={text("任务", "Tasks")}>
              {workspace.tasks.map((task) => (
                <option key={task.id} value={`task:${task.id}`}>
                  {task.title}
                </option>
              ))}
            </optgroup>
            <optgroup label={text("分类", "Categories")}>
              {[...categories].map(([id, name]) => (
                <option key={id} value={`category:${id}`}>
                  {name}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <select
          aria-label={text("筛选动作", "Filter action")}
          value={group}
          onChange={(event) => setGroup(event.currentTarget.value as ActionGroup)}
        >
          {actionGroups.map((value) => (
            <option key={value} value={value}>
              {actionGroupLabel(value, text)}
            </option>
          ))}
        </select>
      </div>

      {events.length === 0 ? (
        <div className="page-empty">{text("没有匹配的历史", "No matching history")}</div>
      ) : (
        <ol className="history-list">
          {events.map((event) => {
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
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(event.occurredAt))}
                </time>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
