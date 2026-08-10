# TP-M1-RC-01 · 本地发布候选契约审计

- **status**:completed
- **closure_decision**:D-123
- **goal_alignment**:在不代签真人与正式平台 Gate 的前提下,对 `main` 的 M1 实现执行高风险契约审计,修复可复现偏差并形成可供独立 reviewer 复核的证据。
- **inputs**:`9ccbabd`,TP-M1-02..05 实现与报告,FORMAT-002,WINDOW-005/009,ADR-001/009/010/014。
- **reading_list**:`20-contracts/backup-format.md`,`backup-import.md`,`history-retention.md`,`migration-rollback.md`,`single-active-window.md`,`src/domain/operations.ts`,`src/domain/schemas.ts`,`src/storage/database.ts`,`src/storage/workspace-repository.ts`,`src/application/window-ownership.tsx`,`src/application/workspace-controller.tsx`。
- **outputs**:`src/application/window-ownership.tsx`,`src/domain/schemas.ts`,`src/storage/emergency-backup.ts`,`tests/application/window-ownership.test.tsx`,`tests/storage/emergency-backup.test.ts`,`CHANGELOG.md`,`TP-M1-RC-01.report.md` 及受事实状态影响的上下文导航/报告文件。
- **forbidden**:不新增 M2 产品能力,不改变任务、历史或备份 `data` 逻辑结构,不降低 M1 Exit Gate,不把本地自动化或本次自审记作独立审核、真人测试、实体安装或正式平台签收。
- **entry_gate**:`main` 工作树开始时干净;M1 实现已合并;权威契约无开放实现阻塞项。
- **exit_gate**:每个代码偏差先有失败测试再修复;高风险路径完成代码对质;完整仓库门禁通过;报告列明剩余独立审核和外部 Gate;canonical Exit checklist 保持未代签。
- **stop_condition**:若修复必须改变用户可观察产品语义、备份 `data` 逻辑 schema、永久清理范围、迁移回退承诺或平台矩阵,立即停止并升级 product owner。
- **decision_scope**:可修复代码对既有 FORMAT/WINDOW 契约的明确偏差并补相称测试;任何新能力或契约变化不在本包范围。
- **review_route**:peer;独立审核已完成,产品所有者通过 D-123 关闭本包与 M1。
