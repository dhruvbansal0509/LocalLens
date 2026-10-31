import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { StatusNote } from "@/components/states/StatusNote";
import { ScoreBlock } from "@/components/analysis/ScoreBlock";
import { Findings } from "@/components/analysis/Findings";
import { ApiError, api, describeError } from "@/lib/api/client";
import { fmtCoord } from "@/lib/maptiler";

export const Route = createFileRoute("/report/$id")({
  head: () => ({
    meta: [
      { title: "Location report — LocalLens" },
      { name: "description", content: "Saved LocalLens business-location report." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ReportPage,
});

function ReportPage() {
  const { id } = Route.useParams();
  const q = useQuery({ queryKey: ["report", id], queryFn: () => api.report(id), retry: false });

  if (q.isPending) return <div className="mx-auto w-full max-w-4xl p-6"><StatusNote tone="loading" title="Loading report" /></div>;
  if (q.isError) {
    const nf = q.error instanceof ApiError && q.error.kind === "not_found";
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-16">
        <StatusNote tone={nf ? "warning" : "offline"} title={nf ? "Report not found" : "Report unavailable"} action={<Button asChild variant="outline"><Link to="/dashboard">Back to workspace</Link></Button>}>
          {nf ? `No saved report exists with ID ${id}.` : describeError(q.error)}
        </StatusNote>
      </div>
    );
  }
  const rep = q.data;
  return (
    <article className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <header className="border-b-2 border-foreground pb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">LocalLens {rep.kind === "comparison" ? "comparison" : "location"} report · <span className="font-mono">#{rep.id}</span></p>
            <h1 className="mt-2 font-display text-5xl">{rep.title}</h1>
            <p className="mt-2 font-mono text-xs text-muted-foreground">Created {new Date(rep.created_at).toLocaleString()}</p>
          </div>
          <Button className="no-print" variant="outline" onClick={() => window.print()}>Print or save PDF</Button>
        </div>
      </header>
      {rep.analyses.map((a, i) => (
        <section key={i} className="space-y-8 border-b border-border py-10 [break-inside:avoid-page]">
          <div>
            <p className="eyebrow">Analysis {rep.analyses.length > 1 ? i + 1 : ""} · {new Date(a.created_at).toLocaleString()}</p>
            <h2 className="font-display text-3xl">{a.category.label} — {a.location.label}</h2>
            <p className="font-mono text-xs text-muted-foreground">{fmtCoord(a.location.lat)}, {fmtCoord(a.location.lon)} · radius {a.radius_m} m</p>
            {a.custom_description && <p className="mt-2 text-sm italic text-muted-foreground">“{a.custom_description}”</p>}
          </div>
          <ScoreBlock result={a} />
          <Findings r={a} />
        </section>
      ))}
    </article>
  );
}
