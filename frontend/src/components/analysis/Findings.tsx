import type { AnalysisResult, Indicator } from "@/lib/api/types";

function friendlyKind(kind: string) {
  switch (kind) {
    case "competitor": return "Category match";
    case "amenity": return "Useful place";
    case "transport": return "Transport";
    default: return "Other mapped place";
  }
}

function friendlyWarning(warning: string) {
  const text = warning.toLowerCase();
  if (text.includes("community-mapped") || text.includes("community mapped"))
    return "Map information is contributed by the community, so some places may be missing or out of date.";
  if (text.includes("zero mapped matches"))
    return "A zero count means none were found in this query; it does not prove that no such businesses exist.";
  if (text.includes("no suitable demographic dataset"))
    return "Official local population data has not been added, so the analysis cannot assess the population profile.";
  if (text.includes("prototype heuristics"))
    return "The score uses simple prototype rules. It has not been validated against real business success.";
  if (text.includes("category-specific competitor matching is not configured"))
    return "Direct competitor matching is not configured for this business type, so its count may be incomplete.";
  if (text.includes("no mapped places were returned"))
    return "No places were returned for this search. Try a larger radius or a nearby point; this does not prove the area has no businesses.";
  return warning;
}

function friendlyMissing(missing: string) {
  if (missing.toLowerCase().includes("demographic")) return "Official local population data has not been added yet.";
  if (missing.toLowerCase().includes("competitor")) return "Category-specific competitor matching is not set up for this type.";
  return missing;
}

function friendlyIndicatorLabel(item: Indicator) {
  if (item.key === "transport_count") return "Public transport points nearby";
  if (item.key === "nearest_transport_distance") return "Straight-line distance to nearest transport point";
  return item.label;
}

function IndicatorList({ items, empty }: { items: Indicator[]; empty: string }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <dl className="divide-y divide-border text-sm">
      {items.map((item) => (
        <div key={item.key} className="flex justify-between gap-4 py-3">
          <dt>
            {friendlyIndicatorLabel(item)}
            {item.reference_year && <span className="ml-2 text-xs text-muted-foreground">Data year: {item.reference_year}</span>}
            {item.note && <span className="block max-w-xl text-xs leading-5 text-muted-foreground">{item.note}</span>}
          </dt>
          <dd className="shrink-0 font-mono">{item.value == null ? "Not available" : `${item.value}${item.unit ? ` ${item.unit}` : ""}`}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Counts({ r }: { r: AnalysisResult }) {
  const rows = [
    ["Nearby category matches", r.counts.competitors, "bg-map-competitor"],
    ["Useful places nearby", r.counts.amenities, "bg-map-amenity"],
    ["Public transport points", r.counts.transport, "bg-map-transport"],
    ["All mapped places", r.counts.total, "bg-map-business"],
  ] as const;
  return (
    <div className="grid grid-cols-2 border-y border-border sm:grid-cols-4">
      {rows.map(([label, value, colour]) => (
        <div key={label} className="border-border p-3 [&:not(:last-child)]:border-r">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className={`h-2 w-2 rounded-full ${colour}`} />{label}</p>
          <p className="mt-1 font-mono text-2xl">{value}</p>
        </div>
      ))}
    </div>
  );
}

export function Findings({ r }: { r: AnalysisResult }) {
  const competitionMappingAvailable = r.score.components?.find((component) => component.key === "competition")?.available ?? true;
  const warnings = r.warnings.map(friendlyWarning);
  if (!competitionMappingAvailable && !warnings.some((warning) => warning.toLowerCase().includes("direct competitor matching is not configured"))) {
    warnings.push("Direct competitor matching is not configured for this business type, so its count may be incomplete.");
  }
  return (
    <div className="space-y-8">
      <Counts r={r} />
      <p className="text-xs leading-5 text-muted-foreground">
        Counts are based on mapped OpenStreetMap records returned for this search. They can miss unlisted places or include imperfect tags; a zero count does not mean no businesses exist.
      </p>
      <section>
        <h3 className="eyebrow mb-2">Getting around</h3>
        <IndicatorList items={r.accessibility} empty="No transport indicators were available for this search." />
      </section>
      <section>
        <h3 className="eyebrow mb-2">People who live or work nearby</h3>
        <IndicatorList items={r.demographics} empty="Population information is not available yet because an appropriate official dataset has not been added. This is not included in the score." />
      </section>
      {r.places.length > 0 && (
        <section>
          <h3 className="eyebrow mb-2">Places found in this search ({r.places.length})</h3>
          <p className="mb-3 text-xs text-muted-foreground">These are the individual mapped records behind the counts above.</p>
          <div className="max-h-80 overflow-y-auto border-y border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 pr-2 font-normal">Place</th>
                  <th className="py-2 pr-2 font-normal">Map category</th>
                  <th className="py-2 pr-2 font-normal">Type</th>
                  <th className="py-2 text-right font-normal">Distance</th>
                </tr>
              </thead>
              <tbody>
                {r.places.slice(0, 200).map((place) => (
                  <tr key={place.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-2">{place.name || <span className="text-muted-foreground">Unnamed place</span>}</td>
                    <td className="py-2 pr-2 text-xs text-muted-foreground">{place.category}</td>
                    <td className="py-2 pr-2 text-xs text-muted-foreground">{friendlyKind(place.kind)}</td>
                    <td className="py-2 text-right font-mono text-xs">{place.distance_m != null ? `${Math.round(place.distance_m)} m` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {r.places.length > 200 && <p className="mt-2 text-xs text-muted-foreground">Showing the first 200 records.</p>}
        </section>
      )}
      {(r.coverage.missing.length > 0 || warnings.length > 0) && (
        <section>
          <h3 className="eyebrow mb-2">Data gaps and things to keep in mind</h3>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-5 text-muted-foreground">
            {r.coverage.missing.map((item) => <li key={item}>{friendlyMissing(item)}</li>)}
            {warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}
          </ul>
        </section>
      )}
      <Sources r={r} />
    </div>
  );
}

export function Sources({ r }: { r: AnalysisResult }) {
  return (
    <section>
      <h3 className="eyebrow mb-2">Where this information came from</h3>
      <ul className="space-y-2 text-sm">
        {r.sources.map((source) => (
          <li key={source.name}>
            {source.url ? <a href={source.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{source.name}</a> : source.name}
            <span className="text-muted-foreground"> — {source.attribution}</span>
            <span className="ml-2 block text-xs text-muted-foreground sm:inline">
              {source.retrieved_at && `Retrieved ${new Date(source.retrieved_at).toLocaleString()}`}
              {source.reference_year && ` · Data year: ${source.reference_year}`}
              {source.granularity && ` · ${source.granularity}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
