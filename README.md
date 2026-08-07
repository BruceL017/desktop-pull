# Desktop Pull

Desktop Pull 是一款无需账户和服务端的本地优先浏览器任务管理器，支持任务与分类整理、历史与恢复、完整备份、离线 PWA 和中英文界面。

[![CI](https://github.com/BruceL017/desktop-pull/actions/workflows/ci.yml/badge.svg)](https://github.com/BruceL017/desktop-pull/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)

## 当前能力

- [x] 全局或分类内快速创建，跨刷新恢复未提交草稿与 UTF-16 光标位置
- [x] 标题和备注自动保存，`P0` 至 `P5` 优先级，完成与重新打开
- [x] 分类创建、重命名、排序和删除，选择器移动以及桌面/触控直接拖拽
- [x] 垃圾箱恢复、永久删除、30 天到期清理和历史引用去身份化
- [x] 14 类严格历史事件，以及按任务、分类和八类动作组合筛选
- [x] 完整 JSON 导出、校验后覆盖导入和导入前安全备份
- [x] 五个 Hash 页面、根路径与子路径离线 PWA、中英文即时切换
- [x] IndexedDB 六 Store 原子写入、v1 到 v2 隔离候选迁移、离线版本回退与单活动窗口移交

## 前提

- Node.js `>=22.22.0`
- npm `11.14.1`
- 可访问 npm 依赖源
- 支持 IndexedDB、Web Locks、BroadcastChannel 和 Service Worker 的现代浏览器
- 运行端到端测试前已安装 Playwright 的 Chromium 与 WebKit

## 快速开始

```bash
npm ci
npm run dev
```

开发服务器启动后，打开终端显示的本地地址。应用会进入 `#/` 下的收件箱。

## 使用

桌面端可直接在页面顶部或分类内输入任务并按回车。移动端点击固定加号打开同一个全局入口。任务行可以调整优先级、完成状态、分类和顺序；打开任务详情后可以编辑标题与备注。

任务移入垃圾箱后可以恢复到仍然有效的原分类和状态位置；原分类不存在时恢复到收件箱。历史页面展示冻结在操作发生时的任务、分类和位置事实。

备份页面可以下载未加密的完整 JSON，也可以校验文件后覆盖当前数据。覆盖导入会先下载当前数据的安全备份，并且不会合并两份数据。

如果本地写入失败，界面会保留操作顺序并显示未保存数量和重试入口。此时可以下载应急 JSON，避免仅存在当前会话中的任务或草稿随刷新或关闭页面而丢失。同一存储作用域一次只允许一个活动窗口读取和修改数据，其他窗口可以在安全时请求移交。

## 验证

首次运行浏览器测试前安装测试浏览器：

```bash
npm exec -- playwright install chromium webkit
```

运行完整质量门禁：

```bash
npm run check
```

该命令依次检查格式与 lint、TypeScript、覆盖率阈值、生产构建、Chromium 桌面与 WebKit 移动端场景，以及根路径和 `/desktop-pull/` 子路径的生产 PWA 离线流程。也可以单独运行 `npm run test:unit`、`npm run test:e2e`、`npm run test:pwa`、`npm run build` 或 `npm run format:check`。

## 架构与目录

```text
src/
|-- domain/        严格数据模型与任务、分类、生命周期操作
|-- storage/       IndexedDB v2、隔离迁移、六 Store 事务和备份格式
|-- application/   保存队列、清理、语言与单窗口控制
|-- ui/            任务、历史、垃圾箱、设置和备份页面
|-- app/           应用装配与全局样式
|-- router.tsx     Hash 路由及冷启动归一化
`-- main.tsx       浏览器入口

tests/
|-- domain/        领域行为测试
|-- storage/       持久化与事务测试
|-- application/   应用控制器测试
|-- e2e/           浏览器核心流程、可访问性与失败场景
`-- pwa/           生产构建的根路径与子路径离线流程
```

产品边界、架构决策、契约、路线图和任务包见[设计上下文包](project-context/README.md)。

## 安全与数据边界

- 数据保存在当前浏览器配置与站点来源对应的 IndexedDB 中，不会同步到远端
- 清理浏览器站点数据、删除浏览器配置或更换站点来源可能导致本地数据不可用
- 语言和折叠偏好保存在当前作用域的 localStorage 中，不进入完整备份
- 完整或应急备份包含任务、分类、顺序、历史、垃圾箱和未提交草稿，文件未加密
- 永久删除只承诺清理当前数据库；此前导出的备份仍可能包含已删除内容
- 不应通过不受信任的渠道分享备份文件，覆盖导入前应确认下载的安全备份可用

## 当前范围

当前 `0.2.0` 为早期预发布版本。它不提供以下能力：

- 账户、团队协作、远端同步或云备份
- 截止日期、提醒、重复任务、子任务或附件
- 多分类、标签、历史回滚或备份合并
- 原生 iOS/Android 应用或跨浏览器自动迁移

PR 合并前需等待 CI 成功，并由独立 reviewer（当前流程为另一个 Agent）完成审核。正式发布还需执行项目上下文中记录的真人首次使用 Gate 和完整平台矩阵；当前自动化结果不替代这些外部验收。

## 贡献与安全

- 问题与功能建议请提交到 [Issues](https://github.com/BruceL017/desktop-pull/issues)，一般讨论可使用 [Discussions](https://github.com/BruceL017/desktop-pull/discussions)
- 参与开发前请阅读[贡献指南](CONTRIBUTING.md)与[行为准则](CODE_OF_CONDUCT.md)
- 安全漏洞请按[安全政策](SECURITY.md)通过 GitHub 私密报告，不要创建公开 Issue

## 许可证

本项目采用 [Apache License 2.0](LICENSE)。使用、修改和分发本项目时请遵守许可证条款。
