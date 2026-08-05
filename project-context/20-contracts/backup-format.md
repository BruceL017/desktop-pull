# 完整备份文件格式契约

## 强制规则

### FORMAT-001 · 单个 UTF-8 JSON 文件

每份完整备份必须是一个未压缩的 UTF-8 JSON 文件。第一版不得使用 ZIP、多个文件、目录结构或外部资源引用承载备份。

### FORMAT-002 · 根对象

备份根值必须是 JSON object,并至少包含以下字段:

| 字段 | 类型 | 约束 |
|---|---|---|
| `format` | string | 固定为 `desktop-pull-backup` |
| `formatVersion` | positive integer | Desktop Pull 备份文件格式版本 |
| `schemaVersion` | positive integer | 导出时核心数据库 schema 版本 |
| `appVersion` | non-empty string | 生成备份的 Desktop Pull 应用版本 |
| `exportedAt` | string | FORMAT-011 定义的 UTC 固定毫秒精度导出时间 |
| `data` | object | `backup-export.md` 定义的完整数据载荷 |

### FORMAT-003 · 数据自包含

`data` 必须自包含恢复全部核心数据所需的记录和关联。导入不得依赖原设备、原数据库、网络请求或备份文件之外的其他文件补全内容。

### FORMAT-004 · 版本先于数据解释

导入程序必须先验证 `format`、`formatVersion` 和 `schemaVersion`,再解释或写入 `data`。旧版本迁移和更高版本拒绝行为必须遵守 `backup-compatibility.md`。

### FORMAT-005 · 草稿保持草稿语义

`data` 必须包含导出逻辑状态中当前代次的非空快速创建草稿集合。每条草稿必须精确符合 FORMAT-015,由入口唯一推导目标分类,且不得伪装为任务记录或历史事件。已被待保存任务提交消费的旧代次不得出现。目标分类引用不存在、入口类型无法识别或同一语义入口出现多条记录时,备份必须在写入前校验失败。

### FORMAT-006 · 历史主体使用可判别结构

`data` 中每条历史事件必须按 FORMAT-016 显式判别任务主体或分类主体。任务主体事件必须在严格 `subject` 分支中包含任务不可变标识和事件发生时用户原文标题;分类主体事件必须在另一严格分支中包含分类不可变标识和事件发生时用户原文名称,且不得包含伪造的任务标识或标题。两种事件都必须按 FORMAT-018 在 `details` 中只保留对应事件呈现、筛选和校验必需的事件专属精确事实。`task.created` 的标题只由发生时 `subject.title` 表达,FORMAT-022 只另存初始分类与创建后位置;`task.content_changed` 的标题新值由 FORMAT-019 的保存后 `subject.title` 表达,不得为了泛化“新旧值”在详情中复制;其发生时分类由同一详情中的 `categorySnapshot` 表达。`task.completed` 与 `task.reopened` 的方向由各自 `eventType` 完整表达,FORMAT-020 只另存发生时分类快照而不重复状态值。`task.priority_changed` 按 FORMAT-023 只另存发生时分类及不同的旧、新优先级,不得保存位置或界面来源。`task.reordered` 按 FORMAT-024 只另存同一发生时分类、同一完成状态及移动前后相对位置,不得保存拖拽来源、绝对序号或内部排序键。`task.category_changed` 按 FORMAT-025 只另存一份不变状态及来源、目标各自的发生时分类和直接位置,不得保存界面入口或当前顺序副本。`task.moved_to_inbox_by_category_deletion` 按 FORMAT-026 只另存一份不变状态、被删来源分类及整批移除前位置,以及整批完成后的收件箱位置;目标收件箱由事件类型唯一表达。`task.trashed` 按 FORMAT-027 只另存删除时分类、未改变的完成状态及移出活动顺序前的同状态位置;删除时间、主体标题、任务内容、优先级与恢复锚点继续由各自既有字段唯一表达。`task.restored` 按 FORMAT-028 只另存恢复完成后的实际分类、未改变状态及插入后同状态位置;来源垃圾箱、删除现场和锚点算法不得重复保存。`category.created` 的 ID 与创建时名称只由分类 `subject` 表达,FORMAT-029 `details` 精确为空对象,不得重复分类身份、位置或创建入口。`category.renamed` 的同一公共主体保存改名后的名称,FORMAT-030 `details` 只保存改名前的 `{ beforeName }`,不得再复制新名称或分类身份。`category.reordered` 的同一公共主体保存被移动分类,FORMAT-031 `details` 只保存移动前后方向严格的直接自定义分类邻居或序列边界,不得复制主体、收件箱、绝对位置或排序实现值。固定收件箱引用只保存稳定系统身份,不得保存本地化名称快照。

`category.deleted` 的同一公共主体保存被删分类,FORMAT-032 `details` 只保存删除操作接受时实际从该分类活动顺序迁入收件箱的 `{ affectedTaskCount }`;不得复制分类身份、任务集合、任务内容、位置、固定目标或确认界面事实。

分类删除事件只能用 FORMAT-032 的发生时 `affectedTaskCount` 表达汇总,不得用任务标识或标题数组替代各任务自己的移动事件。公共外壳由 FORMAT-016 锁定,精确 `eventType` 闭集由 FORMAT-017 锁定,`details` 的事件专属最小结构原则由 FORMAT-018 锁定,`task.content_changed` 的精确详情分支由 FORMAT-019 锁定,`task.completed` 与 `task.reopened` 的精确详情由 FORMAT-020 锁定,历史位置中的前后任务邻居联合由 FORMAT-021 锁定,`task.created` 的精确详情由 FORMAT-022 锁定,`task.priority_changed` 的精确详情由 FORMAT-023 锁定,`task.reordered` 的精确详情由 FORMAT-024 锁定,`task.category_changed` 的精确详情由 FORMAT-025 锁定,`task.moved_to_inbox_by_category_deletion` 的精确详情由 FORMAT-026 锁定,`task.trashed` 的精确详情由 FORMAT-027 锁定,`task.restored` 的精确详情由 FORMAT-028 锁定,`category.created` 的精确空详情由 FORMAT-029 锁定,`category.renamed` 的精确详情由 FORMAT-030 锁定,`category.reordered` 的精确详情由 FORMAT-031 锁定,`category.deleted` 的精确详情由 FORMAT-032 锁定;14 个事件类型的专属 `details` 与相关 fixtures 已全部锁定。

### FORMAT-007 · 历史稳定顺序可完整往返

`data` 中每条历史事件必须承载 `history-retention.md` 定义的 `occurredAt`、`operationSequence` 和 `eventOrder` 语义。同一操作的事件必须共享操作时间与操作顺序,并具有互不重复的操作内顺序;不同正式操作不得共享 `operationSequence`。`operationSequence` 必须编码为表示正整数的十进制字符串,不得依赖 JSON number 的安全整数范围。`eventOrder` 必须是从 `0` 开始分配的 JSON 非负安全整数,并在同一 `operationSequence` 内唯一;永久清理可以留下缺口,但不得重编号。`(operationSequence, eventOrder)` 是事件唯一且稳定的逻辑键,不得另设事件 ID 或事件 UUID。这些值必须足以让导入后时间线得到与导出前相同的稳定全序,不得依赖 JSON 数组顺序、数据库自然迭代顺序或导入时间补全。

`data.meta.nextOperationSequence` 必须是表示正整数的十进制字符串。全新数据的初始值为 `"1"`;该值必须严格大于备份中全部保留历史事件的 `operationSequence`,表示导入后下一次正式操作应当消耗的顺序号。永久清理造成的历史空洞不得让该值回退。`meta` 不再有其他开放字段;`history` 的公共外壳、精确事件类型与事件专属最小详情原则分别由 FORMAT-016、FORMAT-017、FORMAT-018 锁定,`task.content_changed` 的精确详情由 FORMAT-019 锁定,`task.completed` 与 `task.reopened` 的精确详情由 FORMAT-020 锁定,历史任务邻居联合由 FORMAT-021 锁定,`task.created` 的精确详情由 FORMAT-022 锁定,`task.priority_changed` 的精确详情由 FORMAT-023 锁定,`task.reordered` 的精确详情由 FORMAT-024 锁定,`task.category_changed` 的精确详情由 FORMAT-025 锁定,`task.moved_to_inbox_by_category_deletion` 的精确详情由 FORMAT-026 锁定,`task.trashed` 的精确详情由 FORMAT-027 锁定,`task.restored` 的精确详情由 FORMAT-028 锁定,`category.created` 的精确空详情由 FORMAT-029 锁定,`category.renamed` 的精确详情由 FORMAT-030 锁定,`category.reordered` 的精确详情由 FORMAT-031 锁定,`category.deleted` 的精确详情由 FORMAT-032 锁定;14 个事件类型已无开放详情分支。

### FORMAT-008 · 不携带跨导入永久删除墓碑

备份 `data` 和 envelope 不得包含已永久清理任务的墓碑、删除黑名单、内容指纹或其他用于阻止删除前备份恢复的隐藏标记。永久清理通过从当前逻辑数据和之后新备份中移除目标、并把保留记录中的目标结构化引用替换为 FORMAT-013 的通用不可用值兑现,不得把其身份转换成另一种长期记录。`UnavailableTaskRef` 不含任务身份、指纹或映射且不能查询目标,因此不构成任务特定墓碑。

`nextOperationSequence` 只保存不关联任何主体、内容、时间或指纹的全局顺序进度,不得附带被清理操作或主体的映射,也不得用于阻止删除前备份恢复;它不构成永久删除墓碑。

### FORMAT-009 · 系统事实与界面语言解耦

备份中的固定系统分类、任务状态、`P0` 至 `P5` 任务优先级、精确事件类型、位置边界和 FORMAT-013 的 `UnavailableTaskRef` 必须使用稳定、语言无关的语义码;动作组必须由精确事件类型的稳定映射得到,不得保存本地化动作组文案。不得把简体中文或英文界面文案作为这些系统事实的持久值,也不得要求导入程序知道导出时界面语言才能解释数据。

任务标题、备注、自定义分类名称及其历史快照必须保留用户原文,不得在导出、导入或界面语言切换时翻译或生成替代版本。同一备份在任一受支持界面语言下必须恢复相同业务事实。

### FORMAT-010 · v1 `data` 顶层逻辑结构

v1 的 `data` 必须且只能包含以下七个直接字段;即使对应集合没有记录也不得省略。出现未知直接字段时,导入必须在任何写入前拒绝整个备份。

| 字段 | 类型 | 逻辑职责 |
|---|---|---|
| `meta` | object | 只承载 FORMAT-007 已锁定的 `nextOperationSequence` |
| `categories` | array | 自定义分类记录;不得伪造固定收件箱记录 |
| `tasks` | array | 以生命周期判别的活动任务或垃圾箱任务记录 |
| `categoryOrder` | array | 全部自定义分类不可变标识的权威顺序 |
| `taskOrderByCategory` | array | 按分类划分的全部活动任务不可变标识及其权威单一总顺序 |
| `drafts` | array | 当前代次的全部非空快速创建草稿 |
| `history` | array | 以主体和精确事件类型判别的全部保留历史事件 |

固定收件箱是内建系统身份,不进入 `categories` 或 `categoryOrder`,并在呈现时始终位于全部自定义分类之前。`categoryOrder` 必须包含每个且仅包含现存自定义分类标识一次。`taskOrderByCategory` 必须使每个活动任务恰好出现一次,同时表达其当前唯一分类和分类内持久手动顺序;它是活动任务归属与顺序的单一事实来源。任务完成状态只从这套总顺序投影视图,不得建立未完成与已完成两套持久顺序。

垃圾箱任务不得出现在 `taskOrderByCategory`;其当前垃圾箱展示与恢复所读取的删除时分类、恢复定位只保存在任务自身的垃圾箱生命周期数据中,当前可恢复任务的完成状态继续由任务公共 `status` 字段表达且生命周期不得建立副本。FORMAT-027 另以同值分类、状态和带标题位置冻结不可变删除审计事实,但不是当前归属、垃圾箱状态或恢复定位来源。`categories`、`tasks`、`drafts` 和 `history` 的记录数组排列本身不表达产品顺序;分类顺序、活动任务顺序和历史稳定全序只能分别由 `categoryOrder`、`taskOrderByCategory` 和 FORMAT-007 的历史排序字段表达。

该结构是独立于存储实现的可移植逻辑 schema。备份不得暴露或要求未来导入方理解 `IndexedDB` object store 名称、索引、内部 rank/sort key、数据库代次、窗口锁、缓存或迁移工件。`meta`、`categories`、`tasks`、`categoryOrder`、`taskOrderByCategory`、`drafts`、`history` 公共外壳、精确事件类型与详情最小结构原则已经锁定,`task.content_changed` 的精确详情由 FORMAT-019 锁定,`task.completed` 与 `task.reopened` 的精确详情由 FORMAT-020 锁定,历史任务邻居联合由 FORMAT-021 锁定,`task.created` 的精确详情由 FORMAT-022 锁定,`task.priority_changed` 的精确详情由 FORMAT-023 锁定,`task.reordered` 的精确详情由 FORMAT-024 锁定,`task.category_changed` 的精确详情由 FORMAT-025 锁定,`task.moved_to_inbox_by_category_deletion` 的精确详情由 FORMAT-026 锁定,`task.trashed` 的精确详情由 FORMAT-027 锁定,`task.restored` 的精确详情由 FORMAT-028 锁定,`category.created` 的精确空详情由 FORMAT-029 锁定,`category.renamed` 的精确详情由 FORMAT-030 锁定,`category.reordered` 的精确详情由 FORMAT-031 锁定,`category.deleted` 的精确详情由 FORMAT-032 锁定;`history` 的 14 个事件分支与 fixtures 已全部闭合。

### FORMAT-011 · v1 通用标识、分类引用与时间表示

v1 中的任务不可变标识和自定义分类不可变标识必须是规范小写 UUID v4 字符串,匹配 `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`。标识只表达不透明身份;不得从字符值或字典序推导记录类型、创建时间、分类或产品顺序。任务标识和分类标识分别在各自主体类型内保持唯一且跨导出、导入不变。

当前分类引用 `CategoryRef` 必须且只能是以下两个判别对象之一:

```json
{ "kind": "inbox" }
```

```json
{
  "kind": "custom",
  "categoryId": "018f47a2-3d81-4f5d-8a9c-123456789abc"
}
```

`kind: "inbox"` 不得携带 `categoryId`、本地化名称或其他字段;`kind: "custom"` 必须只额外携带一个有效自定义分类 UUID。不得用字符串、`null`、空值、特殊 UUID、“收件箱”或 `Inbox` 代替 `CategoryRef`。当前状态中的 custom 引用必须解析到 `categories` 中恰好一个现存记录。历史事件和垃圾箱删除上下文所需的发生时名称及允许悬空的分类身份属于 FORMAT-012 的独立 `CategorySnapshot`,不得通过放宽 `CategoryRef` 混入。

备份 envelope 与 `data` 中所有时间字段必须是有效 UTC 日期时间字符串,固定为 `YYYY-MM-DDTHH:mm:ss.sssZ`,例如 `2026-07-30T08:15:42.123Z`。不得接受本地时间、时区偏移、缺失时区、可变小数精度、Unix 数字时间戳或其他等价拼写。导出与导入必须原样保留已经冻结的业务时间字符串;解析、比较或迁移不得用设备时区重写该值。

`operationSequence` 与 `nextOperationSequence` 继续使用 FORMAT-007 的正整数十进制字符串,不属于 UUID 或时间字段。草稿代次由 FORMAT-015 独立选择与业务标识相同的规范小写 UUID v4 文法,但不因此成为任务、分类或产品顺序身份。FORMAT-016 不建立事件 ID 或其他事件身份字段;FORMAT-018 的事件专属 `details` 不得暗中复制第二套事件身份。

### FORMAT-012 · v1 分类、分类顺序、任务分组与分类快照

`categories` 中每条自定义分类记录必须且只能包含 `id` 与 `name`。`id` 使用 FORMAT-011 的自定义分类 UUID;`name` 是按 `task-categories.md` CATEGORY-011 已完成去首尾空白、非空、唯一及双语系统保留名校验后的当前用户原文。分类记录不得保存顺序、任务数量、系统分类标志、创建或修改时间。`categories` 数组排列不表达分类顺序。

