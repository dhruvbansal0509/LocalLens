import type { SelectedLocation } from "./api/types";

export const MAPTILER_KEY = (import.meta.env["VITE_MAPTILER_KEY"] as string | undefined) || "";
export const hasMapKey = () => MAPTILER_KEY.length > 0;
export const styleUrl = () => `https://api.maptiler.com/maps/dataviz/style.json?key=${MAPTILER_KEY}`;

export type GeocodeHit = SelectedLocation & { id: string; context: string };

export async function geocode(query: string, signal?: AbortSignal): Promise<GeocodeHit[]> {
  const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${MAPTILER_KEY}&country=in&limit=6&language=en`;
  const res = await fetch(url, { signal: signal ?? null });
  if (res.status === 429) throw new Error("Location search is rate-limited. Try again shortly.");
  if (res.status === 401 || res.status === 403) throw new Error("The map key was rejected. Check its restrictions.");
  if (!res.ok) throw new Error(`Location search failed (${res.status}).`);
  const data = await res.json();
  return (data.features ?? []).map((f: any) => ({
    id: String(f.id),
    label: f.text ?? f.place_name,
    context: f.place_name ?? "",
    lon: f.center[0],
    lat: f.center[1],
  }));
}

export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const res = await fetch(`https://api.maptiler.com/geocoding/${lon},${lat}.json?key=${MAPTILER_KEY}&limit=1&language=en`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.features?.[0]?.place_name ?? null;
  } catch {
    return null;
  }
}

export const fmtCoord = (n: number) => n.toFixed(5);
