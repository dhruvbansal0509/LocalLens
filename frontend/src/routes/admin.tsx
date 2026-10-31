import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { PageHead, StateBadge, StatusNote } from "@/components/states/StatusNote";
import { api, describeError } from "@/lib/api/client";
import type { ReportSummary } from "@/lib/api/types";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Local administration — LocalLens" },
      { name: "description", content: "Local operational overview." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Admin,
});

function Block<T>({ title, q, children }: { title: string; q: { isPending: boolean; isError: boolean; error: unknown; data?: T | undefined }; children: (d: NonNullable<T>) => ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-2xl">{title}</h2>
      {q.isPending && <StatusNote tone="loading" title="Loading" />}
      {q.isError && <StatusNote tone="offline" title="Unavailable">{describeError(q.error)}</StatusNote>}
      {q.data !== undefined && children(q.data as NonNullable<T>)}
    </section>
  );
}

function ReportList({ items }: { items: ReportSummary[] }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">None recorded.</p>;
  return (
    <ul className="divide-y divide-border border-y border-border text-sm">
      {items.map((r) => (
        <li key={r.id} className="flex justify-between gap-3 py-2">
          <Link to="/report/$id" params={{ id: r.id }} className="truncate underline-offset-2 hover:underline">{r.title}</Link>
          <span className="shrink-0 font-mono text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
        </li>
      ))}
    </ul>
  );
}

function Admin() {
  const s = useQuery({ queryKey: ["admin", "summary"], queryFn: api.adminSummary, retry: false });
  const imp = useQuery({ queryKey: ["admin", "imports"], queryFn: api.adminImports, retry: false });
  const err = useQuery({ queryKey: ["admin", "errors"], queryFn: api.adminErrors, retry: false });
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <PageHead eyebrow="Local only" title="Administration">Operational records from the local analysis service on this computer.</PageHead>
      <div className="grid gap-10 py-8 lg:grid-cols-2">
        <Block title="Database records" q={s}>
          {(d) => (
            <dl className="grid grid-cols-2 border-t border-border sm:grid-cols-3">
              {Object.entries(d.counts).map(([k, v]) => (
                <div key={k} className="border-b border-border py-3"><dt className="eyebrow">{k.replace(/_/g, " ")}</dt><dd className="font-mono text-xl">{v}</dd></div>
              ))}
            </dl>
          )}
        </Block>
        <Block title="Service health" q={s}>
          {(d) => (
            <div className="space-y-2 text-sm">
              <p className="flex justify-between">Geographic data <StateBadge state={d.geo_health.state} /></p>
              {d.models.map((m) => <p key={m.name} className="flex justify-between">{m.purpose} <StateBadge state={m.state} /></p>)}
            </div>
          )}
        </Block>
        <Block title="Recent analyses" q={s}>{(d) => <ReportList items={d.recent_analyses} />}</Block>
        <Block title="Recent saved reports" q={s}>{(d) => <ReportList items={d.recent_reports} />}</Block>
        <Block title="Data import history" q={imp}>
          {(d) => d.imports.length ? (
            <table className="w-full text-sm"><tbody>
              {d.imports.map((i) => (
                <tr key={i.id} className="border-b border-border"><td className="py-2">{i.dataset}</td><td className="font-mono text-xs">{i.rows} rows</td><td className="text-xs">{i.status}</td><td className="text-right font-mono text-xs text-muted-foreground">{new Date(i.started_at).toLocaleString()}</td></tr>
              ))}
            </tbody></table>
          ) : <p className="text-sm text-muted-foreground">No imports recorded.</p>}
        </Block>
        <Block title="Recent API errors" q={err}>
          {(d) => d.errors.length ? (
            <ul className="divide-y divide-border border-y border-border text-sm">
              {d.errors.map((e) => (
                <li key={e.id} className="py-2"><span className="font-mono text-xs">{e.status} {e.endpoint}</span><p className="text-muted-foreground">{e.message}</p></li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">No errors recorded.</p>}
        </Block>
      </div>
    </div>
  );
}
