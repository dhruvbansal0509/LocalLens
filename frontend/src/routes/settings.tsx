import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { PageHead, StateBadge, StatusNote } from "@/components/states/StatusNote";
import { api, describeError } from "@/lib/api/client";
import { useBackendHealth } from "@/lib/api/hooks";
import { hasMapKey, styleUrl } from "@/lib/maptiler";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Data status and sources — LocalLens" },
      { name: "description", content: "Availability of map, geographic data, demographic datasets and models used by LocalLens, plus source attributions." },
      { property: "og:title", content: "Data status and sources — LocalLens" },
      { property: "og:description", content: "Which data sources LocalLens uses and their current availability." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Settings,
});

function Row({ name, state, detail }: { name: string; state: string; detail?: string | undefined }) {
  return (
    <div className="grid gap-1 border-b border-border py-4 sm:grid-cols-[220px_160px_1fr]">
      <p className="font-medium">{name}</p>
      <StateBadge state={state} />
      <p className="text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

function Settings() {
  const map = useQuery({
    queryKey: ["map-check"],
    enabled: hasMapKey(),
    retry: false,
    queryFn: async () => {
      const r = await fetch(styleUrl());
      if (!r.ok) throw new Error(`Map style request returned ${r.status}`);
      return true;
    },
  });
  const health = useBackendHealth();
  const status = useQuery({ queryKey: ["status"], queryFn: api.status, retry: false, enabled: health.isSuccess });

  const mapState = !hasMapKey() ? "not_configured" : map.isPending ? "checking" : map.isSuccess ? "available" : "unavailable";
  const mapDetail = !hasMapKey() ? "No browser map key is set." : map.isError ? (map.error as Error).message : "Map tiles and location search respond.";
  const be = health.isPending ? "checking" : health.isSuccess ? "available" : "unavailable";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <PageHead eyebrow="Settings" title="Data status">
        Each service is checked with a real request. A configured setting alone is not treated as working.
      </PageHead>
      <div className="flex justify-end pt-4">
        <Button variant="outline" size="sm" onClick={() => { map.refetch(); health.refetch(); status.refetch(); }}>Re-check</Button>
      </div>
      <section className="mt-2">
        <Row name="Map and location search" state={mapState} detail={mapDetail} />
        <Row name="Local analysis service" state={be} detail={health.isError ? describeError(health.error) : health.data ? `Responding${health.data.version ? ` · v${health.data.version}` : ""}` : undefined} />
        {status.data ? (
          <>
            <Row name="Mapped places (OpenStreetMap)" state={status.data.geographic_data.state} detail={status.data.geographic_data.detail} />
            {status.data.models.map((m) => <Row key={m.name} name={m.purpose} state={m.state} detail={m.detail} />)}
          </>
        ) : (
          <>
            <Row name="Mapped places (OpenStreetMap)" state={health.isPending ? "checking" : "unavailable"} detail="Reported by the local analysis service." />
            <Row name="Business-description matching" state={health.isPending ? "checking" : "unavailable"} detail="Runs in the local analysis service." />
            <Row name="Visual site audit" state={health.isPending ? "checking" : "unavailable"} detail="Runs in the local analysis service." />
          </>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-3xl">Demographic datasets</h2>
        {status.data?.demographic_datasets.length ? (
          <ul className="mt-3 divide-y divide-border border-y border-border text-sm">
            {status.data.demographic_datasets.map((d) => (
              <li key={d.name} className="flex justify-between gap-4 py-2"><span>{d.name}</span><span className="font-mono text-xs text-muted-foreground">ref. {d.reference_year} · {d.granularity}</span></li>
            ))}
          </ul>
        ) : (
          <StatusNote className="mt-3" title="Demographic data unavailable">
            No official dataset is loaded. Census of India figures, if added, are historical (2011) and labelled with their reference year and granularity.
          </StatusNote>
        )}
      </section>

      <section className="mt-10 space-y-3 text-sm text-muted-foreground">
        <h2 className="font-display text-3xl text-foreground">Sources and limitations</h2>
        <p>Map tiles and location search © MapTiler. Map data © <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>, available under the Open Database Licence.</p>
        <p>Mapped businesses can be incomplete, outdated or miscategorised, especially for small and informal shops. LocalLens does not estimate rent, footfall, income or purchasing power.</p>
        {status.data?.sources.map((s) => <p key={s.name}>{s.name} — {s.attribution}</p>)}
      </section>
      {status.isError && <StatusNote className="mt-6" tone="error" title="Status details unavailable">{describeError(status.error)}</StatusNote>}
    </div>
  );
}
