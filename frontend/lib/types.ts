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

export interface AnomalyMonthlyTrendRecord {
  month: string;
  eligible_count: number;
  anomaly_count: number;
  spike_count: number;
  drop_count: number;
}

export interface AnomalyMonthlyTrendResponse {
  rows: AnomalyMonthlyTrendRecord[];
}

export interface AnomalySegmentRecord {
  segment: string;
  household_count: number;
  eligible_count: number;
  anomaly_count: number;
  spike_count: number;
  drop_count: number;
  anomaly_rate_pct: number;
}

export interface AnomalySegmentSummaryResponse {
  by_acorn_group: AnomalySegmentRecord[];
  by_tariff: AnomalySegmentRecord[];
}

export type HighAnomalySortColumn =
  | "anomaly_count"
  | "spike_count"
  | "drop_count"
  | "anomaly_rate_pct"
  | "avg_hybrid_score"
  | "max_hybrid_score"
  | "latest_anomaly_date";

export interface HighAnomalyHouseholdRecord {
  LCLid: string;
  anomaly_count: number;
  spike_count: number;
  drop_count: number;
  eligible_count: number;
  anomaly_rate_pct: number;
  latest_anomaly_date: string;
  avg_hybrid_score: number | null;
  max_hybrid_score: number | null;
}

export interface HighAnomalyHouseholdListResponse {
  total: number;
  page: number;
  page_size: number;
  rows: HighAnomalyHouseholdRecord[];
}

export interface HighAnomalyHouseholdListParams {
  sort_by?: HighAnomalySortColumn;
  ascending?: boolean;
  page?: number;
  page_size?: number;
}

export interface HouseholdDatasetSummaryResponse {
  total_meters: number;
  total_half_hourly_readings: number;
  date_range_start: string;
  date_range_end: string;
  total_daily_records: number;
  average_daily_consumption: number | null;
  average_household_daily_consumption: number | null;
  missing_energy_readings: number;
  incomplete_days: number;
}

export interface HouseholdSummaryRecord {
  LCLid: string;
  stdorToU: string | null;
  Acorn: string | null;
  Acorn_grouped: string | null;
  average_daily_consumption: number | null;
  median_daily_consumption: number | null;
  max_daily_consumption: number | null;
  minimum_daily_consumption: number | null;
  consumption_std: number | null;
  consumption_variability: number | null;
  average_weekday_consumption: number | null;
  average_weekend_consumption: number | null;
  weekend_vs_weekday_ratio: number | null;
}

export interface HouseholdListResponse {
  total: number;
  page: number;
  page_size: number;
  rows: HouseholdSummaryRecord[];
}

export type HouseholdSortColumn =
  | "LCLid"
  | "average_daily_consumption"
  | "median_daily_consumption"
  | "max_daily_consumption"
  | "minimum_daily_consumption"
  | "consumption_std"
  | "consumption_variability"
  | "average_weekday_consumption"
  | "average_weekend_consumption"
  | "weekend_vs_weekday_ratio";

export interface HouseholdListParams {
  stdorToU?: string;
  Acorn_grouped?: string;
  sort_by?: HouseholdSortColumn;
  ascending?: boolean;
  page?: number;
  page_size?: number;
}

export interface HouseholdMonthlyTrendRecord {
  month: string;
  average_daily_consumption: number | null;
  household_day_count: number;
}

export interface HouseholdMonthlyTrendResponse {
  rows: HouseholdMonthlyTrendRecord[];
}

export interface DailyFeatureRecord {
  LCLid: string;
  date: string;
  day_of_week: number;
  day_name: string;
  week: number;
  month: number;
  month_name: string;
  season: string;
  is_weekend: boolean;
  stdorToU: string | null;
  Acorn: string | null;
  Acorn_grouped: string | null;
  daily_total: number | null;
  daily_mean: number | null;
  daily_min: number | null;
  daily_max: number | null;
  daily_std: number | null;
  daily_median: number | null;
  reading_count: number;
  missing_reading_count: number;
  zero_reading_count: number;
  expected_reading_count: number;
  completeness_rate: number;
  zero_reading_rate: number | null;
  minimum_consumption: number | null;
  peak_hour: number | null;
  peak_consumption: number | null;
  morning_consumption: number | null;
  afternoon_consumption: number | null;
  evening_consumption: number | null;
  overnight_consumption: number | null;
}

export interface DailyFeatureListResponse {
  total: number;
  page: number;
  page_size: number;
  rows: DailyFeatureRecord[];
}

export interface DailyFeatureListParams {
  start_date?: string;
  end_date?: string;
  page?: number;
  page_size?: number;
}