`categoryOrder` 必须是 UUID 字符串数组,每个元素解析到 `categories` 中恰好一条记录,并且每个现存自定义分类 ID 恰好出现一次。固定收件箱不得出现,不得依赖 `categories` 的数组排列或 UUID 字典序补全、去重或重排。

`taskOrderByCategory` 中每项必须且只能具有以下结构:

```json
{
  "categoryRef": { "kind": "inbox" },
  "taskIds": []
}
```

`categoryRef` 使用 FORMAT-011 的当前分类引用;`taskIds` 是该分类全部活动任务 UUID 的权威单一总顺序。固定收件箱和 `categories` 中每个现存自定义分类必须各有且只有一项,即使对应 `taskIds` 为空也不得省略。每个活动任务必须在全部 `taskIds` 中恰好出现一次并解析到 `tasks` 中的活动任务;垃圾箱任务、未知任务和重复任务不得出现。`taskOrderByCategory` 各分组项自身的数组排列不表达分类显示顺序,但每项内部 `taskIds` 的排列是该分类的产品顺序。

发生时或删除时的分类语义 `CategorySnapshot` 必须且只能是以下两个结构之一:

```json
{
  "ref": { "kind": "inbox" }
}
```

```json
{
  "ref": {
    "kind": "custom",
    "categoryId": "018f47a2-3d81-4f5d-8a9c-123456789abc"
  },
  "name": "工作"
}
```

Inbox 快照不得携带 `name` 或任何本地化显示值。Custom 快照必须保存事件或删除发生时的分类用户原文名称;其 UUID 可以指向当前分类、已改名分类或已经删除的分类,不得因无法解析当前 `categories` 而拒绝,也不得要求 `name` 等于当前名称。`CategorySnapshot` 只用于历史和垃圾箱删除上下文,不得成为当前任务归属或分类顺序事实。

### FORMAT-013 · 永久清理后的不可用任务引用

v1 中保留记录的结构化任务邻居或恢复锚点因 ERASE-003 指向已经永久清理的任务时,该引用必须且只能使用以下语言无关对象:

```json
{ "kind": "unavailable" }
```

`UnavailableTaskRef` 不得携带任务 ID、标题、内容、指纹、时间、删除原因、映射或任何额外字段。它只允许出现在 FORMAT-014 恢复锚点或 FORMAT-021 历史任务邻居等 schema 明确定义的联合位置,不得用作任务记录、当前任务身份、当前分类引用、位置边界或普通缺失值。目标仍存在、只是移动、改标题、软删除或暂时不符合位置使用条件时不得提前改成不可用。

该值只说明原结构化引用因永久清理而无法再解析,不是可查询实体、任务特定墓碑或删除黑名单,不得阻止有效删除前备份覆盖导入。恢复定位必须把它视为无效锚点;历史呈现只能显示语言本地化的通用“不可用”语义,不得尝试重建目标身份。任务记录及垃圾箱恢复锚点联合结构由 FORMAT-014 锁定;历史事件中的前后任务邻居联合结构由 FORMAT-021 锁定。

### FORMAT-014 · v1 任务记录与生命周期

`tasks` 中每条任务记录必须且只能包含 `id`、`title`、`notes`、`status`、`priority`、`createdAt`、`updatedAt` 与 `lifecycle` 八个顶层字段,即七个公共字段和一个生命周期判别字段。缺失、未知或额外字段以及用 `null` 代替任一必填值都必须拒绝。七个公共字段规则如下:

- `id` 使用 FORMAT-011 的任务 UUID。
- `title` 必须是至少包含一个非空白字符的字符串,并逐字保留用户提交的原文,不得因校验去除或改写首尾空白。
- `notes` 必须始终是字符串;没有备注时精确为 `""`,不得省略或使用 `null`,非空时逐字保留换行与用户原文。
- `status` 必须且只能是语言无关值 `"open"` 或 `"completed"`。
- `priority` 必须且只能是 `"P0"`、`"P1"`、`"P2"`、`"P3"`、`"P4"` 或 `"P5"`。
- `createdAt` 是创建操作冻结的 `occurredAt`,创建后不可改变。
- `updatedAt` 是最近一次实际改变该任务业务状态的操作原始 `occurredAt`;创建时必须与 `createdAt` 完全相同。全部时间使用 FORMAT-011。

一条活动任务的完整结构例如:

```json
{
  "id": "018f47a2-3d81-4f5d-8a9c-123456789abc",
  "title": "用户原文",
  "notes": "",
  "status": "open",
  "priority": "P3",
  "createdAt": "2026-07-30T08:15:42.123Z",
  "updatedAt": "2026-07-30T08:15:42.123Z",
  "lifecycle": { "kind": "active" }
}
```

活动任务的 `lifecycle` 必须精确为:

```json
{ "kind": "active" }
```

该对象不得保存分类、顺序、删除字段或其他数据。活动任务的当前唯一分类和分类内总顺序只由 FORMAT-012 的 `taskOrderByCategory` 表达;每个活动任务必须在其中恰好出现一次。

垃圾箱任务的 `lifecycle` 必须且只能包含以下六个字段:

```json
{
  "kind": "trashed",
  "deletedAt": "2026-07-30T08:15:42.123Z",
  "expiresAt": "2026-08-29T08:15:42.123Z",
  "categorySnapshotAtDeletion": {
    "ref": { "kind": "inbox" }
  },
  "previousTaskAnchor": { "kind": "start" },
  "nextTaskAnchor": { "kind": "end" }
}
```

`deletedAt` 必须与软删除操作的 `occurredAt` 及该任务新的 `updatedAt` 完全相同;`expiresAt` 必须精确为 `deletedAt` 后 30 天;`categorySnapshotAtDeletion` 使用 FORMAT-012。`previousTaskAnchor` 必须且只能是 `{ "kind": "task", "taskId": <任务 UUID> }`、`{ "kind": "start" }` 或 FORMAT-013 的 `{ "kind": "unavailable" }`;`nextTaskAnchor` 必须且只能是 `{ "kind": "task", "taskId": <任务 UUID> }`、`{ "kind": "end" }` 或 `{ "kind": "unavailable" }`。`task` 分支必须是只含 `kind` 与 `taskId` 的对象,不得退化为裸 ID 或保存标题及其他快照;该 ID 必须解析到 `tasks` 中另一条现存任务。永久清理目标后才可按 FORMAT-013 把对应锚点替换为 `unavailable`;移动、改名、软删除或暂时不满足恢复位置条件都不得提前替换。

垃圾箱任务不得出现在 `taskOrderByCategory`。其公共 `title`、`notes`、`status` 与 `priority` 就是删除时继续保留并在恢复时沿用的值,不得在生命周期中重复保存 `statusAtDeletion`、内容或优先级副本。FORMAT-027 的同值 `status` 是恢复后仍保留的历史审计事实,不属于生命周期副本或当前状态来源。恢复必须把 `lifecycle` 整体替换为精确 `{ "kind": "active" }`,删除全部垃圾箱专用元数据,并把原任务 ID 恰好一次加入 `taskOrderByCategory`;不得保留可空删除字段或创建副本。

以下实际任务变化必须只把直接受影响任务的 `updatedAt` 设置为对应操作已经冻结的原始 `occurredAt`:创建,标题或备注编辑,完成状态切换,优先级修改,分类或顺序移动(包括分类删除导致的迁移),软删除和恢复。无变化提交、界面状态、备份导出或导入、自动清理与其他维护动作不得推进 `updatedAt`;插入或移动一个任务导致相邻任务相对位置被动变化时,不得仅因此改写相邻任务。待保存重试、应急导出和延迟数据库提交必须保留操作首次进入工作状态时冻结的时间,不得改用重试、导出或提交时间。恢复时 `createdAt` 保持不变,`updatedAt` 改为恢复操作的 `occurredAt`。

### FORMAT-015 · v1 快速创建草稿记录

`drafts` 中每条记录必须且只能包含 `entry`、`generation`、`title` 与 `cursorOffset` 四个顶层字段。缺失、未知或额外字段以及用 `null` 代替任一值都必须拒绝。全局快速入口草稿例如:

```json
{
  "entry": { "kind": "global" },
  "generation": "018f47a2-3d81-4f5d-8a9c-123456789abc",
  "title": "用户原文",
  "cursorOffset": 4
}
```

分类标题入口草稿例如:

```json
{
  "entry": {
    "kind": "category",
    "categoryRef": {
      "kind": "custom",
      "categoryId": "018f47a2-3d81-4f5d-8a9c-123456789abc"
    }
  },
  "generation": "2f3d9570-5f1b-43d0-bc77-a86f3a698b41",
  "title": "用户原文",
  "cursorOffset": 4
}
```

`entry` 必须且只能是以下判别联合之一:

- 全局入口精确为 `{ "kind": "global" }`,不得携带分类或其他字段;其任务目标唯一推导为固定收件箱。
- 分类标题入口必须且只能包含 `kind: "category"` 与一个 FORMAT-011 `CategoryRef`;其任务目标唯一推导为该引用。Custom 引用必须解析到 `categories` 中恰好一个现存分类。

记录不得另存 `targetCategoryRef`、目标名称或其他分类副本。全局入口与 `{ "kind": "category", "categoryRef": { "kind": "inbox" } }` 是归属结果相同但语义身份不同的两个入口,必须允许各自保留一份草稿。全局入口在桌面、移动响应式界面和未来兼容客户端中仍是同一语义入口;分类入口按 `CategoryRef` 跨界面形态、语言切换、分类改名和排序保持同一身份。每个语义入口在 `drafts` 中最多出现一次;数组排列不表达入口或产品顺序。

`generation` 必须匹配 FORMAT-011 的规范小写 UUID v4 文法,但只是不透明草稿代次令牌,不得充当任务、分类、提交幂等键、时间或顺序。入口从没有草稿进入非空草稿时必须生成一个新值;该草稿保持非空期间的内容和光标更新必须保留同一值。成功提交、明确清空、输入变为空,或按 CATEGORY-012 确认删除所属自定义分类后,该代次结束且记录不存在;此后再次进入仍合法入口的非空草稿必须生成新值。当前 `drafts` 集合中的代次值不得重复,且不得建立需要随草稿删除后继续保留的代次计数高水位。

`title` 必须是 `""` 以外的字符串并逐字保留单行快速输入中的当前用户原文。纯空白字符串仍是必须保存的非空草稿,但按 CREATE-004 不构成可提交任务;不得通过 trim、规范化或翻译改变它。空输入不得保存空记录、占位记录或 `null` 草稿。

`cursorOffset` 必须是从 `0` 到 `title` UTF-16 code unit 长度之间的 JSON 非负整数,边界值也合法。它只恢复一个折叠光标位置,不保存选区范围、焦点、键盘或其他瞬时界面状态;Web 实现应与单行输入的 `selectionStart` 计量一致,未来客户端必须在导入导出边界转换为同一 UTF-16 偏移语义。

合法当前状态和完整备份中的分类入口 custom 引用必须可解析。按 CATEGORY-012 确认删除自定义分类时,同一业务操作必须以被确认的精确 `entry + generation` 作为逻辑消费授权,结果不得迁移草稿、自动创建任务或留下悬空引用;操作进入待保存工作状态后的备份也不得再包含该草稿。若该已确认内存代次覆盖数据库中的同入口旧代次,旧记录只是逻辑草稿的陈旧物理影子,必须在分类删除事务中一并清除;未经确认的新逻辑代次仍必须使整笔删除回滚并重新确认。

### FORMAT-016 · v1 历史记录公共外壳

`history` 中每条记录必须且只能包含以下七个顶层字段;缺失、未知或额外字段,以及用 `null` 代替任一值,都必须拒绝:

| 字段 | 类型 | 约束 |
|---|---|---|
| `subjectType` | string | 只能是 `"task"` 或 `"category"` |
| `subject` | object | 由 `subjectType` 唯一判别的严格主体快照 |
| `eventType` | string | FORMAT-017 闭合枚举中的稳定语言无关精确事件类型 |
| `occurredAt` | string | FORMAT-011 的 UTC 固定毫秒精度操作时间 |
| `operationSequence` | string | FORMAT-007 的正整数十进制字符串 |
| `eventOrder` | number | JSON 非负安全整数,同一操作内唯一 |
| `details` | object | FORMAT-018 定义的必填、非 `null` 事件专属最小严格对象 |

`subjectType: "task"` 时,`subject` 必须且只能是 `{ "taskId": <任务 UUID>, "title": <发生时用户原文标题> }`;`subjectType: "category"` 时,`subject` 必须且只能是 `{ "categoryId": <分类 UUID>, "name": <发生时用户原文名称> }`。两个分支的 ID 使用 FORMAT-011 的规范小写 UUID v4;`title` 与 `name` 必须是字符串并逐字保留事件发生时用户原文。对于 `task.content_changed`,`subject.title` 的“发生时”精确指本次原子保存后的标题,并继续遵守 FORMAT-019;不得按保存前标题或后来当前标题解释。不得把 `taskId`、`title`、`categoryId` 或 `name` 平铺为历史记录顶层字段,也不得让一个主体分支携带另一分支字段。

`eventType` 必须精确使用 FORMAT-017 的闭集值。`details` 必须同时遵守 FORMAT-018;其中 `task.content_changed` 还必须精确遵守 FORMAT-019,`task.completed` 与 `task.reopened` 必须精确遵守 FORMAT-020,任何保存前后任务邻居的历史位置字段都必须复用 FORMAT-021,`task.created` 必须精确遵守 FORMAT-022,`task.priority_changed` 必须精确遵守 FORMAT-023,`task.reordered` 必须精确遵守 FORMAT-024,`task.category_changed` 必须精确遵守 FORMAT-025,`task.moved_to_inbox_by_category_deletion` 必须精确遵守 FORMAT-026,`task.trashed` 必须精确遵守 FORMAT-027,`task.restored` 必须精确遵守 FORMAT-028,`category.created` 必须精确遵守 FORMAT-029,`category.renamed` 必须精确遵守 FORMAT-030,`category.reordered` 必须精确遵守 FORMAT-031,`category.deleted` 必须精确遵守 FORMAT-032。不得用本地化动作名称、显示句子或开放字符串替代稳定语义码。`details` 即使某一事件无需其他载荷也必须由其类型 schema 明确定义,不得省略、设为 `null` 或接受未知字段。

`eventOrder` 必须从 `0` 开始按同一正式操作内的既定顺序分配,且在同一 `operationSequence` 内唯一。永久清理删除部分事件后允许留下 `eventOrder` 缺口,导出、迁移或导入不得重编号。`(operationSequence, eventOrder)` 是每条事件的唯一稳定逻辑键;记录不得另存 `id`、`eventId`、事件 UUID、动作组、本地化摘要或其他未知字段。`history` 数组排列本身不表达时间线顺序。

### FORMAT-017 · v1 历史精确事件类型闭集

v1 的 `eventType` 必须且只能是下表 14 个大小写敏感字符串之一:字符只使用 ASCII 小写字母、点与下划线,命名空间以点分隔,段内允许下划线,并始终以闭集逐字匹配为准。表中动作组是由 `eventType` 唯一推导的界面筛选语义,不得进入历史记录或备份字段:

| `eventType` | `subjectType` | 动作组 | 精确事实 |
|---|---|---|---|
| `task.created` | `task` | 创建 | 创建任务,包含初始分类和位置 |
| `task.content_changed` | `task` | 内容编辑 | 标题、备注或同一次正式保存中的两者发生实际变化 |
| `task.completed` | `task` | 完成状态 | 任务从未完成变为已完成 |
| `task.reopened` | `task` | 完成状态 | 任务从已完成变为未完成 |
| `task.priority_changed` | `task` | 优先级 | 任务在 `P0` 至 `P5` 之间发生实际优先级变化 |
| `task.reordered` | `task` | 移动与归类 | 分类不变,只改变同一完成状态序列中的位置 |
| `task.category_changed` | `task` | 移动与归类 | 任务由用户直接改到另一分类 |
| `task.moved_to_inbox_by_category_deletion` | `task` | 移动与归类 | 分类删除派生的任务迁入固定收件箱 |
| `task.trashed` | `task` | 删除 | 任务软删除进入垃圾箱 |
| `task.restored` | `task` | 恢复 | 垃圾箱任务恢复并完成实际落位 |
| `category.created` | `category` | 分类管理 | 创建自定义分类 |
| `category.renamed` | `category` | 分类管理 | 重命名自定义分类 |
| `category.reordered` | `category` | 分类管理 | 调整自定义分类顺序 |
| `category.deleted` | `category` | 分类管理 | 删除自定义分类 |

