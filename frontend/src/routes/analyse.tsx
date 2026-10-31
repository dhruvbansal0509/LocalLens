import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { LocationSearch } from "@/components/map/LocationSearch";
import { MapLegend, MapPanel } from "@/components/map/MapPanel";
import { StatusNote } from "@/components/states/StatusNote";
import { ScoreBlock } from "@/components/analysis/ScoreBlock";
import { AnalysisSummary } from "@/components/analysis/AnalysisSummary";
import { Findings } from "@/components/analysis/Findings";
import { ResultActions } from "@/components/analysis/ResultActions";
import { VisualAudit } from "@/components/analysis/VisualAudit";
import { CATEGORY_GROUPS, DEFAULT_RADIUS, RADIUS_OPTIONS, categoryLabel } from "@/config/categories";
import { api, describeError } from "@/lib/api/client";
import type { AnalysisPreferences, SelectedLocation } from "@/lib/api/types";
import { fmtCoord, reverseGeocode } from "@/lib/maptiler";

type Search = { lat?: number | undefined; lon?: number | undefined; label?: string | undefined; radius?: number | undefined };

export const Route = createFileRoute("/analyse")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    lat: typeof s["lat"] === "number" ? s["lat"] : undefined,
    lon: typeof s["lon"] === "number" ? s["lon"] : undefined,
    label: typeof s["label"] === "string" ? s["label"] : undefined,
    radius: typeof s["radius"] === "number" ? s["radius"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Analyse a location — LocalLens" },
      { name: "description", content: "Get a plain-language summary first, then explore nearby businesses, useful places, transport and the details behind the initial screening score." },
      { property: "og:title", content: "Analyse a location — LocalLens" },
      { property: "og:description", content: "Screen a potential business location in India with source-attributed evidence." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Analyse,
});

const AMENITIES = ["Schools and colleges", "Healthcare", "Offices", "Parks", "Residential areas", "Markets"];

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4 border-b border-border py-6">
      <legend className="flex items-baseline gap-3">
        <span className="font-mono text-xs text-terracotta">0{n}</span>
        <span className="font-display text-2xl">{title}</span>
      </legend>
      {children}
    </fieldset>
  );
}

