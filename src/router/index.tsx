import { createRoute, createRouter } from "@tanstack/solid-router";
import { demoRoute } from "@/features/demo";
import { rootRoute } from "./root";

const notFoundRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "*",
  component: () => <div>Page Not Found</div>,
});

const routeTree = rootRoute.addChildren([demoRoute, notFoundRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/solid-router" {
  interface Register {
    router: typeof router;
  }
}
