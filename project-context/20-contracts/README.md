# 20 · Contracts(约束层)读法

> 本目录回答**实现必须怎么做**:可被 reviewer 或 CI 真正执行的约束。foundation 说"是什么",这里说"做成什么才算过"。
> 下面是导航地图。讨论出一条可执行约束就在这里落文件;纯愿望不要放这里。

## 典型文件(按需建)

| 文件 | 管什么 | 不管什么 |
|---|---|---|
| `data-contract.md` | 数据格式、schema、frontmatter、文件布局 | 为什么这样设计(回 foundation) |
| `interface-contract.md` | 接口 / CLI / API 的签名、错误分类、行为契约 | 何时做(去 roadmap) |
| `quality-gates.md` | 质量门、测试矩阵、CI 必过项(逐条可检查) | 某里程碑是否完成 |
| `backup-format.md` | 完整备份逻辑 schema、严格联合、FORMAT-019 至 FORMAT-032 已锁定历史详情与可移植性 Gate | IndexedDB 物理布局或产品交互理由 |
| `localization.md` | M1 中英文界面、首次语言选择、设备语言偏好、设置入口、运行时切换和语言一致性 Gate | 后续新增其他语言或翻译工作流 |
| `navigation.md` | 桌面与移动导航、会话浏览上下文、顶层 Hash 路由、浏览器历史与冷启动归一化 Gate | 任务、分类或历史的数据 schema |
| `pwa-delivery.md` | 普通网页与安装形态、M1 客户端实现基线、Hash 路由静态启动、正式平台矩阵、滚动版本、离线交付和存储作用域 Gate | 原生 App 或云同步设计 |
| `golden-path.md` | M1 核心路径、桌面与移动参考/边界视口、首次用户计时和样本 Gate | 各功能完整异常矩阵 |

## 铁律

- **每条约束都要能被 reviewer 或 gate 执行。** 写之前问一句:"这条能被 CI / review 真正检查吗,还是只是愿望?"只写成愿望的约束等于没有。
- 约束变化要同步任务包模板和 roadmap status checklist。
- 若新增禁止项,写清现存任务是否回溯阻塞。
