import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";

beforeEach(() => {
  delete (globalThis as { __DESKTOP_PULL_TEST_FAILURES__?: unknown })
    .__DESKTOP_PULL_TEST_FAILURES__;
});

afterEach(async () => {
  cleanup();

  const databases = await indexedDB.databases();
  await Promise.all(
    databases.flatMap(({ name }) =>
      name?.startsWith("desktop-pull-")
        ? [
            new Promise<void>((resolve, reject) => {
              const request = indexedDB.deleteDatabase(name);
              request.onsuccess = () => resolve();
              request.onerror = () => reject(request.error);
              request.onblocked = () => reject(new Error(`数据库仍被占用: ${name}`));
            }),
          ]
        : [],
    ),
  );
});
