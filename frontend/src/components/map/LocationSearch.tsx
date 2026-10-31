import { Loader2, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { geocode, hasMapKey, type GeocodeHit } from "@/lib/maptiler";
import type { SelectedLocation } from "@/lib/api/types";

export function LocationSearch({ onSelect, placeholder = "Search a city, locality or address in India" }: { onSelect: (l: SelectedLocation) => void; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<GeocodeHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!hasMapKey() || q.trim().length < 3) {
      setHits(null);
      return;
    }
    const t = setTimeout(async () => {
      ctrl.current?.abort();
      ctrl.current = new AbortController();
      setLoading(true);
      setError(null);
      try {
        setHits(await geocode(q.trim(), ctrl.current.signal));
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError((e as Error).message || "Location search failed.");
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [q]);

  const disabled = !hasMapKey();

  return (
    <div className="relative">
      <label htmlFor="loc-search" className="sr-only">Search location</label>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id="loc-search"
        value={q}
        disabled={disabled}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={disabled ? "Location search needs a map key (see Data status)" : placeholder}
        className="h-11 bg-card pl-9 pr-9"
        autoComplete="off"
        role="combobox"
        aria-expanded={open && !!hits}
        aria-controls="loc-results"
      />
      {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      {open && (error || hits) && (
        <ul id="loc-results" role="listbox" className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover text-sm shadow-sm">
          {error && <li className="px-3 py-2.5 text-destructive">{error}</li>}
          {hits && hits.length === 0 && <li className="px-3 py-2.5 text-muted-foreground">No matching places found in India.</li>}
          {hits?.map((h) => (
            <li key={h.id} role="option" aria-selected={false}>
              <button
                type="button"
                className="block w-full px-3 py-2.5 text-left hover:bg-accent"
                onClick={() => {
                  onSelect({ label: h.context || h.label, lat: h.lat, lon: h.lon });
                  setQ(h.label);
                  setOpen(false);
                }}
              >
                <span className="block text-foreground">{h.label}</span>
                <span className="block truncate text-xs text-muted-foreground">{h.context}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
