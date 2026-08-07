import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const configuredBase = process.env.APP_BASE ?? "/";
const base = `${configuredBase.startsWith("/") ? configuredBase : `/${configuredBase}`}${configuredBase.endsWith("/") ? "" : "/"}`;

export default defineConfig({
  base,
  plugins: [react()],
});
