import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./app/styles.css";
import { normalizeColdStartHash } from "./router";

normalizeColdStartHash();

const root = document.getElementById("root");
if (!root) throw new Error("应用根节点不存在");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
