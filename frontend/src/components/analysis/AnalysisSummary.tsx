import { AlertCircle, CheckCircle2, MapPin, Store, TrainFront, Trees } from "lucide-react";
import type { AnalysisResult } from "@/lib/api/types";

type Recommendation = {
  label: string;
  headline: string;
  explanation: string;
  actions: string[];
  cautious: boolean;
};

function formatRadius(metres: number) {
  if (metres >= 1000) return `${Number((metres / 1000).toFixed(2))} km`;
  return `${metres} m`;
}

function countLabel(value: number, singular: string, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`;
}

function coverageLabel(level: AnalysisResult["coverage"]["level"]) {
  switch (level) {
    case "good": return "Good map evidence returned";
    case "partial": return "Partial map evidence returned";
    case "limited": return "Limited map evidence returned";
    default: return "Very limited map evidence returned";
  }
}

function makeRecommendation(result: AnalysisResult, categoryMatchesAvailable: boolean): Recommendation {
  if (
    result.score.status !== "scored"
    || result.coverage.level === "insufficient"
    || result.coverage.level === "limited"
    || result.counts.total < 5
  ) {
    return {
      label: "More evidence needed",
      headline: "Do not make a location decision from this result yet.",
      explanation: "The map returned too little usable evidence for a dependable first-pass comparison. This does not mean the location is bad; it means LocalLens cannot fairly assess it with the information currently available.",
      actions: [
        "Try a wider search radius or move the pin to a nearby candidate site.",
        "Compare at least two or three candidate locations using the same radius.",
        "Check the street in person before deciding about rent or a lease.",
      ],
      cautious: true,
    };
  }

  if (!categoryMatchesAvailable) {
    return {
      label: "Compare before deciding",
      headline: "Use this as a first look, not a competitor assessment.",
      explanation: "There is some useful map evidence, but category-specific matching is not configured for this business type. LocalLens cannot reliably say how many similar businesses operate nearby.",
      actions: [
        "Review the map and search for similar businesses manually.",
        "Compare this location with other shortlisted areas.",
        "Verify rent, customer demand and real-world footfall locally.",
      ],
      cautious: true,
    };
  }

  const score = result.score.value;
  if (score >= 70) {
    return {
      label: "Worth shortlisting",
      headline: "Keep this location on your shortlist for further checks.",
      explanation: "The available map-based signals look relatively supportive under LocalLens's initial screening rules. This is a reason to investigate the site further—not proof that the business will succeed.",
      actions: [
        "Inspect the category-matched businesses on the map and decide which are genuine competitors.",
        "Compare with two or three alternatives before choosing a site.",
        "Verify rent, visibility, customer demand and actual footfall in person.",
      ],
      cautious: false,
    };
  }
  if (score >= 50) {
    return {
      label: "Compare alternatives",
      headline: "Keep the location under consideration, but compare it before deciding.",
      explanation: "The screening signals are mixed. Some mapped features may be useful, but the overall result is not strong enough to prefer this site without comparing other options.",
      actions: [
        "Review what is nearby and check whether the mapped category matches are real competitors.",
        "Run the same analysis for two or three alternative locations.",
        "Check local rent, customer demand and footfall; these are not measured by the score.",
      ],
      cautious: true,
    };
  }
  return {
    label: "Investigate alternatives",
    headline: "Compare other locations before committing to this one.",
    explanation: "The available signals are relatively weak under the prototype's screening rules. This does not prove the site is unsuitable: important business factors are not included, and map records may be incomplete.",
    actions: [
      "Compare this site with nearby alternatives using the same search radius.",
      "Check whether category-matched businesses indicate strong competition or an established customer cluster.",
      "Validate demand, rent, visibility and footfall through local research and an in-person visit.",
    ],
    cautious: true,
  };
}

export function AnalysisSummary({ result }: { result: AnalysisResult }) {
  const competitionComponent = result.score.components?.find((component) => component.key === "competition");
  const categoryMatchesAvailable = competitionComponent?.available ?? !result.warnings.some((warning) =>
    warning.toLowerCase().includes("category-specific competitor matching is not configured"),
  );
  const recommendation = makeRecommendation(result, categoryMatchesAvailable);
  const scoreValue = result.score.status === "scored" ? Math.round(result.score.value) : null;

  return (
    <section aria-labelledby="summary-title" className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="border-b border-border bg-paper-deep/60 p-6 sm:p-9">
        <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_230px] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-terracotta">Your location decision brief</p>
            <h3 id="summary-title" className="mt-2 max-w-3xl font-display text-4xl leading-tight sm:text-5xl">
              Is this location worth exploring?
            </h3>
            <p className="mt-4 max-w-3xl text-base leading-7 sm:text-lg sm:leading-8">
              LocalLens screened <strong className="font-semibold text-foreground">{result.category.label.toLowerCase()}</strong> opportunities around{" "}
              <strong className="font-semibold text-foreground">{result.location.label}</strong> within a <strong className="font-semibold text-foreground">{formatRadius(result.radius_m)}</strong> radius.
              It returned <strong className="font-semibold text-foreground">{countLabel(result.counts.total, "mapped place")}</strong> from the available map data.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium"><MapPin className="mr-2 inline h-4 w-4" />{result.location.label}</span>
              <span className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium">Search radius: {formatRadius(result.radius_m)}</span>
              <span className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium">{coverageLabel(result.coverage.level)}</span>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5 sm:p-6 lg:text-center">
            <p className="text-base font-semibold">Initial screening score</p>
            {scoreValue !== null ? (
              <p className="mt-2 font-display text-6xl leading-none">{scoreValue}<span className="ml-1 font-sans text-xl text-muted-foreground">/100</span></p>
            ) : (
              <p className="mt-3 font-display text-3xl leading-tight text-terracotta">Not enough data</p>
            )}
            <p className="mt-4 text-base leading-6 text-muted-foreground">
              {scoreValue !== null
                ? "A prototype score based on the map signals available—not a probability of success."
                : "There is not enough evidence to calculate a score for this search."}
            </p>
          </div>
        </div>
      </header>

      <div className="grid gap-0 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={<Store className="h-5 w-5" />}
          label="Businesses tagged to your category"
          value={categoryMatchesAvailable ? String(result.counts.competitors) : "Not available"}
          explanation={categoryMatchesAvailable
            ? "Potential competitor records to review—not a verified list of every direct competitor."
            : "Matching for this business type is not configured, so a count would be misleading."}
        />
        <Metric
          icon={<Trees className="h-5 w-5" />}
          label="Useful places nearby"
          value={String(result.counts.amenities)}
          explanation="Mapped services and places in the area, such as markets, schools, parks or healthcare."
        />
        <Metric
          icon={<TrainFront className="h-5 w-5" />}
          label="Transport points"
          value={String(result.counts.transport)}
          explanation="Mapped transport locations within the search radius; not a measure of service quality."
        />
        <Metric
          icon={<MapPin className="h-5 w-5" />}
          label="Total places returned"
          value={String(result.counts.total)}
          explanation="All places included in this search, across the available map categories."
        />
      </div>

      <div className="space-y-7 p-6 sm:p-9">
        <section className="rounded-lg border border-border p-5 sm:p-7" aria-labelledby="recommendation-heading">
          <div className="flex flex-wrap items-center gap-3">
            {recommendation.cautious
              ? <AlertCircle className="h-7 w-7 shrink-0 text-terracotta" />
              : <CheckCircle2 className="h-7 w-7 shrink-0 text-primary" />}
            <p className="text-base font-semibold uppercase tracking-wide text-terracotta">LocalLens recommendation</p>
            <span className="rounded-full border border-border px-3 py-1.5 text-sm font-semibold">{recommendation.label}</span>
          </div>
          <h4 id="recommendation-heading" className="mt-4 max-w-4xl font-display text-3xl leading-tight sm:text-4xl">
            {recommendation.headline}
          </h4>
          <p className="mt-4 max-w-4xl text-base leading-7 sm:text-lg sm:leading-8">{recommendation.explanation}</p>

          <div className="mt-6">
            <h5 className="text-lg font-semibold">What to do next</h5>
            <ol className="mt-3 grid gap-3 md:grid-cols-3">
              {recommendation.actions.map((action, index) => (
                <li key={action} className="flex gap-3 rounded-md bg-paper-deep/50 p-4 text-base leading-6">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border font-mono text-sm">{index + 1}</span>
                  <span>{action}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="evidence-heading">
          <h4 id="evidence-heading" className="font-display text-2xl sm:text-3xl">What is driving this result?</h4>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <EvidenceCard
              title="Competition around the site"
              value={categoryMatchesAvailable ? countLabel(result.counts.competitors, "category-matched business", "category-matched businesses") : "Not assessed"}
              text={categoryMatchesAvailable
                ? "These are map records tagged to the chosen category. Check individual names and locations to decide which are true competitors."
                : "The current setup cannot reliably match this business type to competitor records."}
            />
            <EvidenceCard
              title="Surrounding activity"
              value={countLabel(result.counts.amenities, "useful place")}
              text="Nearby mapped places can provide context about the area, but their presence does not prove that they will send customers to your business."
            />
            <EvidenceCard
              title="Getting there"
              value={countLabel(result.counts.transport, "transport point")}
              text="These are mapped transport locations in the selected radius. LocalLens does not currently measure routes, service frequency or actual passenger volumes."
            />
          </div>
        </section>

        <section className="rounded-lg border-l-4 border-terracotta bg-paper-deep/50 p-5 sm:p-6" aria-labelledby="limits-heading">
          <h4 id="limits-heading" className="text-xl font-semibold sm:text-2xl">Before you commit money to a site</h4>
          <p className="mt-3 text-base leading-7">
            This result is a first-pass screen based on community-mapped OpenStreetMap records and prototype scoring rules. It does not currently establish actual customer demand, footfall, sales, rent affordability, competitor quality or a reliable local population profile.
            {result.coverage.missing.some((item) => item.toLowerCase().includes("demographic")) || result.demographics.length === 0
              ? " Official demographic data has not been added to this analysis."
              : " Check the demographic data year and coverage in the detailed analysis."}
          </p>
          <p className="mt-3 text-base font-semibold leading-7">Use this recommendation to decide what to investigate next—not as a final go/no-go decision.</p>
        </section>
      </div>
    </section>
  );
}

function Metric({
  icon,
  label,
  value,
  explanation,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  explanation: string;
}) {
  return (
    <div className="min-w-0 border-b border-border p-5 sm:border-r xl:last:border-r-0 [&:nth-child(2n)]:sm:border-r-0 [&:nth-child(2n+1)]:xl:border-r">
      <p className="flex items-center gap-2 text-base font-semibold leading-6">{icon}<span>{label}</span></p>
      <p className={`mt-3 font-display leading-tight ${value.length > 12 ? "text-2xl sm:text-3xl" : "text-4xl"}`}>{value}</p>
      <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">{explanation}</p>
    </div>
  );
}

function EvidenceCard({ title, value, text }: { title: string; value: string; text: string }) {
  return (
    <article className="rounded-lg border border-border p-5 sm:p-6">
      <h5 className="text-base font-semibold sm:text-lg">{title}</h5>
      <p className="mt-3 font-display text-2xl leading-tight sm:text-3xl">{value}</p>
      <p className="mt-3 text-base leading-7 text-muted-foreground">{text}</p>
    </article>
  );
}
