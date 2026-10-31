import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, describeError } from "@/lib/api/client";
import { StatusNote } from "@/components/states/StatusNote";

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_MB = 8;

export function VisualAudit() {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const m = useMutation({ mutationFn: (f: File) => api.visualAudit(f) });

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  function pick(f: File | undefined) {
    m.reset();
    setInvalid(null);
    if (!f) return;
    if (!TYPES.includes(f.type)) return setInvalid("Use a JPEG, PNG or WebP photograph.");
    if (f.size > MAX_MB * 1024 * 1024) return setInvalid(`The image must be under ${MAX_MB} MB.`);
    setFile(f);
    setUrl(URL.createObjectURL(f));
  }

  const d = m.data;
  return (
    <section className="space-y-4">
      <div>
        <p className="eyebrow">Optional</p>
        <h3 className="font-display text-3xl">Visual site audit</h3>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Upload a photograph of a prospective site to list visible objects such as vehicles or signage. This does not affect the Location Fit Score, does not identify people and is not stored by default. A single image cannot establish footfall or demand.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input id="audit-file" type="file" accept={TYPES.join(",")} className="text-sm file:mr-3 file:rounded-sm file:border file:border-border file:bg-card file:px-3 file:py-1.5 file:text-sm" onChange={(e) => pick(e.target.files?.[0])} aria-label="Site photograph" />
        <Button disabled={!file || m.isPending} onClick={() => file && m.mutate(file)}>
          {m.isPending ? "Analysing image…" : "Run visual audit"}
        </Button>
      </div>
      {invalid && <StatusNote tone="error" title="Image not accepted">{invalid}</StatusNote>}
      {m.isError && <StatusNote tone="offline" title="Visual audit unavailable">{describeError(m.error)}</StatusNote>}
      {url && (
        <div className="relative inline-block max-w-full">
          <img src={url} alt="Uploaded site photograph" className="max-h-[420px] max-w-full rounded-sm" />
          {d?.detections.map((x, i) => {
            const [x1, y1, x2, y2] = x.box;
            return (
              <div key={i} className="absolute border-2 border-terracotta" style={{ left: `${(x1 / d.width) * 100}%`, top: `${(y1 / d.height) * 100}%`, width: `${((x2 - x1) / d.width) * 100}%`, height: `${((y2 - y1) / d.height) * 100}%` }}>
                <span className="absolute -top-5 left-0 whitespace-nowrap bg-terracotta px-1 font-mono text-[10px] text-terracotta-foreground">{x.label} {(x.confidence * 100).toFixed(0)}%</span>
              </div>
            );
          })}
        </div>
      )}
      {d && (
        <div className="text-sm">
          {d.detections.length === 0 ? (
            <p className="text-muted-foreground">No objects were detected above the model's confidence threshold.</p>
          ) : (
            <p className="text-muted-foreground">{d.detections.length} detections. Confidence is the model's own estimate for each box, not a measure of site quality.</p>
          )}
          {d.notes?.map((n) => <p key={n} className="text-xs text-muted-foreground">{n}</p>)}
        </div>
      )}
    </section>
  );
}
