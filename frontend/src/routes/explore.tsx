import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LocationSearch } from "@/components/map/LocationSearch";
import { MapLegend, MapPanel } from "@/components/map/MapPanel";
import { StatusNote } from "@/components/states/StatusNote";
import { DEFAULT_RADIUS, RADIUS_OPTIONS } from "@/config/categories";
import { api, describeError } from "@/lib/api/client";
import type { SelectedLocation } from "@/lib/api/types";
import { fmtCoord, reverseGeocode } from "@/lib/maptiler";

export const Route = createFileRoute("/explore")({
  head: () => ({
    meta: [
      { title: "Explore the map — LocalLens" },
      { name: "description", content: "Search any locality in India, pick a point and radius, and load mapped businesses, amenities and transport points." },
      { property: "og:title", content: "Explore the map — LocalLens" },
      { property: "og:description", content: "Interactive map for business-location research across India." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Explore,
});

function Explore() {
  const [sel, setSel] = useState<SelectedLocation | null>(null);
  const [radius, setRadius] = useState<number>(DEFAULT_RADIUS);
  const places = useMutation({ mutationFn: () => api.places({ lat: sel!.lat, lon: sel!.lon, radius_m: radius }) });

  const choose = (l: SelectedLocation) => {
    setSel(l);
    places.reset();
  };

  return (
    <div className="grid flex-1 lg:grid-cols-[400px_1fr]">
      <aside className="order-2 space-y-6 border-r border-border p-4 sm:p-6 lg:order-1">
        <div>
          <p className="eyebrow">Explore</p>
          <h1 className="mt-1 font-display text-4xl">Survey an area</h1>
        </div>
        <LocationSearch onSelect={choose} />
        <p className="text-xs text-muted-foreground">Or click anywhere on the map to drop a point.</p>

        <div className="space-y-1 border-y border-border py-3">
          <p className="eyebrow">Selected point</p>
          {sel ? (
            <>
              <p className="text-sm">{sel.label}</p>
              <p className="font-mono text-xs text-muted-foreground">{fmtCoord(sel.lat)}, {fmtCoord(sel.lon)}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No point selected yet.</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <label className="text-sm" htmlFor="radius">Radius</label>
          <Select value={String(radius)} onValueChange={(v) => setRadius(Number(v))}>
            <SelectTrigger id="radius" className="w-36 bg-card"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RADIUS_OPTIONS.map((r) => <SelectItem key={r} value={String(r)}>{r >= 1000 ? `${r / 1000} km` : `${r} m`}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Button disabled={!sel || places.isPending} variant="outline" onClick={() => places.mutate()}>
            {places.isPending ? "Loading mapped places…" : "Load mapped places"}
          </Button>
          <Button disabled={!sel} asChild={!!sel}>
            {sel ? (
              <Link to="/analyse" search={{ lat: sel.lat, lon: sel.lon, label: sel.label, radius }}>Analyse this location</Link>
            ) : (
              <span>Analyse this location</span>
            )}
          </Button>
        </div>

        {places.isError && <StatusNote tone="offline" title="Mapped places unavailable">{describeError(places.error)}</StatusNote>}
        {places.data && (
          <div className="space-y-2 text-sm">
            {places.data.places.length === 0 ? (
              <StatusNote title="No mapped places returned">The map source has no matching records within this radius. That doesn't prove the area is empty.</StatusNote>
            ) : (
              <>
                <p><span className="font-mono">{places.data.places.length}</span> mapped places within {radius} m{places.data.truncated && " (truncated)"}.</p>
                <ul className="max-h-64 divide-y divide-border overflow-y-auto border-y border-border">
                  {places.data.places.map((p) => (
                    <li key={p.id} className="flex justify-between gap-2 py-1.5">
                      <span className="truncate">{p.name || "Unnamed"}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{p.category}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="text-xs text-muted-foreground">Source: {places.data.source.attribution}{places.data.source.retrieved_at && ` · ${new Date(places.data.source.retrieved_at).toLocaleString()}`}</p>
          </div>
        )}
        <MapLegend />
      </aside>
      <div className="order-1 h-[55vh] lg:order-2 lg:h-auto lg:min-h-[640px]">
        <MapPanel
          selected={sel}
          radius={radius}
          places={places.data?.places ?? []}
          onPick={async (p) => {
            const label = (await reverseGeocode(p.lat, p.lon)) ?? "Dropped point";
            choose({ ...p, label });
          }}
        />
      </div>
    </div>
  );
}
