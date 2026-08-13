import type {
  AnomalyListParams,
  AnomalyListResponse,
  AnomalyRecord,
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

export function getSummary(): Promise<SummaryResponse> {
  return apiFetch<SummaryResponse>("/api/summary");
}

export function getAnomalies(params: AnomalyListParams = {}): Promise<AnomalyListResponse> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }
  const qs = query.toString();
  return apiFetch<AnomalyListResponse>(`/api/anomalies${qs ? `?${qs}` : ""}`);
}

export function getMeterHistory(meter: string): Promise<AnomalyRecord[]> {
  return apiFetch<AnomalyRecord[]>(`/api/meters/${encodeURIComponent(meter)}/history`);
}

export function getAnomalyDetail(meter: string, day: string): Promise<AnomalyRecord> {
  return apiFetch<AnomalyRecord>(
    `/api/anomalies/${encodeURIComponent(meter)}/${encodeURIComponent(day)}`,
  );
}
