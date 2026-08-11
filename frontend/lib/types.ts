// Mirrors the Pydantic response models in Energy-Anomally-detection/src/api.py.
// Keep in sync with that file -- do not add fields the backend doesn't return.

export interface SummaryResponse {
  total_meters: number;
  total_records: number;
  eligible_records: number;
  anomaly_count: number;
  anomaly_rate_pct: number;
  spike_count: number;
  drop_count: number;
}

export interface AnomalyRecord {
  LCLid: string;
  day: string;
  energy_sum: number;
  expected_consumption: number | null;
  deviation: number | null;
  statistical_score: number | null;
  statistical_evidence: number | null;
  if_score: number | null;
  if_evidence: number | null;
  hybrid_score: number | null;
  anomaly_status: string | null;
  anomaly_type: string | null;
  confidence: string | null;
  is_complete_day: boolean;
  eligibility_status: string;
}

export interface AnomalyListResponse {
  total: number;
  page: number;
  page_size: number;
  rows: AnomalyRecord[];
}

export type SortColumn =
  | "hybrid_score"
  | "statistical_score"
  | "if_score"
  | "deviation"
  | "day";

export interface AnomalyListParams {
  meter?: string;
  anomaly_type?: string;
  start_date?: string;
  end_date?: string;
  sort_by?: SortColumn;
  ascending?: boolean;
  page?: number;
  page_size?: number;
}
