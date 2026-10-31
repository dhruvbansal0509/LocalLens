import { useEffect, useState } from "react";
import type { AnalysisResult } from "./api/types";

// Holds up to three backend-returned analyses in this browser for comparison.
const KEY = "locallens.compare";
export const MAX_COMPARE = 3;
const listeners = new Set<() => void>();

function read(): AnalysisResult[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}
function write(v: AnalysisResult[]) {
  localStorage.setItem(KEY, JSON.stringify(v));
  listeners.forEach((l) => l());
}

export function addToCompare(a: AnalysisResult): "added" | "full" | "exists" {
  const cur = read();
  if (cur.some((x) => x.created_at === a.created_at && x.location.lat === a.location.lat)) return "exists";
  if (cur.length >= MAX_COMPARE) return "full";
  write([...cur, a]);
  return "added";
}
export function removeFromCompare(i: number) {
  const cur = read();
  cur.splice(i, 1);
  write(cur);
}
export function clearCompare() {
  write([]);
}

export function useCompare() {
  const [items, setItems] = useState<AnalysisResult[]>([]);
  useEffect(() => {
    const l = () => setItems(read());
    l();
    listeners.add(l);
    window.addEventListener("storage", l);
    return () => {
      listeners.delete(l);
      window.removeEventListener("storage", l);
    };
  }, []);
  return items;
}
