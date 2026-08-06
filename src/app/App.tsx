import { RouterProvider } from "react-router";
import { LanguageProvider } from "../application/i18n";
import {
  ActiveWindowBoundary,
  WindowOwnershipProvider,
} from "../application/window-ownership";
import { WorkspaceProvider } from "../application/workspace-controller";
import { createAppRouter } from "../router";

const router = createAppRouter();

export function App() {
  return (
    <LanguageProvider>
      <WindowOwnershipProvider>
        <ActiveWindowBoundary>
          <WorkspaceProvider>
            <RouterProvider router={router} />
          </WorkspaceProvider>
        </ActiveWindowBoundary>
      </WindowOwnershipProvider>
    </LanguageProvider>
  );
}