未知值、大小写变体、前后空白、已本地化动作名称或完整显示句子都必须在任何写入前拒绝。`task.*` 值只能配合 `subjectType: "task"`,`category.*` 值只能配合 `subjectType: "category"`;动作组不作为兼容未知类型的兜底。

`task.content_changed` 不因只改标题、只改备注或同一次正式保存同时修改两者而拆成更多事件类型;具体变化字段和当前语言下的精确动作由 FORMAT-019 的 `details` 分支推导。`task.category_changed` 同样不记录跨分类拖拽、任务行选择器、编辑器选择器或选择器内新建分类后归入等界面来源;这些入口产生相同任务归类事实。通过选择器新建分类并归入任务时,同一操作仍先写 `category.created`,再写 `task.category_changed`。

`task.moved_to_inbox_by_category_deletion` 只能由 `category.deleted` 派生,必须在同一 `operationSequence` 中随对应分类事件出现,目标固定为收件箱,并遵守 HIST-006 的事件顺序;用户直接拖拽或选择收件箱不得使用该类型。`task.created` 已包含初始分类与位置,`task.trashed` 已包含移出活动顺序,`task.restored` 已包含恢复落位,三者都不得另写移动事件。

草稿输入、清空或丢弃,自动保存计时和状态反馈,筛选、展开、折叠、滚动、导航、语言切换、完整备份导入及永久清理都不产生新的历史事件。永久清理尤其不得为了说明清理而保留一个新的 `eventType`、历史痕迹或操作顺序。

### FORMAT-018 · v1 历史 `details` 事件专属最小结构原则

每条历史记录的外层 `eventType` 是选择 `details` schema 的唯一事件判别。FORMAT-017 的 14 个值必须各自对应一个封闭、严格且事件专属的最小对象;需要表达事件内部差异时,该事件可以定义自己的封闭内部联合。`details` 根对象不得再保存冗余 `kind`、事件类型、动作组或其他第二判别源;只有被事件字段引用的嵌套可复用联合本身确实需要判别时,该嵌套对象才可以按其独立类型定义保存 `kind`。

每个分支只保存脱离后来可变状态呈现并校验该事件所必需的事实。不得复制 FORMAT-016 已有的 `subjectType`、`subject`、`eventType`、`occurredAt`、`operationSequence` 或 `eventOrder`,不得复制完整任务或分类记录,也不得使用通用的整实体 `before` / `after` 快照包代替事件字段。FORMAT-012 的 `CategorySnapshot`、FORMAT-021 的历史前后任务邻居联合、FORMAT-022 的创建位置对象、FORMAT-023 的优先级值对、FORMAT-024 的排序前后位置对象、FORMAT-025 的来源与目标对象、FORMAT-026 的批量来源与最终收件箱位置对象、FORMAT-027 的删除前位置对象及 FORMAT-028 的恢复后位置对象等严格类型,只能出现在该事件语义确实需要的位置,不得退化成接受任意属性的匿名对象。

每个事件分支必须明确全部必填字段并拒绝缺失、未知、额外或任意层级的 `null`。创建、删除、恢复等没有旧侧或新侧的语义由对应事件的字段形状直接表达,不得补 `null`、空占位、通用“不可用”对象或伪造默认值。字段名与结构必须表达具体事实,不得用开放 metadata、任意键值包或未声明字段为未来兼容预留通道。

`task.content_changed` 继续只使用一个 `eventType`,其三个封闭形状及精确字段由 FORMAT-019 定义。`task.completed` 与 `task.reopened` 的精确详情由 FORMAT-020 定义。历史位置中的前后任务邻居联合由 FORMAT-021 定义。`task.created` 的精确详情由 FORMAT-022 定义。`task.priority_changed` 的精确详情由 FORMAT-023 定义。`task.reordered` 的精确详情由 FORMAT-024 定义。`task.category_changed` 的精确详情由 FORMAT-025 定义。`task.moved_to_inbox_by_category_deletion` 的精确详情由 FORMAT-026 定义。`task.trashed` 的精确详情由 FORMAT-027 定义。`task.restored` 的精确详情由 FORMAT-028 定义。`category.created` 的精确空详情由 FORMAT-029 定义。`category.renamed` 的精确详情由 FORMAT-030 定义。`category.reordered` 的精确详情由 FORMAT-031 定义。`category.deleted` 的精确详情由 FORMAT-032 定义。14 个分支全部继续遵守本条已经确定的外层唯一判别、最小载荷与严格拒绝原则。

### FORMAT-019 · v1 `task.content_changed` 精确详情

当 `eventType` 为 `task.content_changed` 时,`subjectType` 必须为 `task`,且 `subject.title` 必须是本次原子保存完成后的有效任务标题。只改备注时它与保存前标题相同;标题发生变化时它就是新标题。`subject.title` 与下述 `beforeTitle` 都必须符合 FORMAT-014 的有效任务标题约束并逐字保留用户原文。

三个分支都必须有 `categorySnapshot`,其值精确符合 FORMAT-012 `CategorySnapshot`,表示本次内容保存被工作状态接受时该任务的分类。内容保存不改变分类,因此不保存分类新旧对。自定义分类快照保留当时 ID 与用户原文名称,固定收件箱只保留稳定系统身份;该快照用于独立呈现和分类筛选,不得从后来当前归属补算或成为当前归属的第二来源。

只改标题时,`details` 必须且只能包含两个字段:

```json
{
  "categorySnapshot": { "ref": { "kind": "inbox" } },
  "beforeTitle": "原来的标题"
}
```

`beforeTitle` 是保存前标题,且必须与 `subject.title` 不同。不得在 `details` 中另存 `afterTitle`,因为保存后标题已经由 `subject.title` 唯一表达。

只改备注时,`details` 必须且只能包含三个字段:

```json
{
  "categorySnapshot": { "ref": { "kind": "inbox" } },
  "beforeNotes": "",
  "afterNotes": "新增的备注"
}
```

同一次原子保存同时修改标题和备注时,`details` 必须且只能包含四个字段:

```json
{
  "categorySnapshot": { "ref": { "kind": "inbox" } },
  "beforeTitle": "原来的标题",
  "beforeNotes": "",
  "afterNotes": "新增的备注"
}
```

`beforeNotes` 与 `afterNotes` 必须都是字符串,允许精确为空字符串 `""`,非空时逐字保留用户原文和换行,且两者必须不同。标题与备注同时变化的分支还必须满足 `beforeTitle` 与 `subject.title` 不同。三个分支分别只能具有上述二、三、四个字段;不得缺失或错误使用 `categorySnapshot`,也不得接受空对象、部分备注对、没有对应实际变化的字段、`afterTitle`、`changedFields`、根级 `kind`、任意 `null`、未知或额外字段。

除三个分支共有的 `categorySnapshot` 外,变化字段是否存在就是只改标题、只改备注或同时修改两者的唯一内部形状信号,不得另加判别字段。一次保存无论变化一个还是两个字段都只形成一条事件;无实际变化时不形成事件。待保存队列、自动重试、应急备份、普通导出和导入必须冻结并逐字保留保存后 `subject.title`、发生时分类快照与当时选定的精确 `details` 形状和值,不得根据后来任务内容、状态或分类重新计算,也不得保存完整任务记录或整实体新旧快照。

### FORMAT-020 · v1 `task.completed` / `task.reopened` 精确详情

当 `eventType` 为 `task.completed` 或 `task.reopened` 时,`subjectType` 必须为 `task`,且 `details` 必须且只能包含一个 `categorySnapshot` 字段:

```json
{
  "categorySnapshot": { "ref": { "kind": "inbox" } }
}
```

`categorySnapshot` 必须精确符合 FORMAT-012,表示状态切换被工作状态接受时该任务的分类。状态切换不改变分类,因此只保存一份发生时快照;自定义分类后来改名、删除或任务后来移动都不得回写该值。历史按该快照参与分类筛选,不得从当前任务归属补算或把它作为当前归属读取源。

`task.completed` 本身完整表达任务从 `open` 变为 `completed`,`task.reopened` 本身完整表达任务从 `completed` 变为 `open`;两种方向不得再以 `beforeStatus`、`afterStatus`、`status`、布尔值、根级 `kind` 或其他字段在 `details` 中重复。不得省略 `details` 或 `categorySnapshot`,不得改为 `null`、数组、空对象或含其他字段的对象。

生产者只有在任务当前状态真实发生对应方向变化时才能原子更新任务并生成事件;把任务设置为当前状态不得形成事件。待保存队列、自动重试、应急备份、普通导出、当前版本导入和核心存储必须原样保留精确详情,不得根据后来任务状态或分类补字段。当前清单仍从任务记录读取,导入只按 `eventType` 与本条校验详情形状,不得为校验该事件而重放状态历史或用后来当前状态反推事件前态。

### FORMAT-021 · v1 历史任务邻居快照联合

历史位置中的前任务邻居 `PreviousTaskNeighborSnapshot` 必须且只能是开头边界、发生时任务快照或 FORMAT-013 的不可用引用:

```json
{ "kind": "start" }
```

历史位置中的后任务邻居 `NextTaskNeighborSnapshot` 必须且只能是末尾边界、发生时任务快照或 FORMAT-013 的不可用引用:

```json
{ "kind": "end" }
```

两个联合共用的发生时任务快照分支必须且只能是:

```json
{
  "kind": "task",
  "taskId": "018f47a2-3d81-4f5d-8a9c-123456789abc",
  "title": "相邻任务"
}
```

两个联合共用的不可用分支必须且只能是 FORMAT-013:

```json
{ "kind": "unavailable" }
```

`PreviousTaskNeighborSnapshot` 不得使用 `end`,`NextTaskNeighborSnapshot` 不得使用 `start`。`task` 分支的 `taskId` 必须符合 FORMAT-011,指向该邻居字段所属 `position` 在事件发生时对应分类与完成状态序列中紧邻的另一任务,且不得等于事件主体任务。单分类事件的全部位置使用同一分类;FORMAT-025 跨分类事件的 `source.position` 与 `target.position` 分别使用各自分类及根部同一 `status`;FORMAT-026 的 `source.position` 使用整批迁移前的来源自定义分类,`targetPosition` 使用整批完成后的固定收件箱,两者都按根部同一 `status` 投影;FORMAT-027 的 `position` 使用主体移出前的 `categorySnapshot` 与根部 `status` 投影;FORMAT-028 的 `position` 使用主体恢复插入完成后的实际 `categorySnapshot` 与根部 `status` 投影。`title` 必须符合 FORMAT-014 的有效标题约束并逐字保留邻居在事件发生时的用户原文;它不得根据邻居后来的当前标题重算。

当前版本的正常业务事件生产者不得直接生成 `unavailable`:没有前后邻居时必须分别使用 `start` 或 `end`,存在邻居时必须使用 `task` 分支。`unavailable` 只能是已保留结构化任务引用按 ERASE-003 永久清理、IMPORT-006 导入时到期过滤、清理待完成态逻辑投影,或旧版本合法已清理引用迁移后的结果。邻居只是改标题、移动、软删除或暂时不再相邻时,旧快照保持 `task` 分支不变;邻居被永久清理时,保留记录中语义上指向它的整个 `task` 分支必须在同一原子维护事务中替换为 `{ "kind": "unavailable" }`,不得保留 `taskId` 或 `title`。

导入时,必须先在 IMPORT-006 到期投影前确认 `task` 分支的 `taskId` 解析到原备份中另一条任务;该任务可以已移动、换分类、切换状态或软删除,且发生时 `title` 不要求等于它的当前标题,也不得与最终 `taskOrderByCategory` 对质。只有 IMPORT-006 随后在同一覆盖事务中排除一条导入时已到期任务时,才必须把保留事件中对它的合法 `task` 引用同步改为 `unavailable`。不得用不可用分支掩盖未知 UUID、自引用、方向边界错配、缺失、`null`、裸任务 ID、当前标题补值或任何额外字段。FORMAT-021 只保存历史审计上下文,不得成为当前顺序、拖拽落点或垃圾箱恢复定位的读取源。

### FORMAT-022 · v1 `task.created` 精确详情

当 `eventType` 为 `task.created` 时,`subjectType` 必须为 `task`,且 `subject.title` 必须逐字保存本次创建提交的有效用户原文标题。`details` 必须且只能包含 `categorySnapshot` 与 `position` 两个根字段:

```json
{
  "categorySnapshot": { "ref": { "kind": "inbox" } },
  "position": {
    "previousTask": { "kind": "start" },
    "nextTask": { "kind": "end" }
  }
}
```

`categorySnapshot` 必须精确符合 FORMAT-012,表示创建操作被工作状态接受时由快速入口确定的初始分类。`position` 必须且只能包含 `previousTask` 与 `nextTask` 两个字段,分别精确使用 FORMAT-021 的 `PreviousTaskNeighborSnapshot` 与 `NextTaskNeighborSnapshot`,表示新任务插入完成后在该初始分类未完成任务序列中的直接前、后邻居。两侧都为 `task` 分支时必须引用两个不同的非主体任务。正常创建生产者不得使用 `unavailable`;后来永久清理邻居或发生 FORMAT-021 已锁定的其他合法投影时,只整体替换对应邻居分支。

快速新增会话第一条任务按 CREATE-008 插入未完成序列顶部,所以其 `previousTask` 必须为 `start`,后侧按当时实际邻居使用 `task` 或 `end`。同一会话继续创建 `A` 后的 `B` 时,`B.position.previousTask` 必须冻结为 `A` 的发生时任务快照,后侧仍按 `B` 实际插入后的邻居冻结;创建 `B` 不得回写 `A` 的创建事件。后续新建、移动、改标题、换分类、切换状态或软删除任何任务都不得重算旧创建位置或分类快照。该位置只用于历史审计与呈现,不得成为当前顺序、快速新增会话或拖拽落点的读取源。

创建没有操作前的任务实体或位置,不得保存 `before`、`beforePosition`、`null` 或空占位。FORMAT-016 已保存主体标题和操作时间,FORMAT-014 / CREATE-004 已锁定新任务为 `open`、`P3`、空备注与活动生命周期,因此 `details` 不得重复标题、时间、状态、优先级、备注、生命周期、任务 ID 或完整任务记录。也不得保存全局或分类标题入口、桌面或移动形态、草稿 `entry` / `generation`、提交幂等键、焦点、键盘、会话标识、内部排序键、绝对序号、根级 `kind` 或其他未知字段。

待保存队列、自动重试、应急备份、普通导出、当前版本导入和核心存储必须原样冻结并往返上述精确形状和值。导入先按 FORMAT-021 验证原文件中的任务邻居引用,再执行 IMPORT-006 合法投影;不得根据导入后的当前分类、标题、状态或顺序重建创建位置,也不得重放创建历史来生成当前任务。

### FORMAT-023 · v1 `task.priority_changed` 精确详情

当 `eventType` 为 `task.priority_changed` 时,`subjectType` 必须为 `task`,且 `details` 必须且只能包含 `categorySnapshot`、`beforePriority` 与 `afterPriority` 三个字段:

```json
{
  "categorySnapshot": { "ref": { "kind": "inbox" } },
  "beforePriority": "P3",
  "afterPriority": "P1"
}
```

`categorySnapshot` 必须精确符合 FORMAT-012,表示优先级修改被工作状态接受时任务所属分类。优先级修改不改变分类,因此不保存分类新旧对。`beforePriority` 必须是接受操作前该任务的优先级,`afterPriority` 必须是同一原子操作接受的新优先级;两者都必须逐字属于 `P0`、`P1`、`P2`、`P3`、`P4`、`P5` 闭集且必须不同。选择当前值属于无变化,不得生成事件、推进任务 `updatedAt` 或消耗 `operationSequence`。

