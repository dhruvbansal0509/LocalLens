import type { AnalysisResult, Coverage, ScoreComponent } from "@/lib/api/types";
import { SCORE_LIMITATION } from "@/config/categories";
import { cn } from "@/lib/utils";

const FRIENDLY_LABELS: Record<string, string> = {
  competition: "Competition preference score",
  amenities: "Useful places nearby",
  accessibility: "Public transport nearby",
  demographics: "Local population profile",
};

const COVERAGE_LABELS: Record<Coverage["level"], string> = {
  good: "More mapped evidence",
  partial: "Some mapped evidence",
  limited: "Limited mapped evidence",
  insufficient: "Very little mapped evidence",
};

export function CoverageMeter({ level }: { level: Coverage["level"] }) {
  const steps = ["insufficient", "limited", "partial", "good"];
  const idx = steps.indexOf(level);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5" aria-hidden="true">
          {steps.map((s, i) => (
            <span key={s} className={cn("h-2 w-5", i <= idx ? "bg-primary" : "bg-border")} />
          ))}
        </div>
        <span className="text-xs font-medium">{COVERAGE_LABELS[level]}</span>
      </div>
      <p className="text-xs text-muted-foreground">This describes the amount returned by the query, not how completely the area is mapped.</p>
    </div>
  );
}

function componentExplanation(component: ScoreComponent, result: AnalysisResult) {
  switch (component.key) {
    case "competition":
      return "This is not the number of competitors. It is a 0–100 signal based on the number of mapped businesses tagged to your selected category and the competition preference chosen during setup. The actual count is shown separately as direct competitor matches.";
    case "amenities":
      return `This signal is based on ${result.counts.amenities} mapped nearby useful places. The prototype adds five points per mapped place, up to 100. It does not measure whether each place is useful to your customers.`;
    case "accessibility":
      return `This signal is based on ${result.counts.transport} mapped transport points inside your search radius. It does not measure walking time, service frequency, reliability or transport quality.`;
    case "demographics":
      return "This would describe the local population profile. It is currently not included because a suitable official demographic dataset has not been added.";
    default:
      return component.explanation;
  }
}

export function ScoreBlock({ result }: { result: AnalysisResult }) {
  const score = result.score;
  return (
    <section aria-labelledby="score-h" className="space-y-5">
      <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-end">
        <div>
          <p id="score-h" className="eyebrow">Initial location screening score</p>
          {score.status === "scored" ? (
            <p className="font-display text-7xl leading-none">
              {Math.round(score.value)}
              <span className="ml-1 font-mono text-base text-muted-foreground">/100</span>
            </p>
          ) : (
            <p className="font-display text-4xl text-terracotta">Not enough data</p>
          )}
        </div>
        <div className="space-y-2 sm:border-l sm:border-border sm:pl-6">
          <p className="eyebrow">Evidence available</p>
          <CoverageMeter level={result.coverage.level} />
          {result.coverage.note && <p className="text-xs text-muted-foreground">{result.coverage.note}</p>}
        </div>
      </div>

      {score.status === "insufficient_data" && (
        <p className="text-sm text-muted-foreground">
          LocalLens did not find enough mapped information across supported indicators to calculate a score. You can still review the places that were found; a wider radius may return more evidence.
        </p>
      )}

      <p className="border-l-2 border-terracotta pl-3 text-sm text-muted-foreground">{SCORE_LIMITATION}</p>

      {score.components && score.components.length > 0 && (
        <div className="space-y-3">
          <h3 className="eyebrow">What each signal means</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {score.components.map((component) => (
              <ComponentCard key={component.key} component={component} result={result} />
            ))}
          </div>
        </div>
      )}

      {score.status === "scored" && (
        <details className="rounded-md border border-border p-4 text-sm">
          <summary className="cursor-pointer font-medium">How the overall score is worked out</summary>
          <p className="mt-2 text-muted-foreground">
            LocalLens combines the available signals using their weights. If a data group is unavailable, it is left out and the remaining weights are adjusted to total 100%. This is an experimental rule, not a method validated against actual business outcomes.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Technical note: {score.method}</p>
        </details>
      )}
    </section>
  );
}

function ComponentCard({ component, result }: { component: ScoreComponent; result: AnalysisResult }) {
  const label = FRIENDLY_LABELS[component.key] ?? component.label;
  const included = component.available && component.value != null;
  return (
    <article className="rounded-md border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-sm font-medium">{label}</h4>
        <span className="shrink-0 font-mono text-sm">
          {included ? `${Math.round(component.value!)} / 100` : "Not included"}
        </span>
      </div>
      {included && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border" role="img" aria-label={`${label}: ${Math.round(component.value!)} out of 100`}>
          <div className="h-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, component.value!))}%` }} />
        </div>
      )}
      {!included && <p className="mt-2 text-xs text-muted-foreground">No suitable data is currently available for this part.</p>}
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-primary underline underline-offset-2">What does this mean?</summary>
        <p className="mt-2 leading-5 text-muted-foreground">{componentExplanation(component, result)}</p>
        <p className="mt-2 leading-5 text-muted-foreground">
          Default weight: {component.default_weight}%. {component.applied_weight == null
            ? "Not used in the overall score."
            : `Weight used in this result: ${component.applied_weight.toFixed(1)}%.`}
        </p>
      </details>
    </article>
  );
}