function Analyse() {
  const s = Route.useSearch();
  const [category, setCategory] = useState("");
  const [desc, setDesc] = useState("");
  const [loc, setLoc] = useState<SelectedLocation | null>(
    s.lat != null && s.lon != null ? { lat: s.lat, lon: s.lon, label: s.label ?? "Selected point" } : null,
  );
  const [radius, setRadius] = useState(s.radius ?? DEFAULT_RADIUS);
  const [prefs, setPrefs] = useState<AnalysisPreferences>({ competition: "neutral", prioritise_transit: false, amenities: [] });

  const interpret = useMutation({ mutationFn: () => api.interpret({ description: desc.trim() }) });
  const analyse = useMutation({
    mutationFn: () =>
      api.analyze({
        category_id: category,
        ...(desc.trim() ? { custom_description: desc.trim() } : {}),
        location: loc!,
        radius_m: radius,
        preferences: prefs,
      }),
  });

  const missing = [!category && "a business type", !loc && "a location"].filter(Boolean);
  const r = analyse.data;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!missing.length) analyse.mutate();
          }}
        >
          <p className="eyebrow">Analysis setup</p>
          <h1 className="mt-1 font-display text-5xl">Analyse a location</h1>

          <Step n={1} title="Your business">
            <div className="space-y-2">
              <Label htmlFor="desc">Describe it in your own words (optional)</Label>
              <Textarea id="desc" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={500} placeholder="e.g. A small filter-coffee kiosk aimed at office workers" className="bg-card" />
              <Button type="button" variant="outline" size="sm" disabled={desc.trim().length < 8 || interpret.isPending} onClick={() => interpret.mutate()}>
                {interpret.isPending ? "Interpreting…" : "Suggest a category"}
              </Button>
              {interpret.isError && <StatusNote tone="offline" title="Suggestion unavailable">{describeError(interpret.error)} You can still choose a category below.</StatusNote>}
              {interpret.data && (
                <div className="rounded-md border border-border bg-card p-3 text-sm">
                  <p className="text-muted-foreground">{interpret.data.explanation}</p>
                  <ul className="mt-2 space-y-1">
                    {interpret.data.suggestions.map((sg) => (
                      <li key={sg.category_id} className="flex items-center justify-between gap-2">
                        <span>{sg.label} <span className="font-mono text-xs text-muted-foreground">similarity {sg.similarity.toFixed(2)}</span></span>
                        <Button type="button" size="sm" variant={category === sg.category_id ? "default" : "ghost"} onClick={() => setCategory(sg.category_id)}>
                          {category === sg.category_id ? "Selected" : "Use this"}
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-muted-foreground">Suggestions are text similarity matches — review before confirming.</p>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Business category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="category" className="bg-card"><SelectValue placeholder="Choose a category" /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_GROUPS.map((g) => (
                    <SelectGroup key={g.id}>
                      <SelectLabel>{g.label}</SelectLabel>
                      {g.categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Step>

          <Step n={2} title="Location and radius">
            <LocationSearch onSelect={setLoc} />
            {loc && (
              <p className="text-sm">{loc.label} <span className="block font-mono text-xs text-muted-foreground">{fmtCoord(loc.lat)}, {fmtCoord(loc.lon)}</span></p>
            )}
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Radius">
              {RADIUS_OPTIONS.map((o) => (
                <button type="button" key={o} role="radio" aria-checked={radius === o} onClick={() => setRadius(o)}
                  className={`rounded-sm border px-3 py-1.5 font-mono text-xs ${radius === o ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-accent"}`}>
                  {o >= 1000 ? `${o / 1000} km` : `${o} m`}
                </button>
              ))}
            </div>
          </Step>

          <Step n={3} title="Preferences">
            <div className="space-y-2">
              <Label>Competition</Label>
              <RadioGroup value={prefs.competition} onValueChange={(v) => setPrefs({ ...prefs, competition: v as AnalysisPreferences["competition"] })} className="gap-2">
                {([["avoid", "Prefer fewer direct competitors"], ["neutral", "Use the category's default rule"], ["cluster", "Prefer an established cluster"]] as const).map(([v, l]) => (
                  <label key={v} className="flex items-center gap-2 text-sm"><RadioGroupItem value={v} />{l}</label>
                ))}
              </RadioGroup>
              <p className="text-xs leading-5 text-muted-foreground">This preference changes how the screening score interprets mapped competitor matches. It does not change the number of nearby businesses shown in the results.</p>
            </div>
            <label className="flex items-center justify-between gap-3 text-sm">
              Public transport access matters most
              <Switch checked={prefs.prioritise_transit} onCheckedChange={(v) => setPrefs({ ...prefs, prioritise_transit: v })} />
            </label>
            <div className="space-y-2">
              <Label>Nearby amenities that help you (optional)</Label>
              <div className="flex flex-wrap gap-2">
                {AMENITIES.map((a) => {
                  const on = prefs.amenities.includes(a);
                  return (
                    <button type="button" key={a} aria-pressed={on} onClick={() => setPrefs({ ...prefs, amenities: on ? prefs.amenities.filter((x) => x !== a) : [...prefs.amenities, a] })}
                      className={`rounded-sm border px-2.5 py-1 text-xs ${on ? "border-primary bg-accent" : "border-border bg-card hover:bg-accent"}`}>
                      {a}
                    </button>
                  );
                })}
              </div>
            </div>
          </Step>

          <div className="space-y-3 pt-6">
            {missing.length > 0 && <p className="text-sm text-muted-foreground">Choose {missing.join(" and ")} to continue.</p>}
            <Button type="submit" size="lg" disabled={missing.length > 0 || analyse.isPending}>
              {analyse.isPending ? "Gathering evidence…" : "Run analysis"}
            </Button>
          </div>
        </form>

        <div className="space-y-3 lg:sticky lg:top-6 lg:self-start">
          <div className="h-[380px] overflow-hidden rounded-md border border-border">
            <MapPanel selected={loc} radius={radius} places={r?.places ?? []} onPick={async (p) => setLoc({ ...p, label: (await reverseGeocode(p.lat, p.lon)) ?? "Dropped point" })} />
          </div>
          <MapLegend />
        </div>
      </div>

      <section aria-live="polite" className="mt-12">
        {analyse.isPending && <StatusNote tone="loading" title="Analysing">Querying mapped places within {radius} m and applying the {categoryLabel(category)} rules. This can take up to a minute.</StatusNote>}
        {analyse.isError && (
          <StatusNote tone="offline" title="Analysis could not run" action={<Button size="sm" variant="outline" onClick={() => analyse.mutate()}>Retry</Button>}>
            {describeError(analyse.error)}
          </StatusNote>
        )}
        {r && (
          <div className="space-y-6 border-t border-border pt-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow">Results · {new Date(r.created_at).toLocaleString()}</p>
                <h2 className="font-display text-4xl">{r.category.label}</h2>
                <p className="text-muted-foreground">{r.location.label} · <span className="font-mono text-xs">{fmtCoord(r.location.lat)}, {fmtCoord(r.location.lon)} · {r.radius_m >= 1000 ? `${r.radius_m / 1000} km` : `${r.radius_m} m`}</span></p>
              </div>
              <ResultActions result={r} />
            </div>
            <AnalysisSummary result={r} />
            <details className="group rounded-lg border border-border bg-card">
              <summary className="cursor-pointer list-none p-5 sm:p-6">
                <span className="flex flex-wrap items-center justify-between gap-3">
                  <span>
                    <span className="block font-display text-2xl">Detailed analysis</span>
                    <span className="mt-1 block text-sm text-muted-foreground">Understand each score signal, inspect the mapped places, see data gaps and check sources.</span>
                  </span>
                  <span className="rounded-sm border border-border px-3 py-2 text-sm group-open:hidden">Show details ↓</span>
                  <span className="hidden rounded-sm border border-border px-3 py-2 text-sm group-open:inline">Hide details ↑</span>
                </span>
              </summary>
              <div className="space-y-10 border-t border-border p-5 sm:p-6">
                <div className="grid gap-10 lg:grid-cols-2">
                  <ScoreBlock result={r} />
                  <Findings r={r} />
                </div>
                <div className="border-t border-border pt-8"><VisualAudit /></div>
              </div>
            </details>
          </div>
        )}
      </section>
    </div>
  );
}
