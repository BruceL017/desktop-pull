# 40 · Task Packets(可派工层)读法

> 本目录把设计转成**可派工的单元**。一个 packet 一个文件,锁死边界,worker 拿走即可开工、碰边界即知停。
> 完整模板见 skill 的 `references/task-packet-template.md`。

## 命名

`TP-<里程碑>-<序号>.md`,例:`TP-M1-01.md`。

## 当前任务包

| 任务包 | 状态 | 产品范围 | 派工前剩余门禁 |
|---|---|---|---|
| `TP-M1-01.md` | completed | D-120 的“收件箱快速创建可用纵切片”已实现 | 完成报告与自动化门禁见 `TP-M1-01.report.md`;仓库质量工具由 D-122 追加治理 |
| `TP-M1-02.md` | completed | 完成任务内容、优先级与状态闭环 | 已完成并由 D-123 纳入 M1 关闭,见 `TP-M1-02.report.md` |
| `TP-M1-03.md` | completed | 分类管理、任务移动与直接拖拽 | 已完成并由 D-123 纳入 M1 关闭,见 `TP-M1-03.report.md` |
| `TP-M1-04.md` | completed | 全局历史、垃圾箱与完整备份 | 已完成并由 D-123 纳入 M1 关闭,见 `TP-M1-04.report.md` |
| `TP-M1-05.md` | completed | 五路由、PWA、双语、单活动窗口与迁移保护 | 已完成并由 D-123 纳入 M1 关闭,见 `TP-M1-05.report.md` |
| `TP-M1-RC-01.md` | completed | 本地发布候选契约审计与已发现偏差修复 | 已完成并由 D-123 关闭,见 `TP-M1-RC-01.report.md` |

## 一个 packet 必含(缺一不可派工)

| 字段 | 装什么 |
|---|---|
| `goal_alignment` | 本包如何推进里程碑目标,对应哪条验收标准 |
| `inputs` | 前置产物路径 |
| `reading_list` | worker 开工前必读的**具体文件**(不能只写目录或 README) |
| `outputs` | 交付物路径 + 格式 |
| `forbidden` | 本 worker 不得触碰的边界 |
| `gates` | entry(开工前条件)+ exit(完成判定,可检查) |
| `stop_condition` | 何时停下升级而非继续 |
| `decision_scope` | 本包哪些选择可自主、哪些需 peer/arch review、哪些必须升级产品 owner |
| `review_route` | self / peer / arch review |

## 铁律

- **reading_list 必须具体到文件**;worker 发现不匹配,回 coordinator 补包,不自行考古扩大上下文。
- **worker 不可自行扩展 outputs**,超出要升级。
- **review_route 不可省略**,防自审自过。
- 依赖的决策未裁决(needs_decision),entry gate 不满足,packet 停 draft。
- 两种实现对用户行为和持久化事实完全等价时,worker 选择范围最小、最简单且符合既有风格的一种;不得把内部细节上升为无必要的产品问题。
- 持久化结构与迁移、Service Worker、窗口锁、依赖及性能方案至少进入 peer 或 arch review;技术评审无权改变产品契约。
- 任何用户可观察结果、数据语义、平台 Gate、隐私或核心可用性变化必须停止受影响工作并升级产品 owner;沉默不代表批准。
- 产品决定只有在 Decision Log 与受影响 canonical 文档完成回写后才能解除 stop condition。口头确认、临时 feature flag、隐藏默认值或“后续再补文档”都不能代替回写。
- 升级只冻结受影响 packet 或其依赖链;其他 entry gate 已满足且不依赖该决定的 packet 可以继续。