优先级修改不得改变任务分类、完成状态或持久顺序,所以详情不得保存位置、历史邻居、排序键、绝对序号、状态或分类新旧对。FORMAT-016 已保存发生时主体标题和操作时间,因此也不得重复标题、任务 ID 或时间。任务行菜单与编辑器只是在不同界面入口修改同一个业务值;详情不得保存控件位置、桌面或移动形态、手势、菜单项、本地化标签、根级 `kind`、通用整实体 `before` / `after`、完整任务、`null` 或其他未知字段。

任务后来改标题、再次改优先级、移动、换分类、切换状态或软删除时,既有 `categorySnapshot`、`beforePriority` 与 `afterPriority` 不得回写。历史按发生时分类快照筛选并显示本次精确优先级方向,但不得用该事件驱动当前任务优先级或顺序。当前状态生产者必须在一个原子业务事务中使任务新值等于 `afterPriority`、使该任务 `updatedAt` 等于事件 `occurredAt` 并追加且只追加这一条事件;导入只校验原文件事实而不重放历史或拿后来当前优先级对质。待保存队列、自动重试、应急备份、普通导出、当前版本导入和核心存储必须原样冻结并往返上述精确形状和值。

### FORMAT-024 · v1 `task.reordered` 精确详情

当 `eventType` 为 `task.reordered` 时,`subjectType` 必须为 `task`,且 `details` 必须且只能包含 `categorySnapshot`、`status`、`beforePosition` 与 `afterPosition` 四个根字段:

```json
{
  "categorySnapshot": { "ref": { "kind": "inbox" } },
  "status": "open",
  "beforePosition": {
    "previousTask": {
      "kind": "task",
      "taskId": "018f47a2-3d81-4f5d-8a9c-123456789abc",
      "title": "前一项任务"
    },
    "nextTask": {
      "kind": "task",
      "taskId": "118f47a2-3d81-4f5d-8a9c-123456789abc",
      "title": "后一项任务"
    }
  },
  "afterPosition": {
    "previousTask": {
      "kind": "task",
      "taskId": "218f47a2-3d81-4f5d-8a9c-123456789abc",
      "title": "新的前一项任务"
    },
    "nextTask": { "kind": "end" }
  }
}
```

`categorySnapshot` 必须精确符合 FORMAT-012,表示排序操作被工作状态接受时任务所属且在本次操作中保持不变的分类。`status` 必须精确为语言无关值 `"open"` 或 `"completed"`,表示同一时刻任务所属且本次操作中保持不变的完成状态序列。分类和状态各保存一次,不得在两个位置中重复或保存新旧对。

`beforePosition` 与 `afterPosition` 都必须且只能包含 `previousTask` 与 `nextTask` 两个字段,并分别精确使用 FORMAT-021 的 `PreviousTaskNeighborSnapshot` 与 `NextTaskNeighborSnapshot`。前者冻结被拖任务从原位置移除前在发生时分类、状态序列中的直接邻居,后者冻结同一任务插入新位置后在同一分类、状态序列中的直接邻居。每个位置内两侧都是 `task` 分支时必须引用两个不同的非主体任务;同一个合法邻居可以跨前后位置重复出现,例如只跨过一项任务时该项可同时是原后邻居和新前邻居。正常生产者不得在任一位置生成 `unavailable`。

当前版本只有前后位置真实不同时才能接受排序操作,原位放下不得改变顺序、任务 `updatedAt`、历史或 `operationSequence`。一次有效排序必须在同一原子业务事务中只改变主体任务在权威活动顺序中的位置,把该任务 `updatedAt` 设为事件 `occurredAt`,并追加且只追加这一条事件;不得改变任务分类、状态、优先级、内容或生命周期,也不得仅因被动位移推进任何邻居任务的 `updatedAt`。

合法永久清理、导入时到期过滤或清理待完成投影可以按 FORMAT-021 把任一邻居的整个 `task` 分支替换为精确 `{ "kind": "unavailable" }`。若多个原本不同的邻居都被去身份化,保留事件的 `beforePosition` 与 `afterPosition` 可能在结构上收敛为相同值;这种含合法 `unavailable` 的保留结果不得被导入、导出或存储往返误判为原位拖拽。正常生产时没有 `unavailable` 的相同前后位置仍必须拒绝。任务主体被永久清理时,整条事件继续按 ERASE-003 删除。

详情不得保存拖拽起点、任务行区域、指针或触摸、位移或长按阈值、桌面或移动形态、插入标记、折叠或滚动状态、绝对序号、数组下标、内部 rank/sort key、当前顺序副本、时间、根级 `kind`、通用整实体 `before` / `after`、完整任务、`null` 或其他未知字段。任务标识与标题只能存在于 FORMAT-021 明确定义的邻居 `task` 分支中;不得在分支之外重复保存任何任务 ID 或标题,尤其不得复制事件主体任务 ID 或主体标题。位置快照只用于历史审计、呈现和发生时分类筛选,不得成为当前顺序、后续拖拽落点或垃圾箱恢复定位的读取源。

任务或邻居后来改标题、移动、换分类、切换状态、软删除或不再相邻时,既有分类、状态和位置快照不得回写。待保存队列、自动重试、应急备份、普通导出、当前版本导入和核心存储必须原样冻结并往返上述精确形状和值。导入校验不得重放排序历史,不得拿后来当前分类、状态、顺序或标题与发生时快照对质,也不得用历史位置重建当前顺序。

### FORMAT-025 · v1 `task.category_changed` 精确详情

当 `eventType` 为 `task.category_changed` 时,`subjectType` 必须为 `task`,且 `details` 必须且只能包含 `status`、`source` 与 `target` 三个根字段:

```json
{
  "status": "open",
  "source": {
    "categorySnapshot": { "ref": { "kind": "inbox" } },
    "position": {
      "previousTask": {
        "kind": "task",
        "taskId": "018f47a2-3d81-4f5d-8a9c-123456789abc",
        "title": "来源前一项"
      },
      "nextTask": {
        "kind": "task",
        "taskId": "118f47a2-3d81-4f5d-8a9c-123456789abc",
        "title": "来源后一项"
      }
    }
  },
  "target": {
    "categorySnapshot": {
      "ref": {
        "kind": "custom",
        "categoryId": "318f47a2-3d81-4f5d-8a9c-123456789abc"
      },
      "name": "工作"
    },
    "position": {
      "previousTask": { "kind": "start" },
      "nextTask": {
        "kind": "task",
        "taskId": "218f47a2-3d81-4f5d-8a9c-123456789abc",
        "title": "目标原首项"
      }
    }
  }
}
```

`status` 必须精确为语言无关值 `"open"` 或 `"completed"`,表示归类操作前后保持不变的完成状态。`source` 与 `target` 都必须且只能包含 `categorySnapshot` 与 `position`;两个分类快照分别精确符合 FORMAT-012,冻结操作被工作状态接受时的来源分类和目标分类,且两者 `CategoryRef` 必须不同。自定义分类快照保留发生时用户原文名称,固定收件箱只保留稳定系统身份。分类变化已经由来源和目标表达,不得重复为 `beforeCategory` / `afterCategory`、根级分类或状态新旧对。

两个 `position` 都必须且只能包含 `previousTask` 与 `nextTask`,分别精确复用 FORMAT-021 的 `PreviousTaskNeighborSnapshot` 与 `NextTaskNeighborSnapshot`。`source.position` 冻结主体从来源分类同状态序列移除前的直接邻居,`target.position` 冻结主体插入目标分类同状态序列后的直接邻居。正常生产时每个位置内双任务邻居必须不同且非主体,来源与目标全部 `task` 分支的任务 ID 也必须彼此不同,因为活动任务在同一时刻只能属于一个分类;正常生产者不得生成 `unavailable`。

跨分类拖拽必须按唯一有效插入标记生成精确目标位置。任务行或编辑器选择器必须按 D-069 把任务插入目标同状态序列顶部,所以 `target.position.previousTask` 为 `start`,后侧为操作后的实际首个邻居或 `end`。选择器内新建分类后归入既有任务时,新分类原为空,目标位置精确为 `start / end`;同一操作必须共享 `occurredAt` 与 `operationSequence`,先以 `eventOrder = 0` 追加 `category.created`,再以 `eventOrder = 1` 追加该任务事件,且 `target.categorySnapshot` 的自定义分类 ID 与用户原文名称必须分别和分类事件 `subject.categoryId` / `subject.name` 逐字一致。跨分类拖拽、两种选择器和选择器内新建分类只是同一归类事实的不同入口,详情不得保存入口、手势或新建分类来源。

只有来源与目标分类身份真实不同时才能接受 `task.category_changed`;选择当前分类不得改变归属、顺序、任务 `updatedAt`、历史、`operationSequence` 或待保存数量,也不得借选择器把任务移到当前分类顶部。与 FORMAT-024 不同,来源和目标位置可以结构相同:来源同状态序列只有主体且目标同状态序列为空时,两个位置都合法为 `start / end`,分类身份不同仍构成真实变化。

一次有效归类必须在同一原子业务事务中把主体任务 ID 从来源分组移入目标分组的指定位置,维持全局唯一活动归属,把主体 `updatedAt` 设为事件 `occurredAt`,并追加且只追加这一条任务事件;不得改变状态、优先级、内容或生命周期,也不得推进任何邻居任务的 `updatedAt`。创建、软删除、恢复和分类删除派生迁移继续使用各自事件,不得重复生成或冒用 `task.category_changed`。

详情不得保存任务行、编辑器、选择器、新建分类或拖拽来源,指针、触摸、阈值、设备形态、插入标记、折叠或滚动状态、绝对序号、数组下标、内部 rank/sort key、当前顺序副本、时间、根级 `kind`、通用整实体 `before` / `after`、完整任务、`null` 或其他未知字段。任务标识与标题只能存在于 FORMAT-021 明确定义的邻居 `task` 分支中;不得在分支之外复制任务 ID、标题、事件主体 ID 或主体标题。

历史分类筛选必须只按 `target.categorySnapshot` 的不可变分类身份匹配,不得同时匹配来源分类;`source` 仍完整保留用于摘要与展开。任务、分类或邻居后来改标题、改名、移动、换分类、切换状态、软删除或删除分类时,既有状态、分类和位置快照不得回写。位置快照只用于审计与呈现,不得驱动当前归属、顺序、拖拽或垃圾箱恢复。

合法永久清理、导入时到期过滤或清理待完成投影可以按 FORMAT-021 把任一邻居 `task` 分支整体替换为精确 `{ "kind": "unavailable" }`;多个原本不同的邻居由此变成相同不可用分支时仍须保留事件。导入必须先校验原文件正常任务引用及来源、目标任务 ID 互异约束,再执行合法去身份化投影;不得用不可用掩盖悬空、自引用、跨分类重复任务 ID 或损坏结构。导入不重放归类历史,不拿当前分类、状态、顺序或标题与发生时快照对质。待保存队列、自动重试、应急备份、普通导出、当前版本导入和核心存储必须原样冻结并往返上述精确形状和值。

### FORMAT-026 · v1 `task.moved_to_inbox_by_category_deletion` 精确详情

当 `eventType` 为 `task.moved_to_inbox_by_category_deletion` 时,`subjectType` 必须为 `task`,且 `details` 必须且只能包含 `status`、`source` 与 `targetPosition` 三个根字段:

```json
{
  "status": "open",
  "source": {
    "categorySnapshot": {
      "ref": {
        "kind": "custom",
        "categoryId": "318f47a2-3d81-4f5d-8a9c-123456789abc"
      },
      "name": "工作"
    },
    "position": {
      "previousTask": {
        "kind": "task",
        "taskId": "018f47a2-3d81-4f5d-8a9c-123456789abc",
        "title": "批次前一项"
      },
      "nextTask": {
        "kind": "task",
        "taskId": "118f47a2-3d81-4f5d-8a9c-123456789abc",
        "title": "批次后一项"
      }
    }
  },
  "targetPosition": {
    "previousTask": {
      "kind": "task",
      "taskId": "018f47a2-3d81-4f5d-8a9c-123456789abc",
      "title": "批次前一项"
    },
    "nextTask": {
      "kind": "task",
      "taskId": "118f47a2-3d81-4f5d-8a9c-123456789abc",
      "title": "批次后一项"
    }
  }
}
```

`status` 必须精确为语言无关值 `"open"` 或 `"completed"`,表示分类删除迁移前后保持不变的完成状态。`source` 必须且只能包含 `categorySnapshot` 与 `position`;`source.categorySnapshot` 必须精确使用 FORMAT-012 的 Custom 分支,冻结被删自定义分类的不可变 ID 与事件发生时用户原文名称,且 `source.categorySnapshot.ref.categoryId` 必须与同一操作中 `eventOrder = 0` 的 `category.deleted.subject.categoryId` 相等,`source.categorySnapshot.name` 必须与其 `subject.name` 逐字一致。目标固定为收件箱且已经由 `eventType` 唯一表达,所以详情不得增加 `target`、目标分类快照、目标分类 ID、目标名称、原因或来源类型字段。

`source.position` 与 `targetPosition` 都必须且只能包含 `previousTask` 与 `nextTask`,分别精确复用 FORMAT-021 的 `PreviousTaskNeighborSnapshot` 与 `NextTaskNeighborSnapshot`。`source.position` 冻结整批迁移开始前主体在来源分类对应同状态子序列中的直接邻居;`targetPosition` 冻结来源分类全部任务已经作为一个连续分组追加到收件箱权威总顺序末尾后,主体在最终收件箱同状态子序列中的直接邻居。不得按每条任务事件依次记录临时收件箱位置,也不得按状态分组改变批次的权威总顺序。

一次正常分类删除必须保持来源分类权威总顺序,把完整批次连续追加到收件箱权威总顺序末尾。任务事件仍按操作前来源分类的这份总顺序分配 `eventOrder = 1...N`,不得按 `open` / `completed` 重新分组;每条事件的位置只在该总顺序上按自身根 `status` 投影。最终位置可以引用同一操作中 `eventOrder` 更大的后续任务,不得把事件顺序误当成逐条插入步骤。

每个位置内两侧都是 `task` 分支时必须引用两个不同的非主体任务。FORMAT-025 的跨分类四槽位全局互异规则不得用于本分支:同一批任务在来源与收件箱中保持相对顺序,所以同一个批次邻居可以且通常必须在 `source.position` 与 `targetPosition` 的同方向槽位重复。正常未清理记录中,仍为 `task` 分支的可识别 `taskId` 不得跨 `previousTask` / `nextTask` 方向重复;永久清理后的 `unavailable` 不携带任务身份,可以跨方向结构重复并按下文收敛。正常完整批次中,`source.position.nextTask` 与 `targetPosition.nextTask` 必须表达同一邻居或同为 `end`;若 `source.position.previousTask` 是任务,它必须与 `targetPosition.previousTask` 表达同一邻居。只有某状态批次的首项在来源前侧为 `start` 时,其目标前侧才可以变为原收件箱该状态序列的末项或继续为 `start`。来源中的可识别任务邻居、以及目标中属于批次的可识别邻居,必须对应同一操作、同一状态的另一条迁移事件,且 ID 与发生时标题和该事件 `subject` 逐字一致。正常生产者不得在任一槽位生成 `unavailable`。

正常生产时,一个含 N 项任务的分类删除必须原子产生一条 `category.deleted(eventOrder = 0)` 和 N 条本类型任务事件 `(eventOrder = 1...N)`;所有事件共享同一 `occurredAt` 与 `operationSequence`。同一事务还必须删除来源分类,按既定批次顺序更新活动归属,把每个迁移任务的 `updatedAt` 设置为该 `occurredAt`,并保持任务内容、优先级、状态与生命周期不变;原收件箱任务及其他任务的相对顺序和 `updatedAt` 不得改变。空分类删除只产生分类事件,不产生本类型任务事件。

详情不得保存收件箱分类快照、确认弹窗、被丢弃草稿、界面或手势来源、设备形态、绝对序号、数组下标、内部 rank/sort key、当前顺序副本、时间、根级 `kind`、通用整实体 `before` / `after`、完整任务、`null` 或其他未知字段。任务标识与标题只能存在于 FORMAT-021 的邻居 `task` 分支中;不得在分支外复制主体、批次列表或受影响任务数组。位置快照只用于历史审计和呈现,不得驱动当前顺序、拖拽或垃圾箱恢复。分类筛选只匹配固定收件箱;来源快照只用于摘要与展开,不得形成被删分类的任务事件筛选命中。

