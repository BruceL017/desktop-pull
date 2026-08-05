# TP-M1-01 架构评审记录

- **状态**:Accepted
- **日期**:2026-08-05
- **范围**:只评审 D-120 已锁定首包的等价技术实现;不改变产品行为。
- **权威结果**:D-121、ADR-016 与 `40-task-packets/TP-M1-01.md`;本文只保留评审证据。

## 评审结论

### 工具与运行基线

- 使用仓库当前可直接获得的 `npm 11.14.1`,唯一 lockfile 为 `package-lock.json`。
- `package.json` 使用 `name: "desktop-pull"`、`version: "0.1.0"`、`private: true`、`type: "module"`、`packageManager: "npm@11.14.1"`。
- Node entry gate 为 `>=22.22.0`;它同时覆盖 React Router 8.3.0 的最低要求,并满足 Vite 8.2.0 与 Vitest 4.1.10 的要求。
- 所有直接依赖使用下表精确版本,由 `package-lock.json` 固定完整依赖图;不得用 `latest`、范围漂移或运行时 CDN。

### 生产依赖

| 包 | 版本 | 本包唯一用途 |
|---|---:|---|
| `react` | `19.2.8` | 响应式界面 |
| `react-dom` | `19.2.8` | 浏览器渲染 |
| `react-router` | `8.3.0` | `createHashRouter` 与任务路由归一化 |
| `idb` | `8.0.3` | 保留原生事务语义的 Promise/TypeScript IndexedDB 封装 |
| `zod` | `4.4.3` | 严格校验首次读取、事务输入和应急备份逻辑记录 |
| `lucide-react` | `1.28.0` | 添加、清空、重试和下载等图标 |

不加入外部状态库、CSS 框架、组件库、i18n、拖拽、PWA、日期、UUID 或备份库。状态使用 React Context + `useReducer`;样式使用一个普通 CSS 文件;UUID 使用 `crypto.randomUUID()`;时间使用原生 UTC ISO 字符串并在操作接受时冻结。

### 开发与测试依赖

| 包 | 版本 |
|---|---:|
| `typescript` | `7.0.2` |
| `vite` | `8.2.0` |
| `@vitejs/plugin-react` | `6.0.5` |
| `vitest` | `4.1.10` |
| `jsdom` | `30.0.1` |
| `fake-indexeddb` | `6.2.5` |
| `@testing-library/dom` | `10.4.1` |
| `@testing-library/react` | `16.3.2` |
| `@testing-library/user-event` | `14.6.3` |
| `@testing-library/jest-dom` | `7.0.0` |
| `@playwright/test` | `1.62.1` |
| `@types/node` | `22.20.1` |
| `@types/react` | `19.2.18` |
| `@types/react-dom` | `19.2.4` |

Vitest + jsdom 覆盖领域与 React 交互;fake-indexeddb 覆盖快速事务测试;Playwright 的 Chromium `1440 x 900` 和 WebKit `390 x 844` 项目在真实浏览器 IndexedDB 中覆盖桌面/移动创建、刷新和故障界面。它们是首包自动化代理,不替代 M1 最终正式平台矩阵的人工/设备验收。

`package.json` 必须提供以下固定脚本:

| Script | Command |
|---|---|
| `dev` | `vite` |
| `typecheck` | `tsc --noEmit` |
| `test` | `vitest` |
| `test:unit` | `vitest run` |
| `test:e2e` | `playwright test` |
| `build` | `tsc --noEmit && vite build` |
| `check` | `npm run typecheck && npm run test:unit && npm run build && npm run test:e2e` |

首次准备测试浏览器使用 `npm exec playwright install chromium webkit`;完成 lockfile 后的可复现安装使用 `npm ci`。Playwright config 自己通过 `webServer` 启动 Vite,测试脚本不依赖人工先开服务器。

## 关键结构

### 数据路径

```text
QuickCreate
    -> workspace-controller (冻结创建意图、维护工作状态与待保存顺序)
        -> workspace-repository
            -> idb transaction(tasks, taskOrderByCategory, drafts, history, meta)

启动
    -> control DB activation
        -> active core generation
            -> strict full read
                -> working UI | data-protection UI
```

### 性能边界

- 不使用单一工作区快照,避免每个草稿按键复制全部任务和历史。
- 草稿自动保存只写一个 `drafts` 记录;空输入只删除该入口记录。
- 创建事务固定触碰五个 stores,与任务总量无关;Inbox 顺序数组是唯一随任务数量线性增长的写入。
- 首包无历史页面,但 v1 建立 `byTaskSubject` 与 `byCategorySubject` 两个已确定消费者的索引;其余查询先使用内存排序/过滤,没有证据前不增加二级索引。
- 单用户数据量下不引入虚拟列表、Web Worker、分页或缓存层;出现可测性能问题再走 D-092 技术评审。

## 被否决实现

| 方案 | 否决理由 |
|---|---|
| 整个工作区保存为单一 IndexedDB 快照 | 每个草稿按键重写全部任务和历史,写放大与失败范围随数据增长 |
| 原生 IndexedDB 手写全部 Promise 与泛型封装 | 重复 `idb` 已提供的小型能力,代码更多且更易误判 transaction 完成 |
| 把待保存队列持久化到新 store、localStorage 或 sessionStorage | 违反 ADR-006 的会话队列边界并形成第二事实源 |
| Redux/Zustand 等外部状态库 | 单路由首包只有一个工作状态控制器,没有抵消新增依赖和状态同步面的复杂度 |
| Tailwind、组件库或 CSS-in-JS | 首包 UI 面小,普通 CSS 足够且不会提前锁定完整设计系统 |
| 只写 fake-indexeddb 测试 | 无法证明真实 Chromium/WebKit 的 IndexedDB、刷新和下载行为 |
| 为历史全部字段预建索引 | 首包没有消费者且会扩大 schema;只保留已锁定主体筛选/清理索引 |

## 官方依据

- React Router 官方 `createHashRouter` 文档明确其在 URL Hash 中管理应用路径。
- `idb` 官方说明其保留 IndexedDB API 形态、提供 TypeScript 类型和 `tx.done`,并警告事务中不得等待无关异步工作。
- Zod 4 官方提供严格对象 schema,用于拒绝未知或额外字段。
- Vite 8 官方运行要求为 Node.js 20.19+ 或 22.12+;本包更高的 `22.22.0` 下限来自 React Router 8.3.0。
- Playwright 使用 Chromium/WebKit 两个项目覆盖本包响应式浏览器流程;最终真实平台 Gate 仍留给 M1 验收。
