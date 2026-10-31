import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { CATEGORY_GROUPS, DEFAULT_WEIGHTS, SCORE_LIMITATION } from "@/config/categories";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LocalLens — Find the right place to grow your business" },
      { name: "description", content: "Screen business locations across India with a clear summary of nearby category matches, useful places, public transport and available map evidence." },
      { property: "og:title", content: "LocalLens — Find the right place to grow your business" },
      { property: "og:description", content: "Evaluate, compare and save potential business locations in India using transparent, source-attributed geographic evidence." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Preview() {
  // Labelled illustrative interface sketch — not a real result.
  return (
    <figure className="relative overflow-hidden rounded-md border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="eyebrow">Analysis workspace</span>
        <span className="rounded-sm bg-terracotta/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-terracotta">Illustrative layout</span>
      </div>
      <div className="grid sm:grid-cols-[1.3fr_1fr]">
        <svg viewBox="0 0 320 240" className="h-full w-full bg-paper-deep" role="img" aria-label="Schematic map with a search radius around a selected point">
          {[30, 55, 80, 105].map((r) => (
            <circle key={r} cx="170" cy="120" r={r} className="fill-none stroke-border" strokeWidth="1" />
          ))}
          <path d="M0 160 C80 140 120 190 200 150 S300 100 320 120" className="fill-none stroke-card" strokeWidth="9" />
          <path d="M120 0 L150 240" className="fill-none stroke-card" strokeWidth="6" />
          <circle cx="170" cy="120" r="70" className="fill-primary/5 stroke-primary" strokeDasharray="4 3" strokeWidth="1.2" />
          {[[140, 95], [205, 140], [190, 80]].map(([x, y]) => <circle key={`${x}${y}`} cx={x!} cy={y!} r="4" className="fill-map-competitor stroke-card" />)}
          {[[150, 150], [215, 105], [125, 120], [180, 170]].map(([x, y]) => <circle key={`${x}${y}`} cx={x!} cy={y!} r="4" className="fill-map-amenity stroke-card" />)}
          {[[146, 60], [148, 185]].map(([x, y]) => <rect key={`${x}${y}`} x={x! - 3.5} y={y! - 3.5} width="7" height="7" className="fill-map-transport" />)}
          <circle cx="170" cy="120" r="6" className="fill-terracotta stroke-card" strokeWidth="2" />
        </svg>
        <div className="space-y-4 border-t border-border p-4 text-sm sm:border-l sm:border-t-0">
          <div>
            <p className="eyebrow">Initial screening score</p>
            <p className="font-display text-4xl text-muted-foreground">— <span className="font-mono text-xs">/100</span></p>
          </div>
          <ul className="space-y-2">
            {DEFAULT_WEIGHTS.map((w) => (
              <li key={w.key}>
                <div className="flex justify-between text-xs"><span>{w.label}</span><span className="font-mono">{w.weight}%</span></div>
                <div className="mt-1 h-1 bg-border"><div className="h-1 bg-primary" style={{ width: `${w.weight * 3}%` }} /></div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">These are starting weights; unavailable data may be left out of an individual result.</p>
        </div>
      </div>
    </figure>
  );
}

function Home() {
  return (
    <div>
      <section className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:py-24">
        <div>
          <p className="eyebrow">Business-location research · India</p>
          <h1 className="mt-4 font-display text-5xl sm:text-6xl lg:text-7xl">Find the right place to grow your business.</h1>
          <p className="mt-6 max-w-lg text-lg text-muted-foreground">
            Pick a business type and an area. LocalLens gathers mapped competitors, nearby amenities and transport access around it, and shows you how each finding was reached.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" asChild><Link to="/analyse">Analyse a location</Link></Button>
            <Button size="lg" variant="outline" asChild><Link to="/explore">Explore the map</Link></Button>
          </div>
        </div>
        <Preview />
      </section>

      <section className="border-y border-border bg-card">
        <ol className="mx-auto grid max-w-7xl px-4 sm:px-6 md:grid-cols-3">
          {[
            ["Choose a business", "Pick a category, or describe your idea in your own words and confirm the suggested match."],
            ["Explore an area", "Search any city, locality or address in India, drop a point and set a radius."],
            ["Compare evidence", "Review counts, accessibility and sources side by side for up to three locations."],
          ].map(([t, d], i) => (
            <li key={t} className="border-border py-8 md:px-6 md:first:pl-0 [&:not(:last-child)]:border-b md:[&:not(:last-child)]:border-b-0 md:[&:not(:last-child)]:border-r">
              <span className="font-mono text-xs text-terracotta">0{i + 1}</span>
              <h2 className="mt-2 font-display text-3xl">{t}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2">
        <div>
          <p className="eyebrow">How the initial screening score works</p>
          <h2 className="mt-3 font-display text-4xl">A transparent screening aid, not a forecast.</h2>
          <p className="mt-4 text-muted-foreground">
            The score combines four simple signals: businesses mapped to your category, useful places nearby, public transport points and local population information when an official dataset is available. If a data group is missing, LocalLens leaves it out and adjusts the remaining weights. When there is too little mapped evidence, you will see “Not enough data” instead of a score.
          </p>
          <p className="mt-4 border-l-2 border-terracotta pl-3 text-sm text-muted-foreground">{SCORE_LIMITATION}</p>
        </div>
        <table className="self-start text-sm">
          <tbody>
            {DEFAULT_WEIGHTS.map((w) => (
              <tr key={w.key} className="border-b border-border">
                <td className="py-3 pr-6">{w.label}</td>
                <td className="py-3 text-right font-mono">{w.weight}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <p className="eyebrow">Supported business categories</p>
          <div className="mt-6 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {CATEGORY_GROUPS.filter((g) => g.id !== "custom").map((g) => (
              <div key={g.id}>
                <h3 className="font-display text-2xl">{g.label}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{g.categories.map((c) => c.label).join(", ")}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-sm text-muted-foreground">Something else? Describe it and choose the closest match, or use a custom type.</p>
        </div>
      </section>
    </div>
  );
}