永久清理迁移事件主体时必须删除整条任务主体事件,但对应独立 `category.deleted` 仍保留原受影响数量。永久清理一个被其他迁移事件重复引用的批次邻居时,保留记录中指向它的每一个 `source.position` 与 `targetPosition` 任务分支都必须在同一维护事务中投影为精确 `{ "kind": "unavailable" }`;不得只替换一侧。清理后保留的迁移事件数可以少于原受影响数量,`eventOrder` 可以留洞甚至只剩分类事件,且多个位置可以因去身份化而收敛;不得据此重编号、拒绝或补建事件。

导入必须先在 IMPORT-006 投影前校验原文件中的方向、可解析任务引用、非自引用、每个位置内身份互异,并明确允许同一合法批次邻居跨来源与目标重复。每条保留迁移事件都必须有同时间、同 `operationSequence` 且 `eventOrder = 0` 的匹配 `category.deleted`;孤立迁移事件必须拒绝。合法清理缺口不要求保留任务事件数仍等于原受影响数量。导入不得重放历史,不得拿当前任务分类、状态、标题、顺序或当前收件箱尾部对质或重建发生时位置。旧格式只有在文件自身无歧义证明匹配分类删除、来源 Custom 快照、不变状态、整批前来源位置、整批后最终收件箱位置、源总顺序及全部发生时标题时才能迁移;不得仅凭绝对索引、HIST-006 顺序、D-009 追加规则、相邻事件或后来最终状态猜测。待保存队列、自动重试、应急备份、普通导出、当前版本导入和核心存储必须冻结并往返同一精确形状和值。

### FORMAT-027 · v1 `task.trashed` 精确详情

当 `eventType` 为 `task.trashed` 时,`subjectType` 必须为 `task`,且 `details` 必须且只能包含 `categorySnapshot`、`status` 与 `position` 三个根字段:

```json
{
  "categorySnapshot": {
    "ref": {
      "kind": "custom",
      "categoryId": "318f47a2-3d81-4f5d-8a9c-123456789abc"
    },
    "name": "工作"
  },
  "status": "completed",
  "position": {
    "previousTask": {
      "kind": "task",
      "taskId": "018f47a2-3d81-4f5d-8a9c-123456789abc",
      "title": "删除前一项"
    },
    "nextTask": { "kind": "end" }
  }
}
```

`categorySnapshot` 必须精确符合 FORMAT-012,冻结软删除被工作状态接受且主体尚未从活动顺序移除时的唯一分类;它可以是固定收件箱或自定义分类,自定义分支保存当时用户原文名称。`status` 必须精确为语言无关值 `"open"` 或 `"completed"`,等于删除接受时任务公共 `status`;软删除不得切换状态。`position` 必须且只能包含 `previousTask` 与 `nextTask`,分别复用 FORMAT-021 的方向严格联合,冻结主体移出前在同一分类、同一状态投影中的直接邻居。正常生产时不得生成 `unavailable`;两侧均为任务时必须引用两个不同的非主体任务。

一次有效软删除必须在同一原子业务事务中从 `taskOrderByCategory` 权威活动顺序移除且只移除主体任务 ID,把该任务生命周期替换为 FORMAT-014 的 `trashed` 六字段分支,设置任务 `updatedAt = event.occurredAt = lifecycle.deletedAt`,按该时间精确计算 `lifecycle.expiresAt = deletedAt + 30 days`,并追加且只追加一条本事件。`details.categorySnapshot` 必须与 `lifecycle.categorySnapshotAtDeletion` 逐字段同值,`details.status` 必须等于任务公共 `status`。正常生成时,`details.position.previousTask` / `nextTask` 与生命周期的 `previousTaskAnchor` / `nextTaskAnchor` 必须表达同一删除时邻居或方向边界;历史任务分支仍精确为 `{ kind, taskId, title }`,恢复锚点任务分支仍精确为 `{ kind, taskId }`,不得合并、串型或让任一方成为另一方的读取源。

若确认删除前存在 TRASH-004 定义的有效待保存标题或备注编辑,必须先作为更早的独立内容保存操作提交或进入待保存队列,再接受删除操作。随后 `task.trashed.subject.title` 必须是该编辑后的有效标题,任务公共内容也沿用最新有效值;本详情不重复标题或内容。取消确认、确认失效、主体已非活动任务、重复删除或其他无变化路径不得改变任务、顺序、时间、历史、`operationSequence` 或待保存数量。

详情不得保存 `deletedAt`、`expiresAt`、完整生命周期、`categorySnapshotAtDeletion`、任一恢复锚点、任务标题、备注、优先级、删除原因、确认状态、界面入口、手势、设备形态、绝对序号、数组下标、内部 rank/sort key、当前顺序副本、根级 `kind`、通用整实体 `before` / `after`、完整任务、`null` 或任何未知字段。任务 ID 与邻居标题只能存在于 FORMAT-021 明确定义的邻居 `task` 分支中;不得在这些分支之外复制主体或其他任务 ID、主体标题或邻居标题。删除时间只由公共 `occurredAt` 表达,主体标题只由公共 `subject.title` 表达,任务内容与优先级只由垃圾箱任务公共字段保留,30 天到期时间与恢复锚点只由当前垃圾箱生命周期承担。

本事件的 `position` 只用于审计、呈现与发生时分类筛选,不得驱动垃圾箱恢复、当前归属、当前顺序或后续拖拽。恢复必须且只能按 FORMAT-014 当前生命周期锚点与 RESTORE-002 回退规则合并主体任务,不得根据 FORMAT-027 移动任何其他任务、占用旧位置或覆盖删除后新增和修改的工作。恢复后生命周期删除垃圾箱专用字段,但既有 `task.trashed` 事件及其删除现场继续保留;再次删除是新的正式操作,必须按新的发生时标题、分类、状态与位置追加一条新事件,不得改写旧事件。

任务或邻居后来改标题、移动、换分类、切换状态、软删除或不再相邻,以及删除时自定义分类后来改名或被删除,都不得回写既有详情。永久清理某个邻居或执行导入时到期过滤时,只按 FORMAT-021 把保留事件中的对应整个任务分支投影为精确 `{ "kind": "unavailable" }`;若主体仍在垃圾箱且相同目标仍存在于 FORMAT-014 恢复锚点,该锚点按自身无标题联合独立投影。永久清理本事件主体时必须按 ERASE-001 删除整条事件;ERASE-003 只处理其他保留记录中的目标引用。清理后不得留下该主体的删除时间、分类、状态或位置痕迹。

生产事务必须满足上述状态、生命周期与历史同值关系,但备份导入不得把某条旧 `task.trashed` 事件与任务当前生命周期强行对质:同一任务可以在该事件后合法恢复、修改、移动、再次删除或再次恢复。导入必须校验 FORMAT-027 自身严格形状、发生时引用和合法清理投影,但不得重放历史、从事件重建生命周期、从当前任务或顺序反推旧值,也不得要求当前任务仍处于该次删除对应的垃圾箱状态。旧格式只有在文件自身无歧义证明删除时分类、状态、移出前同状态双邻居及全部发生时标题时才能迁移;不得仅凭 FORMAT-014 无标题锚点、当前分类、当前顺序、绝对索引、默认边界、相邻事件或后来状态猜测。待保存队列、自动重试、应急备份、普通导出、当前版本导入和核心存储必须冻结并往返同一精确形状和值。

### FORMAT-028 · v1 `task.restored` 精确详情

当 `eventType` 为 `task.restored` 时,`subjectType` 必须为 `task`,且 `details` 必须且只能包含 `categorySnapshot`、`status` 与 `position` 三个根字段:

```json
{
  "categorySnapshot": {
    "ref": {
      "kind": "custom",
      "categoryId": "318f47a2-3d81-4f5d-8a9c-123456789abc"
    },
    "name": "工作"
  },
  "status": "completed",
  "position": {
    "previousTask": {
      "kind": "task",
      "taskId": "018f47a2-3d81-4f5d-8a9c-123456789abc",
      "title": "恢复后前一项"
    },
    "nextTask": { "kind": "end" }
  }
}
```

`categorySnapshot` 必须精确符合 FORMAT-012,冻结恢复事务插入完成后任务实际进入的分类。删除时分类仍存在时,自定义分类分支必须复用同一分类 ID 并保存恢复发生时该分类的当前用户原文名称,不得复制 FORMAT-014 的旧 `categorySnapshotAtDeletion.name`;删除时分类已经不存在时,必须使用固定 Inbox 快照且不得保存名称。`status` 必须精确为语言无关值 `"open"` 或 `"completed"`,等于恢复完成后仍未改变的任务公共 `status`。`position` 必须且只能包含 `previousTask` 与 `nextTask`,分别复用 FORMAT-021 的方向严格联合,冻结任务插入完成后在实际分类、同一状态投影中的直接邻居。正常生产时不得生成 `unavailable`;两侧均为任务时必须引用两个不同的非主体任务。

一次有效恢复必须先按 RESTORE-004 在工作状态接受时证明任务仍为未到期垃圾箱任务,再只读取该任务当前 FORMAT-014 生命周期,按 RESTORE-002 选择实际分类和插入位置。分类与落位计算完成后,同一原子业务事务必须把生命周期整体替换为精确 `{ "kind": "active" }`,把原任务 ID 恰好一次插入 `taskOrderByCategory` 权威活动顺序,设置 `task.updatedAt = event.occurredAt`,并追加且只追加本事件。`details.categorySnapshot`、`details.status` 与 `details.position` 必须逐值对应该事务完成后的实际活动归属、任务公共状态和同状态直接邻居;`createdAt`、标题、备注、优先级与状态保持不变,任何现有任务的内容、相对顺序和 `updatedAt` 都不得因恢复被改写。实际落位属于本事件,不得另写移动事件。

事件类型已经唯一表达任务从垃圾箱恢复。详情不得保存删除时分类或位置、`deletedAt`、`expiresAt`、垃圾箱生命周期、恢复锚点、锚点命中情况、双锚点/单锚点/末尾回退原因、任务标题、备注、优先级、查看任务入口、反馈文案、界面或设备来源、绝对序号、数组下标、内部 rank/sort key、当前顺序副本、根级 `kind`、通用整实体 `before` / `after`、完整任务、`null` 或任何未知字段。任务 ID 与邻居标题只能存在于 FORMAT-021 明确定义的邻居 `task` 分支中;主体标题只由公共 `subject.title` 表达,恢复时间只由公共 `occurredAt` 表达。

本事件只记录恢复操作完成后的实际结果,用于审计、呈现与按实际恢复分类筛选;不得反向驱动该次或未来恢复、当前归属、当前顺序或后续拖拽。原删除现场继续由既有 FORMAT-027 `task.trashed` 事件独立保存,不得复制进本事件或要求两者的位置相同。任务或邻居后来改标题、移动、换分类、切换状态、软删除或不再相邻,以及恢复时自定义分类后来改名或被删除,都不得回写既有详情。再次恢复只有在任务后来再次有效软删除且重新满足资格时才能形成新的事件;对活动任务、已到期任务或其他无资格状态重复触发恢复必须完全无变化。

永久清理某个邻居或执行导入时到期过滤时,只按 FORMAT-021 把保留事件中的对应整个任务分支投影为精确 `{ "kind": "unavailable" }`;不得改变分类、状态或其他位置分支。永久清理本事件主体时必须按 ERASE-001 随该任务全部主体历史删除本事件;ERASE-003 只处理其他保留记录中的目标引用。

备份导入必须校验 FORMAT-028 自身严格形状、发生时引用和合法清理投影,但不得把旧恢复事件与任务后来当前分类、状态、顺序或生命周期强行对质,也不得重放历史来建立当前状态。旧格式只有在文件自身无歧义证明恢复完成后的实际分类及当时名称、未改变状态、插入后同状态双邻居及全部发生时标题时才能迁移;不得从当前任务、当前顺序、先前 FORMAT-027 删除现场、FORMAT-014 恢复锚点、RESTORE-002 默认回退、绝对索引、相邻事件或事件重放猜测缺失事实。待保存队列、自动重试、应急备份、普通导出、当前版本导入和核心存储必须冻结并往返同一精确形状和值。

### FORMAT-029 · v1 `category.created` 精确详情

当 `eventType` 为 `category.created` 时,`subjectType` 必须为 `category`,`subject` 必须按 FORMAT-016 精确保存新分类的不可变 `categoryId` 与创建时用户原文 `name`,且 `details` 必须且只能是精确空对象:

```json
{}
```

空对象是本事件完整且严格的详情 schema,不是缺少详情。`details` 必须存在且类型为 object;省略、`null`、数组、字符串或任何含字段对象都无效。分类 ID、创建时名称、事件类型、操作时间、操作顺序与操作内顺序已经分别由公共 `subject` 和 FORMAT-016 外壳唯一表达,不得在详情中重复。

创建成功时,同一原子业务事务必须建立一条符合 FORMAT-012 的自定义分类记录,把其 ID 追加到自定义 `categoryOrder` 末尾,推进操作顺序进度并追加且只追加一条本事件;事件 `subject.categoryId` / `subject.name` 必须与新分类记录逐字一致。主清单内联创建时本事件是该操作唯一事件并使用 `eventOrder = 0`。选择器内新建分类并归入既有任务时,同一事务必须先追加本事件 `(eventOrder = 0)`,再追加精确符合 FORMAT-025 的 `task.category_changed(eventOrder = 1)`;任务事件的目标分类 ID / 名称必须与本事件主体逐字一致,任务移动结果只由该任务事件表达。任一步失败时分类、分类顺序、任务归属、两条历史与操作顺序进度必须整体不提交。任务后来被永久清理时,该任务事件随主体历史删除而本分类事件独立保留,形成只剩 `eventOrder = 0` 的合法操作内缺口;导入与往返不得要求补建缺失任务事件或误判为主清单创建。反向只剩该操作的 `task.category_changed(eventOrder = 1)` 不可能由合法清理产生,必须拒绝。

详情不得保存分类 ID、名称、分类引用或快照、创建前后位置、相邻分类、绝对索引、内部排序键、当前 `categoryOrder`、是否为空、任务数量、任务 ID、关联任务事件、创建入口、主清单/选择器来源、提交方式、设备、语言、默认值、根级 `kind`、通用整实体 `before` / `after`、完整分类、`null` 或未知字段。分类创建固定追加到当前自定义分类末尾是当前状态事务规则,不是需要冻结的额外历史载荷;后来排序、重命名或删除分类都不得回写本事件,历史也不得用来重建当前分类记录或顺序。

历史呈现与筛选必须只用公共 `subject`:动作从 `eventType` 本地化为分类创建,名称显示创建时用户原文,分类筛选按不可变 `subject.categoryId` 匹配。分类后来重命名或删除不改变创建事件的名称或筛选身份。任务永久清理不得删除或改写独立分类创建事件;该事件没有任务引用,不得参与 FORMAT-021 或 ERASE-003 扫描。

当前版本导入、导出、核心存储、待保存队列与应急备份必须逐值保留精确 `{}`。显式受支持的已知旧版本必须先按其发布时正式 schema 验证;只有旧 `eventType` 与有效分类主体、时间和顺序能无歧义证明分类创建时,才可确定性移除该旧 schema 合法的重复身份、位置、UI 入口、任务关联、数量或默认元数据并生成 `{}`。未知字段、旧字段内部冲突、主体或类型不明确以及不符合所声明旧 schema 的记录必须拒绝。不得从当前分类、`categoryOrder`、分类首次出现、后来分类事件、配对 FORMAT-025 或历史重放推测创建事实。当前格式中缺失、`null` 或含额外字段的详情属于损坏数据,不得套用旧版本迁移规则修复。

### FORMAT-030 · v1 `category.renamed` 精确详情

当 `eventType` 为 `category.renamed` 时,`subjectType` 必须为 `category`,公共 `subject` 必须按 FORMAT-016 精确保存被改名分类的不可变 `categoryId` 与本次改名提交后保存的用户原文 `name`,且 `details` 必须且只能是:

