# ADR-003 · IndexedDB 作为本地持久化边界

## Status

Accepted

## Date

2026-07-24

## Decision Drivers

- 当前状态与审计历史必须在同一个原子事务中提交。
- 任务、分类、顺序和长期历史属于结构化且会持续增长的数据。
- PWA 必须离线工作,核心路径不能依赖远程数据库。
- schema 演进不能通过清空本地数据解决。

## Context

候选方案包括 `localStorage`、分别存放多种浏览器存储,以及统一使用 `IndexedDB`。`localStorage` 只提供同步字符串键值读写,无法为当前状态和历史提供跨记录原子事务;拆分多种存储会制造多个事实源和不一致恢复路径。

`IndexedDB` 提供结构化对象存储、索引、版本升级和事务,能够承载 ADR-002 要求的当前状态与审计历史一致性。

## Decision

- `IndexedDB` 是任务、分类、顺序、垃圾箱和历史的唯一核心持久化数据库。
- 核心数据不写入 `localStorage`、`sessionStorage` 或 Service Worker Cache。
- schema 使用显式版本和可测试迁移。
- 迁移失败时停止写入并保留原数据,不得自动清库或降级存储。

## Consequences

- 所有核心写操作必须遵守 `IndexedDB` 事务边界。
- 实现需要数据库版本、迁移 fixtures 和失败注入测试。
- Service Worker Cache 只缓存应用资源,不承载用户任务数据。
- 浏览器站点数据被用户或系统清除时,本地数据库仍可能丢失;是否提供手动备份需单独做产品决策。
- 未来原生 App 不能直接复用浏览器数据库,但可以复用同一领域与数据契约并替换持久化适配。

