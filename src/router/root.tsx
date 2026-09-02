import { createRootRoute, Outlet } from "@tanstack/solid-router";

export const rootRoute = createRootRoute({
  component: () => (
    <div>
      <main>
        <Outlet />
      </main>
    </div>
  ),
});
