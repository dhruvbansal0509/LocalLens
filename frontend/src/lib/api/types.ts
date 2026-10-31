// Integration contracts for the local REST API. These describe what the backend
// is expected to return; nothing here is fabricated on the client.

export type LatLon = { lat: number; lon: number };
export type SelectedLocation = LatLon & { label: string };

export type HealthResponse = { status: "ok" | string; version?: string; time?: string };

export type Category = { id: string; label: string; group: string; description?: string };

export type PlaceKind = "competitor" | "amenity" | "transport" | "business";
export type Place = {
  id: string;
  source: string; // e.g. "openstreetmap"
  source_id: string;
  name: string | null;
  kind: PlaceKind;
  category: string;
  lat: number;
  lon: number;
  distance_m?: number;
};

export type DataSource = {
  name: string;
  attribution: string;
  url?: string;
  retrieved_at?: string;
  reference_year?: number;
  granularity?: string;
};

export type PlacesResponse = { places: Place[]; source: DataSource; truncated?: boolean };

export type AnalysisPreferences = {
  competition: "avoid" | "neutral" | "cluster";
  prioritise_transit: boolean;
  amenities: string[];
};

export type AnalyzeRequest = {
  category_id: string;
  custom_description?: string;
  location: SelectedLocation;
  radius_m: number;
  preferences: AnalysisPreferences;
};

export type Indicator = {
  key: string;
  label: string;
  value: number | string | null;
  unit?: string;
  reference_year?: number;
  source?: string;
  note?: string;
};

export type ScoreComponent = {
  key: string;
  label: string;
  available: boolean;
  default_weight: number; // percent
  applied_weight: number | null; // percent after renormalisation
  value: number | null; // 0–100
  explanation: string;
};

export type Score =
  | { status: "scored"; value: number; components: ScoreComponent[]; renormalised: boolean; method: string }
  | { status: "insufficient_data"; reason: string; components?: ScoreComponent[] };

export type Coverage = {
  level: "good" | "partial" | "limited" | "insufficient";
  available: string[];
  missing: string[];
  note?: string;
};

export type AnalysisResult = {
  id?: string;
  created_at: string;
  category: { id: string; label: string };
  custom_description?: string;
  location: SelectedLocation;
  radius_m: number;
  counts: { competitors: number; amenities: number; transport: number; total: number };
  places: Place[];
  accessibility: Indicator[];
  demographics: Indicator[];
  coverage: Coverage;
  score: Score;
  sources: DataSource[];
  warnings: string[];
};

export type ReportSummary = {
  id: string;
  kind: "analysis" | "comparison";
  title: string;
  category_label: string;
  location_label: string;
  created_at: string;
  score: number | null;
  coverage: Coverage["level"];
};

export type Report = ReportSummary & { analyses: AnalysisResult[] };

export type SaveReportRequest = { kind: "analysis" | "comparison"; title: string; analyses: AnalysisResult[] };
export type CompareRequest = { analyses: AnalysisResult[]; title?: string };
export type CompareResponse = { report_id: string; comparability_notes: string[] };

export type DashboardResponse = { recent: ReportSummary[]; totals: { analyses: number; comparisons: number } };

export type ServiceState = "available" | "unavailable" | "not_configured";
export type StatusResponse = {
  geographic_data: { state: ServiceState; detail?: string; last_checked?: string };
  demographic_datasets: { name: string; reference_year: number; granularity: string }[];
  models: { name: string; purpose: string; state: ServiceState | "not_downloaded"; detail?: string }[];
  sources: DataSource[];
};

export type AdminSummary = {
  counts: Record<string, number>;
  recent_analyses: ReportSummary[];
  recent_reports: ReportSummary[];
  geo_health: { state: ServiceState; detail?: string; checked_at?: string };
  models: StatusResponse["models"];
};
export type ImportLog = { id: number; dataset: string; rows: number; status: string; started_at: string; finished_at?: string; message?: string };
export type ApiErrorLog = { id: number; endpoint: string; status: number; message: string; created_at: string };

export type InterpretRequest = { description: string };
export type InterpretResponse = {
  suggestions: { category_id: string; label: string; similarity: number }[];
  explanation: string;
  model: string;
};

export type Detection = { label: string; confidence: number; box: [number, number, number, number] };
export type VisualAuditResponse = { width: number; height: number; detections: Detection[]; model: string; notes?: string[] };
