import { AlertTriangle, Info, Loader2, PlugZap } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "info" | "warning" | "error" | "loading" | "offline";

const tones: Record<Tone, string> = {
  info: "border-border bg-card",
  warning: "border-warning/40 bg-warning/5",
  error: "border-destructive/40 bg-destructive/5",
  loading: "border-border bg-card",
  offline: "border-terracotta/40 bg-terracotta/5",
};

export function StatusNote({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: Tone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const Icon = tone === "loading" ? Loader2 : tone === "offline" ? PlugZap : tone === "info" ? Info : AlertTriangle;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-md border p-4 text-sm", tones[tone], className)}>
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", tone === "loading" && "animate-spin", tone === "error" && "text-destructive", tone === "offline" && "text-terracotta")} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium text-foreground">{title}</p>
        {children && <div className="text-muted-foreground">{children}</div>}
        {action && <div className="pt-2">{action}</div>}
      </div>
    </div>
  );
}

export function StateBadge({ state }: { state: "available" | "unavailable" | "not_configured" | "checking" | "not_downloaded" | string }) {
  const map: Record<string, [string, string]> = {
    available: ["Available", "bg-success"],
    unavailable: ["Unavailable", "bg-destructive"],
    not_configured: ["Not configured", "bg-muted-foreground"],
    not_downloaded: ["Not downloaded", "bg-warning"],
    checking: ["Checking", "bg-primary animate-pulse"],
  };
  const [label, dot] = map[state] ?? [state, "bg-muted-foreground"];
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs">
      <span className={cn("h-2 w-2 rounded-full", dot)} />
      {label}
    </span>
  );
}

export function PageHead({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="border-b border-border pb-6">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mt-2 font-display text-4xl sm:text-5xl">{title}</h1>
      {children && <div className="mt-3 max-w-2xl text-muted-foreground">{children}</div>}
    </div>
  );
}
