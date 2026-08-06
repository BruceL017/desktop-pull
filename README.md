# Desktop Pull

Desktop Pull 是供内部使用的本地优先浏览器任务管理器，当前版本聚焦默认中文收件箱的快速创建、草稿恢复与本地持久化。

[![CI](https://github.com/BruceL017/desktop-pull/actions/workflows/ci.yml/badge.svg)](https://github.com/BruceL017/desktop-pull/actions/workflows/ci.yml)

## 当前能力

- 默认中文收件箱，支持通过回车或添加按钮快速创建任务
- 创建后保持输入焦点，支持连续创建任务并维持顺序
- 桌面与移动端响应式任务入口
- 冷启动时将 Hash 路由归一化到 `#/`
- 使用 IndexedDB v1 保存任务、顺序、创建历史和草稿，刷新后可恢复
- 本地写入失败时保持可编辑，并提供自动或手动重试
- 写入失败期间可导出包含任务和未提交草稿的应急 JSON 备份

## 前提

- Node.js `>=22.22.0`
- npm `11.14.1`
- 可访问本私有仓库及 npm 依赖源
- 支持 IndexedDB 的现代浏览器
- 运行端到端测试前已安装 Playwright 的 Chromium 与 WebKit

## 快速开始

```bash
npm ci
npm run dev
```

开发服务器启动后，打开终端显示的本地地址。应用会进入 `#/` 下的收件箱。

## 使用

桌面端可直接在收件箱顶部输入任务并按回车，或点击添加按钮提交。提交后输入框会重新获得焦点，可以继续创建下一项任务。

移动端点击底部添加按钮打开同一个快速创建入口。尚未提交的内容会保存为草稿，并在刷新后恢复。

如果本地写入失败，界面会显示未保存数量和重试入口。此时可以下载应急 JSON，避免仅存在内存中的任务或草稿随刷新或关闭页面而丢失。

## 验证

首次运行浏览器测试前安装测试浏览器：

```bash
npm exec -- playwright install chromium webkit
```

运行完整质量门禁：

```bash
npm run check
```

该命令依次检查格式与 lint、TypeScript、覆盖率阈值、生产构建，以及 Chromium 桌面和 WebKit 移动端到端场景。也可以单独运行 `npm run test:unit`、`npm run test:e2e`、`npm run build` 或 `npm run format:check`。

## 架构与目录

```text
src/
|-- domain/        任务、草稿和工作区模型，以及创建意图
|-- storage/       IndexedDB v1、仓储事务和应急备份
|-- application/   启动、保存队列、降级与重试控制
|-- ui/            收件箱、快速创建和存储状态界面
|-- app/           应用装配与全局样式
|-- router.tsx     Hash 路由及冷启动归一化
`-- main.tsx       浏览器入口

tests/
|-- domain/        领域行为测试
|-- storage/       持久化与事务测试
|-- application/   应用控制器测试
`-- e2e/           浏览器端核心流程、可访问性与失败场景
```

产品边界、架构决策、契约、路线图和任务包见[设计上下文包](project-context/README.md)。

## 安全与数据边界

- 数据保存在当前浏览器配置与站点来源对应的 IndexedDB 中，不会同步到远端
- 清理浏览器站点数据、删除浏览器配置或更换站点来源可能导致本地数据不可用
- 应急备份包含任务和未提交草稿，文件未加密，不应通过不受信任的渠道分享
- 当前没有普通备份导入能力，应急 JSON 仅用于写入失败时保全数据
- 当前不提供 PWA 或离线可用性保证

## 当前范围

当前版本是收件箱快速创建的首个纵切片。以下能力尚未实现：

- 任务编辑、完成或重新打开、优先级调整
- 分类管理、跨分类移动和拖拽排序
- 垃圾箱、恢复和历史页面
- 普通备份导入与导出
- PWA、离线模式和英文界面切换
- 远端同步

## 内部使用声明

Internal use only.

本仓库仅供内部使用，未提供开源许可证，也未授权外部使用、复制、修改或分发。
