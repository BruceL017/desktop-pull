import { backupEnvelopeSchema, type DraftRecord } from "../domain/schemas";
import type { WorkspaceSnapshot } from "../domain/workspace";
import { APP_VERSION } from "./database-schema";

export function createEmergencyBackup(
  workspace: WorkspaceSnapshot,
  exportedAt = new Date().toISOString(),
) {
  return backupEnvelopeSchema.parse({
    format: "desktop-pull-backup",
    formatVersion: 1,
    schemaVersion: 1,
    appVersion: APP_VERSION,
    exportedAt,
    data: structuredClone(workspace),
  });
}

function filenameTime(exportedAt: string): string {
  return exportedAt.replaceAll(":", "-");
}

export function downloadEmergencyBackup(workspace: WorkspaceSnapshot): void {
  const backup = createEmergencyBackup(workspace);
  const content = JSON.stringify(backup, null, 2);
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `desktop-pull-emergency-${filenameTime(backup.exportedAt)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export interface DeferredDraftWrite {
  entry: DraftRecord["entry"];
  draft: DraftRecord | null;
  version: number;
}
