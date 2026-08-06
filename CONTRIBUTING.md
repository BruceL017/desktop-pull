# 参与 Desktop Pull 开发

## 开发环境

```bash
git clone https://github.com/BruceL017/desktop-pull.git
cd desktop-pull
npm ci
npm exec -- playwright install chromium webkit
npm run dev
```

Node.js 必须满足 `>=22.22.0`，npm 必须为 `11.14.1`。

## 分支策略

项目采用 trunk-based development：

- 从 `main` 创建短期分支，例如 `feat/task-editing`、`fix/draft-retry` 或 `docs/readme`
- 所有改动通过 Pull Request 合并回 `main`，不维护长期 `develop` 分支
- 紧急修复同样需要 Pull Request，不直接推送到受保护的 `main`

## Commit 规范

提交信息遵循 Conventional Commits：

- `feat: add task editing`
- `fix: preserve latest draft generation`
- `docs: update local setup`
- `refactor: simplify workspace transition`
- `test: cover storage rollback`
- `chore: update quality tooling`

提交前确认 Git 使用 GitHub noreply 邮箱。

## Pull Request 流程

1. 说明改动解决的问题、实现方式和验证结果。
2. 新功能必须带测试；修复缺陷时先添加可复现失败的测试。
3. 运行 `npm run check`，确保本地门禁全部通过。
4. 等待 CI 成功和至少 1 名 reviewer 批准。
5. 使用 Squash merge，PR 标题应符合 Conventional Commits。

## 格式与质量

- `npm run quality`：只读检查格式、lint 和 imports
- `npm run format`：写入 Biome 格式化结果
- `npm run test:coverage`：运行单元测试并检查覆盖率阈值
- `npm run test:e2e`：运行 Chromium 与 WebKit 场景

涉及产品行为、持久化格式、依赖或运行边界时，先阅读 `project-context/` 中对应决策与契约。问题和需求通过 GitHub Issues 提交，具体实现讨论保留在对应 Issue 或 Pull Request 中。
