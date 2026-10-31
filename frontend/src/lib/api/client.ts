import type {
  AdminSummary, AnalysisResult, AnalyzeRequest, ApiErrorLog, Category, CompareRequest, CompareResponse,
  DashboardResponse, HealthResponse, ImportLog, InterpretRequest, InterpretResponse, PlacesResponse,
  Report, ReportSummary, SaveReportRequest, StatusResponse, VisualAuditResponse,
} from "./types";

export const API_BASE_URL = (import.meta.env["VITE_API_BASE_URL"] as string | undefined) || "http://127.0.0.1:5000";

export type ApiErrorKind = "unreachable" | "timeout" | "rate_limited" | "not_found" | "validation" | "unavailable" | "server";

export class ApiError extends Error {
  constructor(public kind: ApiErrorKind, message: string, public status?: number) {
    super(message);
  }
}

export function describeError(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.kind) {
      case "unreachable":
        return "The local analysis service could not be reached. Start it on this computer and try again.";
      case "timeout":
        return "The request took too long. The geographic data service may be busy — try again shortly.";
      case "rate_limited":
        return "Too many requests to the geographic data service. Wait a minute before retrying.";
      case "not_found":
        return e.message || "The requested record was not found.";
      case "validation":
        return e.message || "Some of the submitted information was invalid.";
      case "unavailable":
        return e.message || "This service is currently unavailable.";
      default:
        return e.message || "The service returned an unexpected error.";
    }
  }
  return e instanceof Error ? e.message : "Unexpected error.";
}

async function request<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 20000, ...rest } = init;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      signal: ctrl.signal,
      headers: (rest.body instanceof FormData ? rest.headers ?? {} : { "Content-Type": "application/json", ...(rest.headers as Record<string, string>) }) as HeadersInit,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw new ApiError("timeout", "Request timed out");
    throw new ApiError("unreachable", "Service unreachable");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let message = "";
    try {
      const body = await res.json();
      message = body?.error || body?.message || "";
    } catch {
      /* non-JSON error */
    }
    const kind: ApiErrorKind =
      res.status === 404 ? "not_found"
      : res.status === 400 || res.status === 413 || res.status === 415 || res.status === 422 ? "validation"
      : res.status === 429 ? "rate_limited"
      : res.status === 503 ? "unavailable"
      : res.status === 504 ? "timeout"
      : "server";
    throw new ApiError(kind, message, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const json = (body: unknown) => JSON.stringify(body);

export const api = {
  health: () => request<HealthResponse>("/api/health", { timeoutMs: 4000 }),
  categories: () => request<{ categories: Category[] }>("/api/categories"),
  places: (p: { lat: number; lon: number; radius_m: number; category_id?: string }) => {
    const q = new URLSearchParams({ lat: String(p.lat), lon: String(p.lon), radius: String(p.radius_m) });
    if (p.category_id) q.set("category", p.category_id);
    return request<PlacesResponse>(`/api/places?${q}`, { timeoutMs: 45000 });
  },
  analyze: (body: AnalyzeRequest) => request<AnalysisResult>("/api/analyze", { method: "POST", body: json(body), timeoutMs: 60000 }),
  compare: (body: CompareRequest) => request<CompareResponse>("/api/compare", { method: "POST", body: json(body) }),
  reports: () => request<{ reports: ReportSummary[] }>("/api/reports"),
  report: (id: string) => request<Report>(`/api/reports/${encodeURIComponent(id)}`),
  saveReport: (body: SaveReportRequest) => request<{ id: string }>("/api/reports", { method: "POST", body: json(body) }),
  deleteReport: (id: string) => request<void>(`/api/reports/${encodeURIComponent(id)}`, { method: "DELETE" }),
  dashboard: () => request<DashboardResponse>("/api/dashboard"),
  status: () => request<StatusResponse>("/api/status"),
  adminSummary: () => request<AdminSummary>("/api/admin/summary"),
  adminImports: () => request<{ imports: ImportLog[] }>("/api/admin/imports"),
  adminErrors: () => request<{ errors: ApiErrorLog[] }>("/api/admin/errors"),
  interpret: (body: InterpretRequest) =>
    request<InterpretResponse>("/api/interpret-business", { method: "POST", body: json(body), timeoutMs: 90000 }),
  visualAudit: (file: File) => {
    const fd = new FormData();
    fd.append("image", file);
    return request<VisualAuditResponse>("/api/visual-audit", { method: "POST", body: fd, timeoutMs: 90000 });
  },
};
