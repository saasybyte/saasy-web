import { createRoute, lazyRouteComponent } from "@tanstack/solid-router";
import { rootRoute } from "@/router/root";

export const demoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: lazyRouteComponent(() => import("@/features/demo/components/DemoPage")),
});
