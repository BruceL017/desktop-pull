import { createHashRouter, Navigate } from "react-router";
import { TaskPage } from "./ui/TaskPage";

export function normalizeColdStartHash(): void {
  if (window.location.hash === "#/") return;
  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${window.location.search}#/`,
  );
}

export function createAppRouter() {
  return createHashRouter([
    { path: "/", element: <TaskPage /> },
    { path: "*", element: <Navigate to="/" replace /> },
  ]);
}
