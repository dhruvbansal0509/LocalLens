import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHead, StatusNote } from "@/components/states/StatusNote";
import { CoverageMeter } from "@/components/analysis/ScoreBlock";
import { SCORE_LIMITATION } from "@/config/categories";
import { api, describeError } from "@/lib/api/client";
import type { AnalysisResult } from "@/lib/api/types";
import { MAX_COMPARE, clearCompare, removeFromCompare, useCompare } from "@/lib/compare-store";

export const Route = createFileRoute("/compare")({
  head: () => ({
    meta: [
      { title: "Compare locations — LocalLens" },
      { name: "description", content: "Compare up to three analysed business locations side by side, with weights, coverage and source dates visible." },
      { property: "og:title", content: "Compare locations — LocalLens" },
      { property: "og:description", content: "Side-by-side evidence for up to three business locations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Compare,
});

const scoreText = (a: AnalysisResult) => (a.score.status === "scored" ? String(Math.round(a.score.value)) : "Insufficient Data");
const comp = (a: AnalysisResult, key: string) => {
  const c = a.score.components?.find((x) => x.key === key);
  if (!c || !c.available || c.value == null) return "Unavailable";
  return `${Math.round(c.value)} / 100`;
};
const refYears = (a: AnalysisResult) =>
  a.sources.map((s) => s.reference_year ?? (s.retrieved_at ? new Date(s.retrieved_at).toLocaleDateString() : "—")).join(", ") || "—";

const ROWS: [string, (a: AnalysisResult) => React.ReactNode][] = [
  ["Business", (a) => a.category.label],
  ["Radius", (a) => `${a.radius_m} m`],
  ["Initial screening score", (a) => <span className="font-display text-3xl">{scoreText(a)}</span>],
  ["Data coverage", (a) => <CoverageMeter level={a.coverage.level} />],
  ["Competition preference score (not a count)", (a) => comp(a, "competition")],
  ["Useful places nearby", (a) => comp(a, "amenities")],
  ["Public transport nearby", (a) => comp(a, "accessibility")],
  ["Local population profile", (a) => comp(a, "demographics")],
  ["Category matches / useful places / transport", (a) => `${a.counts.competitors} / ${a.counts.amenities} / ${a.counts.transport}`],
  ["Source dates", refYears],
  ["Missing indicators", (a) => a.coverage.missing.join(", ") || "None reported"],
];

function notes(items: AnalysisResult[]) {
  const out: string[] = [];
  if (new Set(items.map((i) => i.category.id)).size > 1) out.push("These analyses use different business types, so their scores follow different rules and are not directly comparable.");
  if (new Set(items.map((i) => i.radius_m)).size > 1) out.push("Radii differ between locations; counts cover different areas.");
  if (new Set(items.map((i) => i.coverage.level)).size > 1) out.push("Data coverage differs; a higher score with weaker coverage rests on less evidence.");
  const renorm = items.filter((i) => i.score.status === "scored" && i.score.renormalised).length;
  if (renorm && renorm < items.length) out.push("Some scores were rescaled after excluding missing indicators while others were not.");
  return out;
}

function Compare() {
  const items = useCompare();
  const save = useMutation({
    mutationFn: () => api.compare({ analyses: items, title: items.map((i) => i.location.label.split(",")[0]).join(" vs ") }),
    onSuccess: () => toast.success("Comparison saved to your workspace."),
    onError: (e) => toast.error(describeError(e)),
  });
  const n = notes(items);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <PageHead eyebrow={`Compare · ${items.length} of ${MAX_COMPARE}`} title="Compare locations">
        Add analyses from the analysis page. Differences in data year, coverage and rules are flagged below.
      </PageHead>

      {items.length === 0 ? (
        <div className="py-12">
          <StatusNote title="Nothing to compare yet" action={<Button asChild><Link to="/analyse">Analyse a location</Link></Button>}>
            Run an analysis and choose “Add to comparison”.
          </StatusNote>
        </div>
      ) : (
        <>
          <div className="no-print flex flex-wrap gap-2 py-6">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save comparison"}</Button>
            {items.length < MAX_COMPARE && <Button variant="outline" asChild><Link to="/analyse">Add a location</Link></Button>}
            <Button variant="ghost" onClick={clearCompare}>Clear all</Button>
          </div>
          {n.length > 0 && (
            <StatusNote tone="warning" title="Comparability warnings" className="mb-6">
              <ul className="list-disc pl-4">{n.map((x) => <li key={x}>{x}</li>)}</ul>
            </StatusNote>
          )}

          {/* Desktop table */}
          <table className="hidden w-full table-fixed text-sm md:table">
            <thead>
              <tr className="border-b border-border align-bottom">
                <th className="w-48 py-3" />
                {items.map((a, i) => (
                  <th key={i} className="px-3 py-3 text-left font-normal">
                    <p className="font-display text-2xl leading-tight">{a.location.label.split(",")[0]}</p>
                    <p className="truncate text-xs text-muted-foreground" title={a.location.label}>{a.location.label}</p>
                    <div className="no-print mt-2 flex gap-2 text-xs">
                      {a.id && <Link to="/report/$id" params={{ id: a.id }} className="underline">Report</Link>}
                      <button className="text-muted-foreground underline" onClick={() => removeFromCompare(i)}>Remove</button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([label, fn]) => (
                <tr key={label} className="border-b border-border align-top">
                  <th className="py-3 text-left text-xs font-normal text-muted-foreground">{label}</th>
                  {items.map((a, i) => <td key={i} className="break-words px-3 py-3 font-mono text-xs">{fn(a)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile stacked */}
          <div className="space-y-6 md:hidden">
            {items.map((a, i) => (
              <div key={i} className="border-t border-border pt-4">
                <p className="font-display text-2xl">{a.location.label.split(",")[0]}</p>
                <dl className="mt-2 divide-y divide-border text-sm">
                  {ROWS.map(([label, fn]) => (
                    <div key={label} className="flex justify-between gap-4 py-2">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="text-right font-mono text-xs">{fn(a)}</dd>
                    </div>
                  ))}
                </dl>
                <button className="mt-2 text-xs underline" onClick={() => removeFromCompare(i)}>Remove</button>
              </div>
            ))}
          </div>
          <p className="mt-8 border-l-2 border-terracotta pl-3 text-sm text-muted-foreground">{SCORE_LIMITATION}</p>
        </>
      )}
    </div>
  );
}