```json
{
  "beforeName": "旧名称"
}
```

`beforeName` 必须是本次改名前分类记录中保存的用户原文名称;改名后的名称只由 `subject.name` 表达,不得在详情中加入 `afterName` 或其他副本。两个名称都必须是符合 CATEGORY-011 存储语义的非空字符串,并且 `beforeName !== subject.name`。当前生产必须先去除提交值首尾空白并校验非空与保留名称,再与自身当前名称逐字比较;相同是无变化操作,不得修改分类、时间或顺序,不得推进 `operationSequence`,也不得产生本事件或待保存项。只有真实变化的候选名称才与其他现存自定义分类比较唯一性。

成功改名时,同一原子业务事务必须把该 `subject.categoryId` 对应的当前分类记录名称从 `beforeName` 更新为 `subject.name`,推进操作顺序进度并追加且只追加一条本事件,固定 `eventOrder = 0`。分类不可变 ID、`categoryOrder`、`taskOrderByCategory`、任务记录、任务归属、任务状态、任务内容、任务优先级、任务生命周期与所有任务时间都必须保持不变,不得追加任务主体事件。任一步失败时当前分类名称、历史和操作顺序进度必须整体不提交。

详情不得保存分类 ID、分类引用或快照、分类记录、`afterName`、分类位置、前后相邻分类、绝对索引、内部排序键、`categoryOrder`、任务数量、任务 ID 或任务集合、入口、提交方式、设备、语言、根级 `kind`、通用整实体 `before` / `after`、完整分类、`null` 或未知字段。分类筛选只按公共 `subject.categoryId` 匹配;历史摘要与展开按 `beforeName → subject.name` 呈现,动作和方向词按当前界面语言本地化,两个用户名称逐字保留且不得翻译。搜索必须能通过本事件自身保存的旧名或新名命中,不得查询当前分类名称补值。

本事件一经提交不可改写。分类后来再次重命名、排序或删除不得改变既有 `beforeName`、`subject.name`、筛选身份或搜索事实;任务永久清理不得删除或改写独立分类重命名事件,因为本详情不含任务引用。当前分类集合、当前名称与 `categoryOrder` 只能读取当前分类记录,不得通过重放重命名历史推导、复原或覆盖。

当前版本导入、导出、核心存储、待保存队列与应急备份必须逐值保留精确 `{ beforeName }`。显式受支持的已知旧版本必须先按其发布时正式 schema 验证;若旧 schema 合法地同时保存改名前后名称,其旧新名称都必须有效,且旧版处理后的新名称必须与公共 `subject.name` 逐字一致,然后才能确定性丢弃重复的新名称并把旧名称投影为 `beforeName`。旧值冲突、未知或额外字段、主体或类型不明确、无法仅由旧记录自身确定名称方向以及不符合所声明旧 schema 的记录必须拒绝。不得从当前分类名称或顺序、首次出现、后来分类事件、相邻历史或历史重放猜测旧名或新名。当前 v1 中缺失 `beforeName`、值为 `null`、数组或字符串详情、含 `afterName` 或其他额外字段以及新旧名称相同的记录属于损坏数据,不得套用旧版本迁移规则修复。

### FORMAT-031 · v1 `category.reordered` 精确详情

当 `eventType` 为 `category.reordered` 时,`subjectType` 必须为 `category`,公共 `subject` 必须按 FORMAT-016 精确保存被移动自定义分类的不可变 `categoryId` 与排序发生时用户原文 `name`,且 `details` 必须且只能包含 `beforePosition` 与 `afterPosition`:

```json
{
  "beforePosition": {
    "previousCategory": { "kind": "start" },
    "nextCategory": {
      "kind": "category",
      "categoryId": "018f47a2-3d81-4f5d-8a9c-123456789abc",
      "name": "项目"
    }
  },
  "afterPosition": {
    "previousCategory": {
      "kind": "category",
      "categoryId": "118f47a2-3d81-4f5d-8a9c-123456789abc",
      "name": "稍后"
    },
    "nextCategory": { "kind": "end" }
  }
}
```

两个位置都必须且只能包含 `previousCategory` 与 `nextCategory`。前侧邻居必须且只能是精确 `{ "kind": "start" }` 或精确 `{ "kind": "category", "categoryId": <分类 UUID>, "name": <发生时用户原文名称> }`;后侧邻居必须且只能是精确 `{ "kind": "end" }` 或同一严格 `category` 分支。`start` / `end` 只表示自定义分类序列的顶部 / 末尾,固定收件箱不属于该序列且绝不能成为邻居;不得在任一方向接受 Inbox、方向相反的边界、裸分类 ID、`null`、`unavailable` 或额外字段。

`beforePosition` 冻结主体从操作前权威 `categoryOrder` 移除前的直接邻居,`afterPosition` 冻结主体插入操作后权威 `categoryOrder` 后的直接邻居。每个位置内若两侧都是 `category` 分支,两个 ID 必须不同;任一邻居 ID 都必须不同于公共 `subject.categoryId`。同一个合法邻居可以跨前后位置重复出现,例如向后跨过一项时原 `nextCategory` 就是新 `previousCategory`;同一 ID 每次出现的发生时 `name` 必须逐字一致。不同 ID 在同一事件中的名称必须符合 CATEGORY-011 的发生时唯一名称语义,并且不得与主体发生时名称相同。真实排序至少还有一个其他自定义分类,所以任一位置都不得同时是 `start / end`。

当前生产只有两个位置真实不同时才能接受分类排序;放回原位、无有效落点、取消或只有一个自定义分类时不得改变 `categoryOrder`、历史、`operationSequence` 或待保存数量。一次有效排序必须在同一原子业务事务中只改变主体分类 ID 在 `categoryOrder` 中的位置,推进操作顺序并追加且只追加一条本事件,固定 `eventOrder = 0`;分类记录及名称、`taskOrderByCategory`、任务记录、任务归属、任务顺序、任务状态、内容、优先级、生命周期与全部任务时间必须保持不变,不得追加任务主体事件。任一步失败时分类顺序、历史和操作顺序进度必须整体不提交。

详情不得重复主体分类 ID 或名称,不得保存 Inbox、分类记录或通用 `CategorySnapshot`、绝对序号、数组下标、内部 rank/sort key、完整或部分 `categoryOrder`、任务或任务数量、拖拽区域、手柄、指针 / 触摸、阈值、插入标记、折叠 / 滚动状态、设备、语言、根级 `kind`、通用整实体 `before` / `after`、`null` 或未知字段。分类筛选只按公共 `subject.categoryId` 匹配被移动分类,不得因某分类只作为邻居出现就把本事件归入该邻居;位置快照只用于审计与呈现,不得驱动当前排序或后续拖拽。

紧凑摘要只从 `afterPosition` 生成:前侧是 `start` 时显示移到自定义分类顶部,后侧是 `end` 时显示移到末尾,其余位置显示移到发生时前邻居之后;展开必须显示完整 `beforePosition → afterPosition`。边界与动作按当前界面语言本地化,主体和邻居用户名称逐字保留且不得翻译。主体或邻居后来重命名、再次排序或删除时,既有 ID、名称与位置快照不得回写;任务永久清理不得删除或改写不含任务引用的本事件。当前分类集合与 `categoryOrder` 只能读取当前状态,不得重放排序历史重建、校验或覆盖。

当前版本导入、导出、核心存储、待保存队列与应急备份必须逐值保留上述精确结构。当前 v1 始终拒绝相同前后位置,因为分类邻居没有永久清理后的去身份化分支,合法记录不会像 FORMAT-024 那样收敛。显式受支持的已知旧版本必须先按其发布时正式 schema 验证;只有旧记录自身能无歧义证明被移动分类、排序发生时主体与邻居名称、移动前后方向严格的直接自定义分类邻居或边界以及真实位置变化时,才可确定性投影为 FORMAT-031。旧 schema 合法的绝对索引、内部排序值、UI 或完整顺序副本可在验真后丢弃,但不得从导入时当前分类、当前名称、当前 `categoryOrder`、后来事件、相邻历史或历史重放补造任一邻居、名称、边界或方向。未知、冲突、主体 / 类型 / 方向不明及不符合所声明旧 schema 的记录必须拒绝;当前 v1 损坏不得改走旧版本迁移路径。

### FORMAT-032 · v1 `category.deleted` 精确详情

当 `eventType` 为 `category.deleted` 时,`subjectType` 必须为 `category`,公共 `subject` 必须按 FORMAT-016 精确保存被删除自定义分类的不可变 `categoryId` 与删除发生时用户原文 `name`,且 `details` 必须且只能包含 `affectedTaskCount`:

```json
{
  "affectedTaskCount": 3
}
```

`affectedTaskCount` 必须是 JSON 非负安全整数。它精确等于删除操作被当前工作状态接受时,仍在该分类活动权威顺序中并由本次事务实际迁入固定收件箱的任务数量。空活动分类必须保存 `0`;已经在垃圾箱、不在活动顺序中的任务,只在历史上曾属于该分类的任务,以及分类标题入口草稿都不得计入。该值不是当前仍存在、仍可恢复或仍有历史的任务数量。

正常生产时,若计数为 N,同一原子操作必须先写本事件 `(eventOrder = 0)`,再按删除前来源权威总顺序写恰好 N 条 FORMAT-026 `task.moved_to_inbox_by_category_deletion(eventOrder = 1...N)`。同一事务还必须从当前分类集合和 `categoryOrder` 删除主体分类,把这 N 个活动任务作为连续分组追加到 Inbox,保持相对顺序及状态,按既定规则更新每个迁移主体时间,并条件消费同一次确认授权的分类入口草稿;任一步失败时全部不提交。N 为 `0` 时只写分类事件,不得写 FORMAT-026 任务事件。

公共 `subject` 已经拥有被删分类 ID / 名称,FORMAT-026 已逐任务保存迁移事实,因此详情不得再保存分类身份或快照、任务 ID / 标题 / 内容数组、活动或垃圾箱任务集合、来源或目标位置、Inbox 快照、分类顺序、任务顺序、确认文案、草稿内容或代次、删除原因、时间、UI/设备/语言、根级 `kind`、完整分类、通用实体 `before` / `after`、`null` 或未知字段。历史紧凑摘要与展开可以按当前语言组合公共主体、计数和固定 Inbox 语义;数字含义不随语言切换,用户分类名称逐字保留。

任务后来永久清理时,其 FORMAT-026 主体事件可以按既定规则删除并留下 `eventOrder` 缺口,但本事件及 `affectedTaskCount` 必须保持发生时原值。保留的同操作 FORMAT-026 事件可以少于 N、甚至全部消失,但每条仍必须使用 `1...N` 内原有且唯一的 `eventOrder`,并继续匹配本事件主体与操作元数据;不得按剩余事件、当前任务、当前 Inbox、当前垃圾箱或历史重放重算数量。任务永久清理也不得把本详情改为 `unavailable` 或移除独立分类删除事实。

当前版本导入、导出、核心存储、待保存队列与应急备份必须逐值保留该单字段对象。当前 v1 缺失字段、额外字段、负数、小数、超出安全整数范围、字符串、布尔值、`null`、数组或对象值全部拒绝。导入必须接受永久清理后“计数大于现存迁移事件数”的合法历史,同时拒绝现存匹配迁移事件数大于计数、任一迁移事件 `eventOrder` 超出 `1...N`、N 为 `0` 却仍有迁移事件,以及没有匹配分类删除事件的孤立迁移记录。

显式受支持的已知旧版本必须先按其发布时正式 schema 验证。只有旧记录自身保存可靠发生时数量,或该旧 schema 明确保证候选操作处于永久清理前且以完整连续 `1...N` 迁移事件集合无歧义证明原始数量时,才可确定性投影为 `{ affectedTaskCount }`;验真后可丢弃旧版合法的任务数组、目标、确认/UI 或其他冗余元数据。不得从导入时当前状态、剩余迁移事件数、最大 `eventOrder`、当前分类/Inbox、后来事件或历史重放猜测已经可能因永久清理丢失的原始数量。未知、冲突或不符合所声明旧 schema 的记录必须拒绝;当前 v1 损坏不得改走旧迁移路径。

## 最小结构示例

```json
{
  "format": "desktop-pull-backup",
  "formatVersion": 1,
  "schemaVersion": 1,
  "appVersion": "1.0.0",
  "exportedAt": "2026-07-24T00:00:00.000Z",
  "data": {
    "meta": {
      "nextOperationSequence": "1"
    },
    "categories": [],
    "tasks": [],
    "categoryOrder": [],
    "taskOrderByCategory": [
      {
        "categoryRef": { "kind": "inbox" },
        "taskIds": []
      }
    ],
    "drafts": [],
    "history": []
  }
}
```

示例说明根层 envelope、已锁定的操作顺序进度和无任务时仍必需的收件箱分组;空 `drafts` 受 FORMAT-015 约束,空 `history` 不替代 FORMAT-016 至 FORMAT-032 已锁定的公共外壳、精确事件类型、详情最小结构原则、内容变化分支、完成状态详情、历史任务邻居联合、任务创建详情、优先级变化详情、组内排序详情、主动跨分类归类详情、分类删除派生批量迁移详情、软删除详情、恢复详情、分类创建空详情、分类重命名详情、分类排序详情及分类删除计数详情。

## 验收 Gate

