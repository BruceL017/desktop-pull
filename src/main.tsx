import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./app/styles.css";
import { normalizeColdStartHash } from "./router";
import { APP_VERSION } from "./storage/database-schema";

normalizeColdStartHash();

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js?app-version=${APP_VERSION}`, {
        scope: import.meta.env.BASE_URL,
      })
      .then(async () => {
        const registration = await navigator.serviceWorker.ready;
        const resources = performance
          .getEntriesByType("resource")
          .flatMap((entry) =>
            entry.name.startsWith(window.location.origin) ? [entry.name] : [],
          );
        registration.active?.postMessage({
          type: "cache-app-resources",
          version: APP_VERSION,
          urls: [
            new URL(import.meta.env.BASE_URL, window.location.origin).href,
            ...resources,
          ],
        });
      })
      .catch(() => undefined);
  });
}

const root = document.getElementById("root");
if (!root) throw new Error("应用根节点不存在");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
