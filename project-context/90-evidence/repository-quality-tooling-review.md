# 仓库质量工具架构复核

- **状态**:Accepted
- **日期**:2026-08-06
- **权威结果**:D-122;本文只保留评审证据
- **范围**:仓库 P0-P3 完备性,不扩展 M1 产品功能

## 结论

在 `TP-M1-01` 已完成并通过原门禁后,允许追加以下精确版本的开发依赖:

| 依赖 | 用途 | 运行时影响 |
|---|---|---|
| `@biomejs/biome 2.5.7` | 格式、lint、imports 与 CI 检查 | 无;只在开发和 CI 执行 |
| `@vitest/coverage-v8 4.1.10` | application/domain/storage 覆盖率阈值 | 无;只包装既有 Vitest 测试 |
| `@axe-core/playwright 4.12.1` | 真实浏览器可访问性扫描 | 无;只在 Playwright 测试执行 |

生产依赖、Vite bundle、IndexedDB stores、数据 schema、用户交互和网络边界保持不变。

## 选择依据

- Biome 同时承担 formatter 与 linter,比 ESLint + Prettier 的组合少一套解析器和配置。
- npm 官方元数据显示 `typescript-eslint 8.66.0` 的 TypeScript peer 范围为 `>=4.8.4 <6.1.0`,与项目锁定的 TypeScript `7.0.2` 不兼容,因此不引入带 peer 冲突的工具链。
- coverage provider 与 Vitest 使用相同的 `4.1.10` 版本,避免测试运行器和 provider 漂移。
- a11y 测试复用既有 Chromium desktop 与 WebKit mobile 项目,不增加浏览器矩阵。

## 门禁

`npm run check` 必须依次通过:

1. `biome ci .`
2. `tsc --noEmit`
3. `vitest run --coverage`
4. `vite build`
5. `playwright test`

覆盖率必须满足 branches `65%`、functions `70%`、lines `70%`、statements `70%`。CI 还执行 `npm audit --audit-level=high`。

## 非目标

- 不改变任何产品能力或可见文案
- 不改变生产依赖或加入运行时外部请求
- 不把完整 M1 或任一 M1 功能组标记为完成
- 不替代最终真实平台和首次用户 Gate
