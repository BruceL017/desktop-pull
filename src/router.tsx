import { createHashRouter, Navigate } from "react-router";
import { AppLayout } from "./ui/AppLayout";
import { BackupPage } from "./ui/BackupPage";
import { HistoryPage } from "./ui/HistoryPage";
import { SettingsPage } from "./ui/SettingsPage";
import { TaskPage } from "./ui/TaskPage";
import { TrashPage } from "./ui/TrashPage";

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
    {
      element: <AppLayout />,
      children: [
        { path: "/", element: <TaskPage /> },
        { path: "/history", element: <HistoryPage /> },
        { path: "/trash", element: <TrashPage /> },
        { path: "/settings", element: <SettingsPage /> },
        { path: "/backup", element: <BackupPage /> },
      ],
    },
    { path: "*", element: <Navigate to="/" replace /> },
  ]);
}
