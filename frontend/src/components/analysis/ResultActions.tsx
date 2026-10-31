import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, describeError } from "@/lib/api/client";
import type { AnalysisResult } from "@/lib/api/types";
import { addToCompare } from "@/lib/compare-store";

export function ResultActions({ result }: { result: AnalysisResult }) {
  const [savedId, setSavedId] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      api.saveReport({ kind: "analysis", title: `${result.category.label} — ${result.location.label}`, analyses: [result] }),
    onSuccess: (r) => {
      setSavedId(r.id);
      toast.success("Analysis saved to your workspace.");
    },
    onError: (e) => toast.error(describeError(e)),
  });
  return (
    <div className="no-print flex flex-wrap gap-2">
      {savedId ? (
        <Button asChild>
          <Link to="/report/$id" params={{ id: savedId }}>View detailed report</Link>
        </Button>
      ) : (
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save analysis"}
        </Button>
      )}
      <Button
        variant="outline"
        onClick={() => {
          const r = addToCompare(result);
          if (r === "added") toast.success("Added to comparison.");
          else if (r === "full") toast.error("Comparison already holds three locations. Remove one first.");
          else toast("This location is already in the comparison.");
        }}
      >
        Add to comparison
      </Button>
      <Button variant="ghost" asChild>
        <Link to="/compare">Open comparison</Link>
      </Button>
    </div>
  );
}
