import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/pwa",
  fullyParallel: false,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    locale: "zh-CN",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "root",
      use: { baseURL: "http://127.0.0.1:4174" },
    },
    {
      name: "subpath",
      use: { baseURL: "http://127.0.0.1:4175" },
    },
  ],
  webServer: [
    {
      command: "npm run build && npm exec vite -- preview --host 127.0.0.1 --port 4174",
      url: "http://127.0.0.1:4174/#/",
      reuseExistingServer: false,
    },
    {
      command:
        "APP_BASE=/desktop-pull/ npm run build -- --outDir dist-subpath && npm exec vite -- preview --outDir dist-subpath --base /desktop-pull/ --host 127.0.0.1 --port 4175",
      url: "http://127.0.0.1:4175/desktop-pull/#/",
      reuseExistingServer: false,
    },
  ],
});
