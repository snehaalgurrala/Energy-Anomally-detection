import type {
  AnomalyListParams,
  AnomalyListResponse,
  AnomalyMonthlyTrendResponse,
  AnomalyRecord,
  AnomalySegmentSummaryResponse,
  DailyFeatureListParams,
  DailyFeatureListResponse,
  DailyFeatureRecord,
  HighAnomalyHouseholdListParams,
  HighAnomalyHouseholdListResponse,
  HouseholdDatasetSummaryResponse,
  HouseholdListParams,
  HouseholdListResponse,
  HouseholdMonthlyTrendResponse,
  HouseholdSummaryRecord,
  SummaryResponse,
} from "./types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

export class ApiError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function apiFetch<T>(path: string): Promise<T> {
  if (!API_BASE_URL) {
    throw new ApiError("NEXT_PUBLIC_API_URL is not configured.");
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { cache: "no-store" });
  } catch {
    throw new ApiError(`Could not reach the API at ${API_BASE_URL}.`);
  }

  if (!res.ok) {
    throw new ApiError(`API request to ${path} failed with status ${res.status}.`, res.status);
  }

  return res.json() as Promise<T>;
}

// Shared by every list endpoint below: turns a flat params object into a
// query string, skipping undefined values so unset filters are omitted
// entirely rather than sent as the literal string "undefined". Takes any of
// the *ListParams types, all of which are flat { [key]: string|number|boolean|undefined }
// shapes without needing a formal index signature.
function buildQuery(params: object): string {
  const query = new URLSearchParams();
  const entries = Object.entries(params) as [string, string | number | boolean | undefined][];
  for (const [key, value] of entries) {
    if (value !== undefined) query.set(key, String(value));
  }
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export function getSummary(): Promise<SummaryResponse> {
  return apiFetch<SummaryResponse>("/api/summary");
}

export function getAnomalies(params: AnomalyListParams = {}): Promise<AnomalyListResponse> {
  return apiFetch<AnomalyListResponse>(`/api/anomalies${buildQuery(params)}`);
}

export function getMeterHistory(meter: string): Promise<AnomalyRecord[]> {
  return apiFetch<AnomalyRecord[]>(`/api/meters/${encodeURIComponent(meter)}/history`);
}

export function getAnomalyDetail(meter: string, day: string): Promise<AnomalyRecord> {
  return apiFetch<AnomalyRecord>(
    `/api/anomalies/${encodeURIComponent(meter)}/${encodeURIComponent(day)}`,
  );
}

export function getAnomaliesMonthlyTrend(): Promise<AnomalyMonthlyTrendResponse> {
  return apiFetch<AnomalyMonthlyTrendResponse>("/api/anomalies/monthly-trend");
}

export function getAnomalySegments(): Promise<AnomalySegmentSummaryResponse> {
  return apiFetch<AnomalySegmentSummaryResponse>("/api/anomalies/segments");
}

export function getHighAnomalyHouseholds(
  params: HighAnomalyHouseholdListParams = {},
): Promise<HighAnomalyHouseholdListResponse> {
  return apiFetch<HighAnomalyHouseholdListResponse>(`/api/anomalies/by-household${buildQuery(params)}`);
}

export function getHouseholdsSummary(): Promise<HouseholdDatasetSummaryResponse> {
  return apiFetch<HouseholdDatasetSummaryResponse>("/api/households/summary");
}

export function getHouseholdsMonthlyTrend(): Promise<HouseholdMonthlyTrendResponse> {
  return apiFetch<HouseholdMonthlyTrendResponse>("/api/households/monthly-trend");
}

export function getHouseholds(params: HouseholdListParams = {}): Promise<HouseholdListResponse> {
  return apiFetch<HouseholdListResponse>(`/api/households${buildQuery(params)}`);
}

export function getHouseholdDetail(meter: string): Promise<HouseholdSummaryRecord> {
  return apiFetch<HouseholdSummaryRecord>(`/api/households/${encodeURIComponent(meter)}`);
}

export function getHouseholdDaily(
  meter: string,
  params: DailyFeatureListParams = {},
): Promise<DailyFeatureListResponse> {
  return apiFetch<DailyFeatureListResponse>(
    `/api/households/${encodeURIComponent(meter)}/daily${buildQuery(params)}`,
  );
}

const MAX_PAGE_SIZE = 500;

// The daily endpoint is paginated (500 rows/page max) and some households
// have more than 500 days of history, so the profile page's full-history
// chart needs every page, not just the first.
export async function getHouseholdDailyAll(meter: string): Promise<DailyFeatureRecord[]> {
  const first = await getHouseholdDaily(meter, { page: 1, page_size: MAX_PAGE_SIZE });
  const totalPages = Math.ceil(first.total / MAX_PAGE_SIZE);
  if (totalPages <= 1) return first.rows;

  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) =>
      getHouseholdDaily(meter, { page: i + 2, page_size: MAX_PAGE_SIZE }),
    ),
  );
  return [...first.rows, ...rest.flatMap((r) => r.rows)];
}
