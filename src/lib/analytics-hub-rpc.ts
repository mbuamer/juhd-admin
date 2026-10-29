import type { SupabaseClient } from "@supabase/supabase-js";
import type { LabeledCount } from "@/lib/analytics-dashboard-mock";
import type { ChartsInsights } from "@/lib/charts-hub-data";
import type { PeriodFilterDays } from "@/lib/growth-analytics-views";
import { fetchMeasuredDetails } from "@/lib/measured-details";
/** RPC window: 0 = all time; other periods are Saudi calendar dates including today. */
export type HubWindowDays = 0 | 1 | 7 | 30 | 365;

function toInt(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string") return parseInt(v, 10) || 0;
  if (v && typeof v === "object" && "toString" in v) return parseInt(String(v), 10) || 0;
  return 0;
}

export function parseBreakdownJson(data: unknown): LabeledCount[] {
  if (!data) return [];
  let rows: unknown = data;
  if (typeof data === "string") {
    try {
      rows = JSON.parse(data);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(rows)) return [];
  const out: LabeledCount[] = [];
  for (const item of rows) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const label = String(o.label ?? o.name ?? "").trim();
    if (!label) continue;
    out.push({ label, value: toInt(o.value ?? o.count ?? o.cnt) });
  }
  return out.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

export interface TopGymRow {
  gymName: string;
  checkinCount: number;
}

export interface TopUserRow {
  userId: string;
  username: string;
  count: number;
}

export interface DeletionsStats {
  total: number;
  period: number;
  today: number;
}

export interface ReportsPeriodStats {
  newPostReports: number;
  newBugReports: number;
  pendingPostReports: number;
  pendingBugReports: number;
}

export interface AnalyticsHubExtras {
  premiumInPeriod: number | null;
  deletions: DeletionsStats | null;
  reportsPeriod: ReportsPeriodStats | null;
  gymPeriodCheckins: number | null;
  topGyms: TopGymRow[];
  topUsersWorkouts: TopUserRow[];
  breakdowns: Partial<Record<BreakdownMetric, { city: LabeledCount[]; gender: LabeledCount[] }>>;
  fetchErrors: string[];
}

export type BreakdownMetric =
  | "signups"
  | "workouts"
  | "posts"
  | "comments"
  | "likes"
  | "checkins"
  | "premium_new"
  | "deletions";

const BREAKDOWN_METRICS: BreakdownMetric[] = [
  "signups",
  "workouts",
  "posts",
  "comments",
  "likes",
  "checkins",
  "premium_new",
  "deletions",
];

export async function fetchAnalyticsHubExtras(supabase: SupabaseClient, period: HubWindowDays): Promise<AnalyticsHubExtras> {
  const data = await fetchMeasuredDetails(supabase, period);
  const fetchErrors: string[] = [];
  const breakdowns: AnalyticsHubExtras["breakdowns"] = {};
  for (const metric of BREAKDOWN_METRICS) {
    if (data?.breakdowns[metric]) breakdowns[metric] = data.breakdowns[metric];
    else for (const dim of ["city","gender"]) fetchErrors.push(`breakdown_${metric}_${dim}: Unavailable`);
  }
  if (!data) fetchErrors.push("measured_details: Unavailable");
  return { premiumInPeriod:null, deletions:null,
    reportsPeriod: data ? {newPostReports:data.counts.postReports.selected,newBugReports:data.counts.bugReports.selected,pendingPostReports:data.pendingPostReports,pendingBugReports:data.pendingBugReports} : null,
    gymPeriodCheckins:data?.counts.checkins.selected ?? null,
    topGyms:data?.topGyms ?? [],topUsersWorkouts:data?.topUsersWorkouts ?? [],breakdowns,fetchErrors };
}
export async function fetchChartsInsights(supabase:SupabaseClient,period:PeriodFilterDays):Promise<ChartsInsights> {
 const data=await fetchMeasuredDetails(supabase,period);
 return {goals:[],activeHour:data?.activeHour ?? [],activeWeekday:data?.activeWeekday ?? [],fetchErrors:data ? ["goals: Unavailable; goal-definition audit pending"] : ["measured_details: Unavailable"]};
}
