import { RouterProvider } from "react-router";
import { WorkspaceProvider } from "../application/workspace-controller";
import { createAppRouter } from "../router";

const router = createAppRouter();

export function App() {
  return (
    <WorkspaceProvider>
      <RouterProvider router={router} />
    </WorkspaceProvider>
  );
}
