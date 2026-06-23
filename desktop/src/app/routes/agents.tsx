import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";

import { ViewLoadingFallback } from "@/shared/ui/ViewLoadingFallback";

// The chunk import is hoisted so it can be triggered eagerly (route preload)
// as well as lazily on render — calling it twice is a no-op, the module loader
// dedupes and caches the in-flight promise.
const importAgentsScreen = () => import("@/features/agents/ui/AgentsScreen");

const AgentsScreen = React.lazy(async () => {
  const module = await importAgentsScreen();
  return { default: module.AgentsScreen };
});

// AgentsScreen wraps a SECOND lazy boundary (AgentsView), so warming the route
// chunk alone still leaves AgentsView cold on first navigation. Warm both. The
// dynamic import() keeps AgentsView in its own chunk; the loader dedupes
// against AgentsScreen's own lazy import of the same module.
/** Warms the AgentsScreen route chunk (and its inner AgentsView) so first
 *  navigation doesn't stall. */
export function preloadAgentsScreen(): void {
  void importAgentsScreen();
  void import("@/features/agents/ui/AgentsView");
}

export const Route = createFileRoute("/agents")({
  component: AgentsRouteComponent,
});

function AgentsRouteComponent() {
  return (
    <React.Suspense fallback={<ViewLoadingFallback kind="agents" />}>
      <AgentsScreen />
    </React.Suspense>
  );
}
