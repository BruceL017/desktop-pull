# ADR-016 · v1 核心数据库使用代次控制与六个规范化 object store

## Status

Accepted

## Date

2026-08-05

## Decision Drivers

- 首次安装也必须先证明唯一数据库代次并完整读取,不能把初始化中断或未知数据误判为空库。
- 任务、权威顺序、创建历史、操作顺序进度与匹配草稿消费必须在一个 `IndexedDB` 事务中提交。
- 草稿每次输入都要轻量保存,不能因单条草稿变化复制全部任务和历史。
- 逻辑任务、草稿与历史记录必须保持 FORMAT-014、FORMAT-015、FORMAT-016 与 FORMAT-022 的严格字段形状,物理键不得泄漏进备份。
- schema v1 会承载真实用户数据,以后改变物理布局必须遵守 ADR-009 的隔离候选迁移,因此初始布局不能留给 worker 临场选择。

## Context

评审比较了三种布局:把整个工作区放入单一快照记录、直接使用一个固定名称数据库而不保存激活代次,以及由控制数据库选择一个包含规范化 stores 的核心数据库代次。

单快照能简化原子写入,但每次草稿按键都会重写并结构化克隆全部任务、顺序和历史;记录增长后会扩大写放大、失败范围和移动端内存压力。固定名称数据库虽然最少,却无法区分首次初始化中断、活跃代次和未来隔离迁移候选,与 ADR-008、ADR-009 的恢复边界冲突。

规范化 stores 仍能由一个跨 store 事务提交正式操作,同时让草稿只改自己的记录。单独的控制数据库只保存代次选择信息,不保存业务数据,因此不构成第二个核心事实源。

## Decision

### 控制数据库

- 控制数据库固定名为 `desktop-pull-control`,数据库版本为 `1`。
- 它只包含 `activation` object store,使用 out-of-line key `current`。
- `current` 值是严格记录 `{ state, generation, schemaVersion, compatibleAppVersion }`;`state` 只允许 `initializing` 或 `active`,`generation` 使用不透明规范小写 UUID v4,首个核心 schema 版本为 `1`。
- 首次安装先在控制数据库原子写入 `initializing` 与唯一代次,再创建该核心数据库并完成结构校验和完整读取,最后把同一记录原子改为 `active`。中断重启必须复用记录中的同一代次幂等续建,不得另建竞争代次。
- 非首次安装缺失、冲突或不可读激活记录,以及无法证明角色的数据库工件,继续按 ADR-008 进入数据保护态;不得猜测、清库或开放写入。

### 核心数据库

- 核心数据库名称为 `desktop-pull-core-<generation>`,数据库版本为 `1`;`generation` 只属于物理代次,不得进入逻辑记录或备份。
- schema v1 精确包含以下六个 object store:

| Store | Key | Value | v1 索引 |
|---|---|---|---|
| `tasks` | key path `id` | 精确 FORMAT-014 任务记录 | 无二级索引 |
| `categories` | key path `id` | 精确 FORMAT-012 自定义分类记录;首包保持为空 | 无二级索引 |
| `taskOrderByCategory` | 由 CategoryRef 确定性编码的 out-of-line string | 精确 FORMAT-012 分类任务顺序分组 | 无二级索引 |
| `drafts` | 由 FORMAT-015 `entry` 确定性编码的 out-of-line string | 精确 FORMAT-015 草稿记录 | 无二级索引 |
| `history` | out-of-line compound key `[operationSequence, eventOrder]` | 精确 FORMAT-016 事件;首包生产者只写 FORMAT-022 `task.created` | `byTaskSubject` → `subject.taskId`;`byCategorySubject` → `subject.categoryId` |
| `meta` | out-of-line key `categoryOrder` 或 `nextOperationSequence` | 分别为精确分类 ID 数组或正整数十进制字符串 | 无二级索引 |

- 固定 Inbox 不进入 `categories` 或 `categoryOrder`;合法空库仍须在 `taskOrderByCategory` 中有一个 Inbox 空分组,且 `nextOperationSequence` 精确为 `"1"`。
- `taskOrderByCategory` 与 `drafts` 的物理键只用于唯一定位并必须和记录内逻辑入口逐值互相校验;它们不得形成第二套分类或草稿事实。
- `history` 物理 compound key 只复用事件已有稳定逻辑键,不增加事件 ID、包装字段或逻辑记录顶层字段。时间线不得依赖 IndexedDB 自然键序,仍按 ADR-012 比较 `occurredAt`、十进制 `operationSequence` 与 `eventOrder`。
- 只建立两个已经由 M1 主体筛选和永久清理确定需要的稀疏主体索引。v1 不预建按时间、类型、标题、优先级、分类归属或界面入口的索引;实际性能证据需要新增索引时必须走 architecture review 和 ADR-009 迁移。

### 事务与降级边界

- 健康创建事务同时打开 `tasks`、`taskOrderByCategory`、`drafts`、`history` 与 `meta`,校验预期工作基线和草稿入口/代次,再原子写入任务、Inbox 顺序、创建事件、推进 `nextOperationSequence` 并条件消费匹配草稿。
- 事务内不得等待网络、计时器或其他非 IndexedDB 异步工作;所有任务、事件、位置、时间、顺序和幂等事实必须在进入事务前冻结。
- `tx.done` 成功才表示安全落盘。失败或提交结果不确定时,持久化基线不前移;应用按 ADR-006 保留同一冻结创建意图并通过任务 ID、稳定历史键和预期顺序结果做幂等重试。
- 会话待保存正式操作和最新内存草稿不增加 object store,不写控制数据库,也不使用 `localStorage`、`sessionStorage` 或 Cache。应急备份从“已持久化基线 + 有序待保存意图 + 当前草稿快照”物化。

## Consequences

- 草稿保存只触碰 `drafts`,不会重写任务或历史;正式创建仍能跨五个 stores 原子提交。
- 严格逻辑记录可以原样进入备份,物理键、代次和索引不会污染可移植 schema。
- 首次初始化多一步控制记录状态机,但中断后可以确定性续建而不是猜测空库。
- categories store 和两个主体索引在首包没有用户入口,但它们服务已经锁定的 M1 schema、主体筛选和永久清理,不是额外产品能力。
- 后续改变 store、索引、物理键或记录形状属于难逆转持久化变更,必须新建 schema 版本并按 ADR-009 完成隔离候选迁移;不得原地改写活跃代次。

