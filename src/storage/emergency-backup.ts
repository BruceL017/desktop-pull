import { backupEnvelopeSchema, type DraftRecord } from "../domain/schemas";
import type { WorkspaceSnapshot } from "../domain/workspace";
import { APP_VERSION, CORE_DATABASE_VERSION } from "./database-schema";

export function createEmergencyBackup(
  workspace: WorkspaceSnapshot,
  exportedAt = new Date().toISOString(),
) {
  return backupEnvelopeSchema.parse({
    format: "desktop-pull-backup",
    formatVersion: 1,
    schemaVersion: CORE_DATABASE_VERSION,
    appVersion: APP_VERSION,
    exportedAt,
    data: structuredClone(workspace),
  });
}

export const createBackup = createEmergencyBackup;

export function parseBackup(input: unknown): WorkspaceSnapshot {
  return structuredClone(backupEnvelopeSchema.parse(input).data);
}

function filenameTime(exportedAt: string): string {
  return exportedAt.replaceAll(":", "-");
}

export function downloadBackup(
  workspace: WorkspaceSnapshot,
  kind: "backup" | "emergency" = "backup",
): void {
  const backup = createBackup(workspace);
  const content = JSON.stringify(backup, null, 2);
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `desktop-pull-${kind}-${filenameTime(backup.exportedAt)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadEmergencyBackup(workspace: WorkspaceSnapshot): void {
  downloadBackup(workspace, "emergency");
}

export interface DeferredDraftWrite {
  entry: DraftRecord["entry"];
  draft: DraftRecord | null;
  version: number;
}
