import { ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense, type ComponentProps } from "react";
import { hasMapKey } from "@/lib/maptiler";
import { StatusNote } from "@/components/states/StatusNote";

const MapView = lazy(() => import("./MapView"));

export function MapPanel(props: ComponentProps<typeof MapView>) {
  const fallback = <div className="h-full w-full animate-pulse bg-paper-deep" />;
  if (!hasMapKey())
    return (
      <div className="contour-bg flex h-full w-full items-center justify-center bg-paper-deep p-6">
        <StatusNote tone="warning" title="Map not configured" className="max-w-md">
          Add a MapTiler browser key as <code className="font-mono">VITE_MAPTILER_KEY</code> and restrict it to your local and preview addresses. Live tiles and location search stay off until then.
        </StatusNote>
      </div>
    );
  return (
    <ClientOnly fallback={fallback}>
      <Suspense fallback={fallback}>
        <MapView {...props} />
      </Suspense>
    </ClientOnly>
  );
}

export function MapLegend() {
  const items = [
    ["bg-map-competitor", "Competitors"],
    ["bg-map-amenity", "Amenities"],
    ["bg-map-transport", "Transport points"],
    ["bg-map-business", "Other businesses"],
    ["bg-terracotta ring-2 ring-card", "Selected point"],
  ];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      {items.map(([c, l]) => (
        <li key={l} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${c}`} />
          {l}
        </li>
      ))}
    </ul>
  );
}