- 导出完整备份,验证产物是单个未压缩 UTF-8 JSON 文件且根值为 object。
- 验证六个必填根字段存在、类型正确,`format` 值固定且 `exportedAt` 使用 UTC 固定毫秒精度。
- 在没有原设备数据和网络的环境中导入备份,验证文件本身包含恢复所需的全部内容。
- 分别删除或破坏每个必填根字段,验证导入在写入前拒绝该文件。
- 提供 ZIP、多文件目录或引用外部资源的备份,验证第一版不生成也不接受这些结构。
- 导出全局、收件箱分类标题和自定义分类标题三个入口的草稿,验证每条精确具有 FORMAT-015 四个字段,前两者目标都推导为收件箱但仍是两个独立入口,且记录不含目标分类副本。
- 分别让草稿缺失或增加字段、使用 `null`、未知入口、悬空 custom 分类引用、同一语义入口重复、重复代次、非规范 UUID 代次或无效 `cursorOffset`,验证导入在写入前拒绝整个备份。
- 保存纯空白草稿,验证标题逐字往返且仍不创建任务;把输入变为空后验证草稿记录不存在,再次输入时使用新的代次。
- 用包含 BMP 字符和代理对字符的标题往返不同客户端,验证 `cursorOffset` 按 UTF-16 code unit 解释并恢复折叠光标,且不生成选区、焦点或键盘字段。
- 删除存在草稿的自定义分类,验证健康态与待保存应急备份都不包含已确认的 `entry + generation`,不存在悬空 custom 入口;确认打开后换代时,旧确认不能使新代次从备份消失。
- 分别导出任务主体和分类主体事件,验证两者具有明确判别和各自必填字段;向分类主体事件加入任务占位字段或移除主体判别时,导入在写入前拒绝整个备份。
- 分别导出任务与分类历史记录,验证每条恰好具有 FORMAT-016 七个顶层字段,`subject` 分别严格为 `{ taskId, title }` 或 `{ categoryId, name }`;缺失、额外、未知、`null`、主体分支不匹配或把主体字段平铺到顶层时,导入在写入前拒绝整个备份。
- 逐一往返 FORMAT-017 的 14 个精确 `eventType`,验证每个值只映射到表中一个主体类型和一个动作组;分类创建只进入“分类管理”而不进入任务“创建”。
- 分别把 `eventType` 改为未知值、大小写变体、带前后空白值、本地化动作名称或完整显示句子,以及让 `task.*` / `category.*` 与主体类型错配,验证全部在写入前拒绝。
- 分别保存只改标题、只改备注和同一次正式保存同时修改两者的事件,验证都只使用一条 `task.content_changed`,并分别精确得到 `{ categorySnapshot, beforeTitle }`、`{ categorySnapshot, beforeNotes, afterNotes }` 与 `{ categorySnapshot, beforeTitle, beforeNotes, afterNotes }`;不得按字段组合新增枚举值。
- 对 FORMAT-017 的 14 个类型逐一选择 `details` schema,验证外层 `eventType` 是唯一事件判别,每个值只解析到其事件专属严格对象;向 `details` 根部加入 `kind`、重复公共外壳或主体字段、动作组、完整任务或分类记录以及通用整实体 `before` / `after` 快照包时均拒绝。
- 在任一 `details` 层级加入 `null`、未知或额外字段,以及用空占位、伪造默认值或通用不可用对象表达不存在的一侧,验证均拒绝;事件实际需要的 `CategorySnapshot` 或位置联合等嵌套严格类型仍可按其自身 schema 使用判别字段。
- 对只改标题和同时修改两者的事件,验证 `subject.title` 是保存后的标题且 `beforeTitle !== subject.title`;对只改备注的事件,验证 `subject.title` 保持当时有效标题;对含备注的两个分支,验证 `beforeNotes !== afterNotes`,空字符串和多行用户原文均逐字往返。
- 分别向 `task.content_changed.details` 加入 `afterTitle`、`changedFields`、根级 `kind`、`null`、未知字段、部分备注对或与另一分支混合的字段,以及构造相等的新旧值、缺失或非法 `categorySnapshot`、空对象,验证全部拒绝;待保存重试与应急备份往返后,保存后 `subject.title`、发生时分类快照和原精确形状均不被后来状态或分类重算。
- 分别往返 `task.completed` 与 `task.reopened`,验证 `details` 只含合法 `categorySnapshot` 且动作方向只由 `eventType` 表达;省略详情或快照、改为 `null`、数组或空对象,以及加入 `beforeStatus`、`afterStatus`、`status`、布尔值、根级 `kind` 或任意额外字段时全部拒绝。任务后来移动、分类改名或删除后,快照与分类筛选结果仍保持发生时事实;重复设置相同状态不产生事件,导入校验不重放历史或从当前任务反推事件前态。
- 为使用历史位置字段的事件分别生成前侧 `start`、前侧 `task`、后侧 `task` 与后侧 `end` 正例,验证边界分支精确一个字段,任务分支精确为 `{ kind, taskId, title }`,任务 ID 指向发生时同分类同状态序列中的另一紧邻任务且标题逐字冻结发生时用户原文。
- 把前侧改为 `end`、后侧改为 `start`,或向 FORMAT-021 分支加入裸任务 ID、自引用、悬空 ID、缺失标题、当前标题补值、`null`、未知字段、边界标题及任意额外字段,验证生产、导出与导入均拒绝;FORMAT-014 恢复锚点仍必须拒绝 `title`,不得与历史邻居联合串型。
- 在历史邻居事件产生后依次修改邻居标题、移动、换分类、切换状态和软删除邻居,验证任务分支及发生时标题完全不变,历史快照不改变当前顺序、拖拽落点或垃圾箱恢复定位;正常业务生产者不得主动生成 `unavailable`。
- 永久清理邻居以及进入清理待完成逻辑投影时,验证所有保留事件 schema 已声明的对应任务分支原子变为精确 `{ "kind": "unavailable" }`,不保留 ID、标题或额外字段;任一替换失败时删除与全部替换一起回滚。
- 导入一份原本合法但邻居目标在导入时到期的备份,验证先按原文件解析任务引用,再由 IMPORT-006 在同一覆盖事务中排除目标并把保留历史邻居改为 `unavailable`;原文件本就悬空、自引用或结构损坏时必须在投影前拒绝,不得以不可用掩盖。
- 分别从全局入口、收件箱分类标题入口和自定义分类标题入口创建任务,验证 `task.created.details` 精确只有 `categorySnapshot` 与 `position`,初始分类由入口确定且 `position` 精确只有方向正确的 `previousTask` / `nextTask`;`subject.title` 是提交原文,不重复保存于详情。
- 在空目标分类、已有未完成任务的目标分类及混合完成状态分类中创建任务,验证位置只描述插入完成后的同分类未完成序列:首条会话任务前侧为 `start`,后侧为当时未完成任务或 `end`,已完成任务不成为邻居。
- 在同一快速新增会话依次提交 `A`、`B`、`C`,验证三条创建历史依次冻结实际位置且 `B` 的前邻居为 `A`、`C` 的前邻居为 `B`;后续创建不得回写前一条历史,刷新、重试与备份往返保持同一快照。
- 向 `task.created.details` 加入或遗漏根字段,把 `position` 改为平铺邻居、缺失一侧、加入未知字段、使用方向错误边界、让两侧任务引用相同对象,或加入标题、时间、状态、优先级、备注、生命周期、入口、草稿代次、提交键、会话、内部排序键、绝对序号、`before`、`null`、根级 `kind` 或完整任务记录,验证生产、导出和导入全部拒绝。
- 创建后依次改标题、移动、换分类、切换状态、软删除或在周围插入其他任务,验证原 `categorySnapshot`、`position` 与邻居发生时标题不变且不驱动当前顺序;永久清理邻居时只按 FORMAT-021 把对应整个任务分支原子改为精确 `unavailable`,创建事件主体被清理时仍按 ERASE-003 删除整条主体历史。
- 在自定义分类中创建后改名或删除该分类,验证 FORMAT-022 仍保留原分类 ID 与发生时用户原文名称,历史摘要、展开和分类筛选不从当前分类记录补值或漂移。
- 从任务行菜单和编辑器分别把任务从一个合法优先级改为另一合法值,验证都只产生一条 `task.priority_changed`,且 FORMAT-023 `details` 精确为 `{ categorySnapshot, beforePriority, afterPriority }`;两值属于 `P0` 至 `P5` 且不同,任务新值等于 `afterPriority`,`updatedAt === occurredAt`,分类、状态和顺序不变。
- 对同一任务连续执行 `P3 → P1 → P5`,再改标题、移动、换分类、完成或软删除,验证两条事件分别永久冻结 `P3 → P1` 与 `P1 → P5` 及各自发生时分类,历史显示和分类筛选不读取后来当前优先级、标题或归属。
- 向 `task.priority_changed.details` 遗漏或加入字段,使用非法、相等、`null`、本地化或大小写变体优先级,以及加入位置、邻居、排序键、状态、标题、时间、控件来源、设备形态、根级 `kind`、通用整实体 `before` / `after` 或完整任务记录,验证生产、导出和导入全部拒绝。重复选择当前优先级不得改变任务、时间、顺序或历史。
- 在同一分类的未完成序列 `[A, B, C, D]` 中把 `B` 移到 `C` 之后,验证 FORMAT-024 精确保存一份发生时分类、`status: "open"`、原位置 `A / C` 与新位置 `C / D`;允许 `C` 跨两个位置重复出现,但每个位置内的两侧任务必须不同且都不是主体。
- 分别把未完成和已完成任务移到同状态序列顶部、末尾及中间,验证两个位置都精确使用 FORMAT-021 的方向边界或发生时任务快照,分类与状态只保存一次;任务顺序、主体 `updatedAt` 和一条 `task.reordered` 在同一事务提交,分类、状态和邻居任务时间不变。
- 向 `task.reordered.details` 遗漏或增加根字段,使用非法、本地化或 `null` 状态,把任一位置平铺、缺少一侧、交换方向、使用裸 ID、自引用、同一位置两侧引用同一任务、正常生产 `unavailable`,或加入拖拽来源、手势、阈值、设备形态、绝对序号、数组下标、内部排序键、当前顺序、时间、根级 `kind`、通用整实体 `before` / `after` 或完整任务,验证生产、导出和导入全部拒绝。FORMAT-021 邻居 `task` 分支仍必须恰含另一任务的 `taskId` 与发生时 `title`;在这些合法分支之外另加任务 ID、标题、主体 ID 或主体标题副本时必须拒绝。
- 把任务放回原位置,验证没有顺序、时间、历史或操作顺序变化;构造不含 `unavailable` 且前后位置完全相同的事件时必须拒绝。随后永久清理足以区分两个位置的多个邻居,验证相应分支各自变为精确 `unavailable`,即使两个位置因此结构相同也能合法导出与导入且不被误判为原位拖拽。
- 在组内排序后修改主体或邻居标题、移动、换分类、切换状态或软删除,验证 FORMAT-024 的发生时分类、状态和两组位置不变且不驱动当前顺序;导入不重放历史、不与最终顺序或当前状态对质。永久清理主体时整条事件删除,永久清理邻居时只按 FORMAT-021 替换对应嵌套任务分支。
- 分别把未完成与已完成任务从收件箱移入非空自定义分类,验证 FORMAT-025 精确保存一次不变 `status`、来源分类及移除前位置、目标分类及插入后位置;来源与目标分类身份不同,全部正常任务邻居 ID 跨两侧互异且非主体,只有主体归属、顺序和 `updatedAt` 原子改变。
- 通过任务行与编辑器选择器移动任务,验证 FORMAT-025 的 `target.position.previousTask` 为 `start`,后侧为目标状态序列原首项或 `end`;两条路径的持久详情逐值相同且不含入口。从选择器内新建分类并归入时,同一操作先有 `category.created`,目标位置为 `start / end`,再有该任务事件。
- 让来源分类同状态序列只有主体且目标同状态序列为空,验证 FORMAT-025 的来源与目标位置都可为 `start / end`;不得沿用 FORMAT-024 的位置不同规则拒绝真实跨分类变化。选择当前分类则不得改变归属、位置、时间、历史、操作顺序或待保存数量。
- 向 `task.category_changed.details` 遗漏或增加根字段,使用非法、本地化或 `null` 状态,相同来源与目标分类引用,平铺或缺边位置、错向边界、裸 ID、自引用、同一位置双侧同任务、来源与目标重复同一正常任务 ID、正常生产 `unavailable`,以及加入界面入口、手势、设备、绝对索引、内部排序键、当前顺序、根级 `kind`、通用整实体新旧包或完整任务,验证生产、导出和导入全部拒绝。
- 跨分类移动后再改标题、移动、切换状态、重命名或删除来源或目标分类,验证 FORMAT-025 快照不回写,分类筛选只匹配发生时目标分类而展开仍显示来源;导入不重放历史或与当前归属和顺序对质。永久清理邻居只替换对应 FORMAT-021 分支,多个分支收敛为 `unavailable` 后事件仍可往返;永久清理主体时整条事件删除。
- 分别通过跨分类拖拽、任务行选择器、编辑器选择器和选择器内新建分类后归入改变分类,验证任务统一使用 `task.category_changed` 且不保存界面来源;最后一种场景两条事件共享 `occurredAt` / `operationSequence`,`category.created(eventOrder = 0)` 后紧跟任务事件 `(eventOrder = 1)`,且任务事件目标分类 ID / 名称与分类事件主体逐字一致。
- 删除来源总顺序为 `A(open), B(completed), C(open)` 的分类并让收件箱已有不同状态任务,验证批次仍按 `A, B, C` 连续追加且任务事件按该总顺序取得 `eventOrder = 1, 2, 3`;FORMAT-026 的每个 `source.position` 取整批迁移前来源同状态邻居,`targetPosition` 取整批完成后最终收件箱同状态邻居,不得保存逐项插入中间态或按状态把批次改成 `A, C, B`。
- 对批次内部任务生成 FORMAT-026,验证根部精确为 `{ status, source, targetPosition }`,`source` 精确为 `{ categorySnapshot, position }` 且只接受与 `category.deleted.subject` 一致的 Custom 快照;目标 Inbox 不另存快照。允许同一批次邻居以相同 ID / 标题在来源和目标同方向槽位重复,但每个位置内双任务邻居仍必须不同且非主体,正常生产不得直接生成 `unavailable`。
- 向 FORMAT-026 增加 `target`、收件箱名称或快照、原因、批次 ID、状态或分类新旧副本、绝对索引、内部顺序、当前 Inbox 尾部、确认/草稿/UI 字段、根级 `kind`、完整任务、`null` 或其他未知字段,以及构造来源 Inbox、来源快照与分类删除主体不一致、孤立迁移事件、临时目标位置、错误操作共享或按状态分配 `eventOrder`,验证生产、导出和导入全部拒绝。
- 永久清理一个在其他 FORMAT-026 事件的来源和目标位置重复出现的邻居,验证所有对应槽位在同一事务都变为精确 `unavailable`;再清理足以让 `previousTask` 与 `nextTask` 等多个槽位都投影为 `unavailable` 的不同邻居,验证无身份分支可以跨方向结构重复并使位置收敛,不得按 `taskId` 重复拒绝;再永久清理若干迁移主体,验证 `category.deleted` 原受影响数量不变,任务事件数量可以减少且 `eventOrder` 留洞。导入接受该合法保留态而不重编号,但先按原文件校验仍可识别引用,且不得按当前顺序、当前收件箱尾部或 D-009 规则猜测旧位置。
- 删除含任务的分类,验证同一操作恰有一条 `category.deleted` 和逐任务 `task.moved_to_inbox_by_category_deletion`,目标均为收件箱且顺序符合 HIST-006;用户直接移入收件箱不得使用派生类型。
- 分别从收件箱与自定义分类软删除未完成和已完成任务,验证 FORMAT-027 `details` 精确为 `{ categorySnapshot, status, position }`,`position` 只描述主体移出前同分类同状态直接邻居;两侧任务邻居不同且非主体,正常生产不得生成 `unavailable`。
- 验证一次有效软删除原子移除唯一活动顺序引用、写入 FORMAT-014 垃圾箱生命周期并追加且只追加一条 `task.trashed`:事件 `occurredAt`、任务 `updatedAt` 与生命周期 `deletedAt` 相等,到期时间恰晚 30 天,详情分类与状态分别等于生命周期分类快照和任务公共状态,且带标题历史邻居与无标题恢复锚点表达同一删除现场但保持不同严格 schema。
- 在确认删除前制造有效待保存内容编辑,验证内容变化先以更早操作保存或排队,随后删除事件主体使用最新有效标题而 FORMAT-027 不复制标题、备注或优先级。取消确认、过期确认、重复删除及删除非活动任务不得改变状态、时间、历史或操作顺序。
- 向 FORMAT-027 增加删除/到期时间、生命周期、恢复锚点、标题、内容、优先级、原因、确认/UI/设备、绝对索引、内部顺序、当前顺序、根级 `kind`、整实体新旧包、`null` 或未知字段,或构造非法状态、方向错位、自引用、同位置双侧同任务,验证生产、导出和导入全部拒绝。在同一次正常生产或待保存意图物化中构造详情分类/状态/位置与新建垃圾箱生命周期、任务状态或删除时间不一致,验证该操作整笔不提交且不能成为可导出状态;不得把此生产原子性 Gate 错用于对质导入文件中的旧删除事件与后来当前生命周期。
- 删除后恢复、修改、移动、再次删除并再次恢复,验证每次删除分别冻结自己的发生时标题、分类、状态与位置且旧事件不回写;导入不要求旧删除事件主体当前仍在垃圾箱,不重放历史或从当前任务、无标题恢复锚点、当前顺序、默认边界猜测 FORMAT-027。恢复落位只读取当前 FORMAT-014 生命周期,从不读取旧历史位置或移动其他任务。
- 永久清理 FORMAT-027 邻居时,验证保留历史中的整个带标题任务分支投影为精确 `unavailable`;若主体仍在垃圾箱且同一目标也被恢复锚点引用,该无标题锚点按 FORMAT-014 独立投影。永久清理删除事件主体时整条 `task.trashed` 连同删除现场消失。
- 分别恢复收件箱与自定义分类中的未完成和已完成任务,验证 FORMAT-028 `details` 精确为 `{ categorySnapshot, status, position }`,`categorySnapshot` 与 `position` 对应插入完成后的实际结果,状态与任务公共 `status` 同值,每个任务邻居非主体且双任务邻居不同,正常生产不得生成 `unavailable`。
- 删除后改名原分类再恢复,验证 FORMAT-028 保存同一分类 ID 和恢复时当前用户原文名称而非删除时旧名称;删除原分类再恢复,验证只保存固定 Inbox 快照并冻结收件箱对应状态序列末尾的实际位置。双锚点、单锚点和无有效锚点各路径都只影响最终位置值,详情不保存命中或回退原因。
- 恢复时验证只从当前 FORMAT-014 生命周期计算分类与落位,同一事务移除全部垃圾箱元数据、复用原 ID、恰好一次插入权威顺序、设置 `updatedAt = occurredAt` 并追加且只追加 FORMAT-028;任务内容、优先级、状态、`createdAt`、现有任务相对顺序及其时间均不改变,也不另写移动事件。
- 向 FORMAT-028 增加删除现场、垃圾箱时间或生命周期、恢复锚点、命中/回退原因、标题、内容、优先级、反馈/UI/设备、绝对索引、内部顺序、当前顺序、根级 `kind`、整实体新旧包、`null` 或未知字段,或构造非法分类/状态、方向错位、自引用、同位置双侧同任务,验证生产、导出和导入全部拒绝。
- 恢复后修改、移动、切换状态、再次删除和再次恢复,验证每次恢复分别冻结自己的实际分类、状态与插入后位置且旧事件不回写。导入不得拿旧 FORMAT-028 与后来当前状态对质、重放历史或从先前 FORMAT-027、FORMAT-014 锚点、默认回退、当前顺序或相邻事件补造。
- 永久清理 FORMAT-028 邻居时,验证保留历史中的整个任务分支投影为精确 `unavailable` 而分类、状态与另一侧不变;永久清理恢复事件主体时,该事件随主体全部历史消失。对活动任务、已到期任务或其他无资格状态触发恢复,验证不改变状态、时间、历史、操作顺序或待保存数量。
- 分别从主清单和任务分类选择器创建自定义分类,验证 `category.created.details` 都精确为 `{}`,公共 `subject` 保存同一新分类 ID 与创建时用户原文名称;前者只产生 `eventOrder = 0` 的分类事件,后者与 FORMAT-025 任务事件共享时间和操作顺序并固定为 `eventOrder = 0 / 1`。
- 向 FORMAT-029 详情加入分类 ID、名称、分类快照、位置、相邻分类、任务数量、任务 ID、入口、提交方式、设备、语言、默认值、内部顺序、根级 `kind`、整实体新旧包或任意未知字段,以及把 `{}` 改为省略、`null`、数组或字符串,验证生产、导出和当前版本导入全部拒绝。
- 创建分类后重命名、排序并删除它,验证原 `category.created` 仍按创建时 `subject.name` 呈现、按同一不可变 `subject.categoryId` 筛选且 `details` 保持 `{}`;当前分类记录与顺序不从历史重建,任务永久清理不删除或改写该独立分类事件。
- 永久清理选择器创建并归入的任务后导出和导入,验证同一操作只剩 FORMAT-029 分类事件 `(eventOrder = 0)` 仍合法且不补建任务事件;构造只剩 FORMAT-025 `task.category_changed(eventOrder = 1)` 的反向孤立记录时拒绝。
- 迁移显式受支持的已知旧版本 `category.created`,验证先按该版本正式 schema 校验,再确定性移除其中合法的重复身份、位置、UI 入口、任务关联、数量或默认元数据并生成 `{}`;未知、冲突、主体或类型不明确及不符合声明旧 schema 的记录拒绝。当前格式缺失、`null` 或含额外字段的详情不得伪装成旧版本修复,也不得从当前分类、顺序、后来事件或历史重放猜测创建。
- 把自定义分类从 `工作` 重命名为 `项目`,验证同一事务只更新该分类记录名称、推进一次操作顺序并生成 `category.renamed(eventOrder = 0)`:公共 `subject` 保存原分类 ID 与新名称 `项目`,`details` 精确为 `{ "beforeName": "工作" }`;分类顺序、任务顺序、任务归属与全部任务字段不变且没有任务事件。
- 把改名输入处理为当前有效名称,验证分类、历史、操作顺序和待保存数量完全不变。分别让 `beforeName === subject.name`,或把 `category.renamed.details` 改为缺失、`null`、数组、字符串、空对象、加入 `afterName`、分类 ID、位置、任务、UI、根级 `kind` 或其他未知字段,验证生产、导出和当前版本导入全部拒绝。
- 连续执行 `A → B → C`,再排序或删除该分类,验证两条改名事件分别永久保留 `A → B` 与 `B → C`,都按同一公共 `subject.categoryId` 筛选,搜索可从各事件自身命中旧名或新名,且不查询当前分类名称、不重放历史或改写早期事件。切换中英文时只翻译动作和方向词,名称 `A`、`B`、`C` 保持用户原文。
- 永久清理任意任务,验证独立 `category.renamed` 及 `{ beforeName }` 完全不变且不参与任务引用扫描。健康存储、待保存重试、普通备份与应急备份往返后,验证公共新名称和详情旧名称逐值不变。
- 迁移显式受支持且旧 schema 合法保存旧新名称的 `category.renamed`,验证只有旧版新名称按该版本规则处理后与公共 `subject.name` 逐字一致时,才丢弃重复新名称并生成精确 `{ beforeName }`;新名称冲突、名称方向不明、类型或主体不明、未知字段及不符合旧 schema 的记录全部拒绝。当前 v1 损坏记录不得借旧迁移修复,也不得从当前分类、顺序、后来事件、相邻历史或重放推断。
- 在固定收件箱下方至少建立三个自定义分类,分别把中间分类移到自定义序列顶部、末尾和另一中间位置,验证 FORMAT-031 精确为 `{ beforePosition, afterPosition }`,每个位置只含方向严格的 `previousCategory` / `nextCategory`;首个 Custom 的前侧始终是 `start` 而不是 Inbox。有效排序只原子改变 `categoryOrder`、推进一次顺序并写唯一 `category.reordered(eventOrder = 0)`,分类记录、任务与全部任务时间不变。
- 让主体向下只跨过一个分类,验证该分类可同时作为 `beforePosition.nextCategory` 与 `afterPosition.previousCategory`;再反向相邻移动,验证同一 ID 可同时作为原前邻居与新后邻居,且重复分支的发生时名称逐字一致。不得套用 FORMAT-025 的四槽全局互异约束;每个位置内部的双分类邻居仍必须不同且全部邻居非主体。
- 向 FORMAT-031 省略或增加根字段,把位置平铺、缺少一侧、交换 `start` / `end` 方向,使用 Inbox、`unavailable`、裸分类 ID、FORMAT-012 分类快照、FORMAT-021 任务邻居、主体自引、同一位置双侧同 ID、同一跨位置 ID 携带不同名称、相同前后位置、单一主体的 `start / end` 位置、`null`、数组、绝对索引、rank/sort key、当前或完整 `categoryOrder`、任务、拖拽/UI/设备/语言或整实体新旧包,验证生产、导出和当前 v1 导入全部拒绝。原位放下、无效落点与取消不入队、不消耗顺序。
- 排序后重命名、再次排序或删除主体及任一邻居,验证公共主体和四槽发生时 ID / 名称逐值不变且不要求解析当前分类;按分类筛选只匹配被移动主体,名称搜索读取事件自身主体与邻居快照,摘要只读 `afterPosition`,展开显示完整前后位置。任务永久清理不改写本事件,导入不与当前 `categoryOrder` 对质且不重放历史。
- 让健康事务、待保存补写、普通 / 应急备份及当前 v1 导入导出往返同一 FORMAT-031 值和稳定键,验证重试不按后来名称或顺序重算。迁移显式受支持的旧记录时,只有旧 schema 自身证明主体、四个方向位置、发生时名称、边界及真实变化才可确定性投影;旧版专属 Inbox 首部哨兵仅在其正式 schema 明确定义时迁移为 `start`。只有索引 / 排序键 / 当前顺序、缺少名称、方向冲突、类型或主体含混及当前 v1 损坏全部拒绝。
- 删除空活动分类,验证只生成一条 FORMAT-032 `category.deleted(eventOrder = 0, details = { affectedTaskCount: 0 })`,不生成 FORMAT-026;即使存在删除时快照仍指向该分类的垃圾箱任务或分类入口草稿,计数仍为 `0`。
- 删除来源总顺序混合两个未完成和一个已完成任务的分类,验证 FORMAT-032 计数为 `3`,同一原子操作按来源总顺序生成 FORMAT-026 `eventOrder = 1...3`,而不是按状态拆分计数或事件。分类、任务归属、顺序、主体时间、事件集合、草稿条件消费和顺序进度任一步失败时全部回滚。
- 把分类删除进入待保存后改变持久化来源分类或重试,验证工作状态接受时冻结的 `affectedTaskCount`、迁移批次、FORMAT-026 集合、时间与稳定键保持不变;前序待保存创建或移动已经作用于工作状态时必须纳入接受时计数,不得从旧持久化状态或后来 Inbox 重算。
- 对原计数为 `3` 的分类删除永久清理两个迁移主体,验证 FORMAT-032 仍为 `3`,剩余任务事件保留原 `eventOrder` 且允许只剩一个或零个;当前 v1 导入接受该合法缺口,但拒绝剩余事件数大于计数、任一迁移事件顺序超出 `1...3`、计数 `0` 却存在迁移事件或孤立 FORMAT-026。
- 向 FORMAT-032 省略或增加根字段,或把 `affectedTaskCount` 写成负数、小数、超出 JSON 安全整数范围、字符串、布尔值、`null`、数组或对象,验证生产、导出和当前 v1 导入全部拒绝。任务 ID / 标题 / 内容数组、分类身份或位置副本、Inbox 快照、按状态拆分计数、草稿、确认、原因、UI/设备/语言、时间及完整实体字段同样拒绝。
- 迁移显式受支持的旧 `category.deleted` 时,验证只有旧 schema 自身保存可靠原始计数,或正式保证尚无永久清理且完整连续事件集合可证明 N 时才生成 FORMAT-032;只剩部分任务事件、最大 `eventOrder`、当前任务、当前 Inbox、当前分类或历史重放都不得用于猜测。当前 v1 损坏记录不得借旧版迁移放行。
- 创建、软删除和恢复任务,验证分别只写 `task.created`、`task.trashed`、`task.restored`,没有为其位置后果重复写移动事件;永久清理、导入、草稿或纯界面动作不产生任何事件。
- 分别把 `eventOrder` 改为负数、非安全整数、小数或字符串,以及在同一 `operationSequence` 内制造重复 `(operationSequence, eventOrder)`,验证写入前拒绝;永久清理留下操作内缺口时验证往返不重编号。
- 向历史记录加入 `id`、`eventId`、事件 UUID、动作组或本地化摘要,验证写入前拒绝;只调换 `history` 数组排列时,由稳定逻辑键恢复的时间线与事件身份不变。
- 导出分类删除事件,验证只包含发生时受影响任务数量而不包含任务标识或标题集合;各受影响任务的移动事实由独立任务主体事件承载。
- 导出包含同时间操作和一次操作多条事件的备份,验证每条事件都能恢复操作时间、操作顺序和操作内顺序,且不依赖数组原始排列也能得到相同全序。
- 破坏同一操作的共享顺序、制造重复操作内顺序或让不同操作共用操作顺序,验证备份在写入前被拒绝。
- 导出永久清理目标曾作为恢复锚点和任一事件 schema 已声明的历史任务邻居的状态,验证保留引用精确为 `{ "kind": "unavailable" }` 且没有额外字段、目标标识、标题、指纹、时间或映射。
- 分别把 `UnavailableTaskRef` 放入任务身份、当前分类引用、普通位置边界或其他未声明位置,以及给它增加字段,验证 v1 在写入前拒绝;有效锚点位置中的精确对象可以往返且不会阻止删除前备份导入。
- 分别删除 `data.meta.nextOperationSequence`、把它改为 JSON number、无效十进制字符串或不大于任一保留事件的值,验证 v1 备份在写入前被拒绝。
- 永久清理当前最大操作顺序对应的任务后导出,验证 `nextOperationSequence` 不回退且备份不含被清理主体、内容、时间、指纹或顺序到主体的映射。
- 永久清理任务后检查新备份全部 envelope 与 `data`,验证不存在该任务的墓碑、黑名单、内容指纹或用于跨导入阻止恢复的等价标记。
- 在简体中文与英文界面分别导出等价数据,验证系统分类、状态、事件类型和位置边界使用相同语义码且动作组由事件类型映射;交换导入后系统文案按当前语言显示,用户原文和业务事实逐项一致。
- 检查备份中固定收件箱和系统状态引用,验证没有把“收件箱”、`Inbox`、“已完成”或 `Completed` 等界面文案用作持久化系统值。
- 分别删除七个 `data` 顶层字段、加入未知顶层字段或把任一集合字段改为非数组,验证 v1 备份在任何写入前被拒绝;合法空数据仍必须显式包含七个字段。
- 构造分类遗漏、分类重复、活动任务遗漏、活动任务重复和垃圾箱任务进入 `taskOrderByCategory` 的备份,验证全部在写入前被拒绝。
- 调换 `categories`、`tasks`、`drafts` 或 `history` 的记录数组排列,验证业务结果不变;调换 `categoryOrder` 或 `taskOrderByCategory` 中的任务标识后,验证只改变对应的权威产品顺序。
- 检查完整备份,验证没有 `IndexedDB` object store、索引、内部 rank/sort key、数据库代次、窗口锁、缓存或迁移工件。
- 分别向任务标识和分类标识注入大写 UUID、非 v4 UUID、缺少连字符、重复同类型标识和任意非 UUID 字符串,验证 v1 备份在写入前被拒绝;调换合法 UUID 字典序不得改变产品顺序。
- 分别使用两个合法 `CategoryRef`,验证收件箱不依赖显示语言且 custom 引用解析到唯一现存分类;加入额外字段、未知 `kind`、悬空当前分类、字符串、`null`、特殊 UUID 或本地化收件箱名称时均在写入前拒绝。
- 把 `exportedAt`、任务时间、垃圾箱时间或历史 `occurredAt` 改为本地时间、带偏移时间、无时区、非三位小数、数字时间戳或无效公历日期,验证整个 v1 备份在写入前被拒绝;合法时间往返后字符串逐字一致。
- 向自定义分类记录加入顺序、计数、系统标志、时间或未知字段,以及从 `categoryOrder` 遗漏、重复或加入收件箱和未知分类 ID,验证 v1 备份在写入前被拒绝。
- 对空数据库验证 `taskOrderByCategory` 仍有且只有一个空收件箱分组;新增空自定义分类后验证立即增加对应空分组。分别遗漏、重复或增加未知分类分组时,导入必须拒绝。
- 构造活动任务在分组中遗漏、跨分组重复、引用未知任务或垃圾箱任务的备份,验证写入前拒绝;只改变分组项数组排列不得改变分类显示顺序,只改变某项 `taskIds` 排列必须改变该分类的权威任务顺序。
- 验证 Inbox `CategorySnapshot` 只有 `ref`,Custom 快照具有 `ref` 与发生时 `name`;加入收件箱名称、遗漏 custom 名称或增加未知字段时拒绝。删除或重命名快照所指分类后,原快照仍有效且名称不被当前状态覆盖。
- 分别导出活动与垃圾箱任务,验证每条任务只有 FORMAT-014 的八个顶层字段,活动生命周期只有 `kind`,垃圾箱生命周期只有六个规定字段;加入未知字段、遗漏字段、使用 `null`、非法状态或非法优先级时均在写入前拒绝。
- 创建无备注任务与含多行备注任务,验证 `notes` 分别精确为 `""` 与保留原换行的字符串;标题校验只判断去除首尾空白后非空,持久化值仍逐字保留用户原文。
- 构造前后边界、有效任务锚点和永久清理后的不可用锚点,验证 previous 只接受 `task` / `start` / `unavailable`,next 只接受 `task` / `end` / `unavailable`,任务锚点只含可解析且非自身的 `taskId`;标题快照、错误边界和悬空 ID 均被拒绝。
- 软删除任务,验证它从 `taskOrderByCategory` 移除、公共状态和内容不重复写入生命周期,且 `updatedAt === deletedAt ===` 删除操作 `occurredAt`;恢复后垃圾箱专用字段全部消失,同一任务 ID 恰好一次回到权威顺序,`createdAt` 不变且 `updatedAt` 等于恢复操作时间。
- 对内容、状态、优先级、组内移动、跨分类移动和分类删除迁移逐项验证 `updatedAt` 只取各自原始操作时间;原位拖拽、重复值提交、备份、维护清理、待保存重试和相邻任务被动位移不得使用当前执行时间或改写无关任务。
