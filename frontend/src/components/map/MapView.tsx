import "maplibre-gl/dist/maplibre-gl.css";
import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useEffect, useRef, useState } from "react";
import type { LatLon, Place } from "@/lib/api/types";
import { styleUrl } from "@/lib/maptiler";

// Vite serves MapLibre's worker as a local asset in the development build.
maplibregl.setWorkerUrl(workerUrl);

// Browser-only module: import via React.lazy behind <ClientOnly>.

function circle(center: LatLon, radiusM: number, steps = 64) {
  const coords: [number, number][] = [];
  const dLat = radiusM / 111320;
  const dLon = radiusM / (111320 * Math.cos((center.lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    coords.push([center.lon + dLon * Math.cos(a), center.lat + dLat * Math.sin(a)]);
  }
  return { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [coords] } };
}


export default function MapView({
  selected,
  radius,
  places = [],
  onPick,
  interactive = true,
}: {
  selected: LatLon | null;
  radius: number;
  places?: Place[];
  onPick?: (p: LatLon) => void;
  interactive?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    if (!box.current) return;
    const m = new maplibregl.Map({
      container: box.current,
      style: styleUrl(),
      center: selected ? [selected.lon, selected.lat] : [78.9629, 22.5937],
      zoom: selected ? 14 : 4.2,
      attributionControl: { compact: true },
      interactive,
    });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("error", (e: any) => {
      const msg = (e as any)?.error?.message as string | undefined;
      if (msg && /401|403|Forbidden|Unauthorized/i.test(msg)) setErr("Map tiles were refused. Check that the map key is valid and allowed for this address.");
    });
    m.on("load", () => {
      // Use explicit hex colours in WebGL paint expressions. The site's CSS
      // tokens are authored in OKLCH; converting them to hex here avoids
      // map-style parsers that do not accept every modern CSS colour syntax.
      const colors = {
        competitor: "#B5664B",
        amenity: "#42677D",
        transport: "#30363B",
        business: "#858B73",
        primary: "#42677D",
      };
      m.addSource("radius", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "radius-fill", type: "fill", source: "radius", paint: { "fill-color": colors.primary, "fill-opacity": 0.06 } });
      m.addLayer({ id: "radius-line", type: "line", source: "radius", paint: { "line-color": colors.primary, "line-width": 1.2, "line-dasharray": [3, 2] } });
      m.addSource("places", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "places",
        type: "circle",
        source: "places",
        paint: {
          "circle-radius": [
            "match", ["get", "kind"],
            "competitor", 7,
            "amenity", 6,
            "transport", 5,
            6,
          ],
          "circle-opacity": 0.96,
          "circle-stroke-width": 1.6,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-opacity": 1,
          "circle-color": ["match", ["get", "kind"], "competitor", colors.competitor, "amenity", colors.amenity, "transport", colors.transport, colors.business],
        },
      });
      m.on("click", "places", (e: any) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as any;
        new maplibregl.Popup({ closeButton: false })
          .setLngLat((f.geometry as any).coordinates)
          .setHTML(`<strong>${(p.name || "Unnamed place").replace(/</g, "&lt;")}</strong><br/><span style="font-size:11px">${p.category} · ${p.kind}</span>`)
          .addTo(m);
      });
      m.on("click", (e: any) => {
        if (m.queryRenderedFeatures(e.point, { layers: ["places"] }).length) return;
        pickRef.current?.({ lat: e.lngLat.lat, lon: e.lngLat.lng });
      });
      setReady(true);
    });
    return () => m.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const src = m.getSource("radius") as maplibregl.GeoJSONSource;
    if (selected) {
      src.setData({ type: "FeatureCollection", features: [circle(selected, radius)] });
      if (!marker.current) {
        const el = document.createElement("div");
        el.className = "h-4 w-4 rounded-full border-2 border-card bg-terracotta";
        marker.current = new maplibregl.Marker({ element: el });
      }
      marker.current.setLngLat([selected.lon, selected.lat]).addTo(m);
      const zoom = radius <= 500 ? 15 : radius <= 1000 ? 14 : 13;
      m.flyTo({ center: [selected.lon, selected.lat], zoom, duration: 700 });
    } else {
      src.setData({ type: "FeatureCollection", features: [] });
      marker.current?.remove();
    }
  }, [selected?.lat, selected?.lon, radius, ready]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const features = places.flatMap((p) => {
      const lat = Number(p.lat);
      const lon = Number(p.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) ||
          lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return [];
      }
      return [{
        type: "Feature" as const,
        properties: {
          name: p.name || "Unnamed place",
          kind: p.kind,
          category: p.category || "other",
        },
        geometry: {
          type: "Point" as const,
          coordinates: [lon, lat] as [number, number],
        },
      }];
    });
    (m.getSource("places") as maplibregl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features,
    });
  }, [places, ready]);

  return (
    <div className="relative h-full w-full">
      <div ref={box} className="h-full w-full" role="region" aria-label="Interactive map" />
      {err && (
        <div className="absolute inset-x-4 top-4 rounded-md border border-destructive/40 bg-card p-3 text-sm text-destructive">{err}</div>
      )}
    </div>
  );
}
