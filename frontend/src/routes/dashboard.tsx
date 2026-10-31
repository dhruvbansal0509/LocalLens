import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageHead, StatusNote } from "@/components/states/StatusNote";
import { CoverageMeter } from "@/components/analysis/ScoreBlock";
import { api, describeError } from "@/lib/api/client";
import type { ReportSummary } from "@/lib/api/types";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "My workspace — LocalLens" },
      { name: "description", content: "Your saved LocalLens analyses and comparisons." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard, retry: false });
  const [del, setDel] = useState<ReportSummary | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteReport(id),
    onSuccess: () => {
      toast.success("Report deleted.");
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => toast.error(describeError(e)),
  });

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <PageHead eyebrow="Workspace" title="Saved analyses">
        Everything here is stored on this computer by your local analysis service.
      </PageHead>
      <div className="py-6">
        {q.isPending && <StatusNote tone="loading" title="Loading your workspace" />}
        {q.isError && (
          <StatusNote tone="offline" title="Workspace unavailable" action={<Button size="sm" variant="outline" onClick={() => q.refetch()}>Retry</Button>}>
            {describeError(q.error)}
          </StatusNote>
        )}
        {q.data && q.data.recent.length === 0 && (
          <StatusNote title="No saved analyses yet" action={<Button asChild><Link to="/analyse">Analyse a location</Link></Button>}>
            Saved analyses and comparisons will appear here.
          </StatusNote>
        )}
        {q.data && q.data.recent.length > 0 && (
          <>
            <p className="mb-4 font-mono text-xs text-muted-foreground">{q.data.totals.analyses} analyses · {q.data.totals.comparisons} comparisons</p>
            <ul className="divide-y divide-border border-y border-border">
              {q.data.recent.map((r) => (
                <li key={r.id} className="grid gap-3 py-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center sm:gap-6">
                  <div className="min-w-0">
                    <p className="eyebrow">{r.kind} · {new Date(r.created_at).toLocaleString()}</p>
                    <p className="truncate font-medium">{r.title}</p>
                    <p className="truncate text-sm text-muted-foreground">{r.category_label} · {r.location_label}</p>
                  </div>
                  <span className="font-display text-3xl">{r.score == null ? <span className="text-base text-muted-foreground">No score</span> : Math.round(r.score)}</span>
                  <CoverageMeter level={r.coverage} />
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" asChild><Link to="/report/$id" params={{ id: r.id }}>Open</Link></Button>
                    <Button size="sm" variant="ghost" onClick={() => setDel(r)}>Delete</Button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this report?</AlertDialogTitle>
            <AlertDialogDescription>“{del?.title}” will be permanently removed from your workspace.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => del && remove.mutate(del.id)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
