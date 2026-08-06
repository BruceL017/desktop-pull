import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyWorkspace } from "../../src/domain/workspace";
import {
  createEmergencyBackup,
  downloadEmergencyBackup,
} from "../../src/storage/emergency-backup";

const createObjectURLDescriptor = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
const revokeObjectURLDescriptor = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (createObjectURLDescriptor) {
    Object.defineProperty(URL, "createObjectURL", createObjectURLDescriptor);
  } else {
    Reflect.deleteProperty(URL, "createObjectURL");
  }
  if (revokeObjectURLDescriptor) {
    Object.defineProperty(URL, "revokeObjectURL", revokeObjectURLDescriptor);
  } else {
    Reflect.deleteProperty(URL, "revokeObjectURL");
  }
});

describe("emergency backup", () => {
  it("creates a versioned, detached snapshot", () => {
    const workspace = emptyWorkspace();
    const backup = createEmergencyBackup(workspace, "2026-08-06T01:02:03.004Z");

    expect(backup).toEqual({
      format: "desktop-pull-backup",
      formatVersion: 1,
      schemaVersion: 1,
      appVersion: "0.1.0",
      exportedAt: "2026-08-06T01:02:03.004Z",
      data: workspace,
    });
    expect(backup.data).not.toBe(workspace);
  });

  it("downloads the snapshot and releases its object URL", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-06T01:02:03.004Z"));

    const createObjectURL = vi.fn((_blob: Blob) => "blob:desktop-pull-backup");
    const revokeObjectURL = vi.fn();
    Object.defineProperties(URL, {
      createObjectURL: { configurable: true, value: createObjectURL },
      revokeObjectURL: { configurable: true, value: revokeObjectURL },
    });

    let clickedLink: HTMLAnchorElement | undefined;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clickedLink = this;
    });

    downloadEmergencyBackup(emptyWorkspace());

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(clickedLink?.href).toBe("blob:desktop-pull-backup");
    expect(clickedLink?.download).toBe(
      "desktop-pull-emergency-2026-08-06T01-02-03.004Z.json",
    );
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:desktop-pull-backup");
  });
});
