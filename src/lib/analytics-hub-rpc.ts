import type { SupabaseClient } from "@supabase/supabase-js";
import type { LabeledCount } from "@/lib/analytics-dashboard-mock";
import type { ChartsInsights } from "@/lib/charts-hub-data";
import type { PeriodFilterDays } from "@/lib/growth-analytics-views";
import { rpcFirstRow } from "@/lib/rpc-row";
/** RPC window: 0 = all time, 1/7/30 = UTC day windows (matches `_admin_period_start`). */
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

function parseTopGyms(data: unknown): TopGymRow[] {
  const fr = rpcFirstRow(data);
  const raw = fr?.top_gyms ?? fr?.topGyms;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((g) => {
      if (!g || typeof g !== "object") return null;
      const o = g as Record<string, unknown>;
      const name = String(o.gym_name ?? o.gymName ?? "").trim();
      if (!name) return null;
      return { gymName: name, checkinCount: toInt(o.checkin_count ?? o.checkinCount) };
    })
    .filter((x): x is TopGymRow => x != null);
}

function parseTopUsers(data: unknown): TopUserRow[] {
  let rows: unknown = data;
  if (typeof data === "string") {
    try {
      rows = JSON.parse(data);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(rows)) return [];
  return rows
    .map((u) => {
      if (!u || typeof u !== "object") return null;
      const o = u as Record<string, unknown>;
      return {
        userId: String(o.user_id ?? o.userId ?? ""),
        username: String(o.username ?? o.user_id ?? "—"),
        count: toInt(o.count),
      };
    })
    .filter((x): x is TopUserRow => x != null && x.userId.length > 0);
}

export async function fetchAnalyticsHubExtras(
  supabase: SupabaseClient,
  period: HubWindowDays
): Promise<AnalyticsHubExtras> {
  const fetchErrors: string[] = [];
  const breakdowns: AnalyticsHubExtras["breakdowns"] = {};

  const breakdownPromises = BREAKDOWN_METRICS.flatMap((metric) => [
    supabase
      .rpc("get_admin_metric_breakdown", { p_metric: metric, p_period_days: period, p_dimension: "city" })
      .then((res) => ({ metric, dim: "city" as const, res })),
    supabase
      .rpc("get_admin_metric_breakdown", { p_metric: metric, p_period_days: period, p_dimension: "gender" })
      .then((res) => ({ metric, dim: "gender" as const, res })),
  ]);

  const [premiumRes, deletionsRes, reportsRes, gymRes, topUsersRes, ...breakdownResults] =
    await Promise.all([
      supabase.rpc("get_admin_premium_upgrades_in_period", { p_period_days: period }),
      supabase.rpc("get_admin_account_deletions_stats", { p_period_days: period }),
      supabase.rpc("get_admin_reports_in_period", { p_period_days: period }),
      supabase.rpc("get_admin_gym_checkins_stats", { p_period_days: period }),
      supabase.rpc("get_admin_top_users", { p_period_days: period, p_metric: "workouts", p_limit: 25 }),
      ...breakdownPromises,
    ]);

  let premiumInPeriod: number | null = null;
  if (premiumRes.error) fetchErrors.push(`premium_period: ${premiumRes.error.message}`);
  else if (premiumRes.data != null) premiumInPeriod = toInt(premiumRes.data);

  let deletions: DeletionsStats | null = null;
  if (deletionsRes.error) fetchErrors.push(`deletions: ${deletionsRes.error.message}`);
  else {
    const fr = rpcFirstRow(deletionsRes.data);
    if (fr) {
      deletions = {
        total: toInt(fr.deletions_total ?? fr.deletionsTotal),
        period: toInt(fr.deletions_period ?? fr.deletionsPeriod),
        today: toInt(fr.deletions_today ?? fr.deletionsToday),
      };
    }
  }

  let reportsPeriod: ReportsPeriodStats | null = null;
  if (reportsRes.error) fetchErrors.push(`reports_period: ${reportsRes.error.message}`);
  else {
    const fr = rpcFirstRow(reportsRes.data);
    if (fr) {
      reportsPeriod = {
        newPostReports: toInt(fr.new_post_reports ?? fr.newPostReports),
        newBugReports: toInt(fr.new_bug_reports ?? fr.newBugReports),
        pendingPostReports: toInt(fr.pending_post_reports ?? fr.pendingPostReports),
        pendingBugReports: toInt(fr.pending_bug_reports ?? fr.pendingBugReports),
      };
    }
  }

  let gymPeriodCheckins: number | null = null;
  let topGyms: TopGymRow[] = [];
  if (gymRes.error) fetchErrors.push(`gym_period: ${gymRes.error.message}`);
  else {
    const fr = rpcFirstRow(gymRes.data);
    if (fr) {
      gymPeriodCheckins = toInt(fr.checkins_period ?? fr.checkinsPeriod);
      topGyms = parseTopGyms(gymRes.data);
    }
  }

  let topUsersWorkouts: TopUserRow[] = [];
  if (topUsersRes.error) fetchErrors.push(`top_users: ${topUsersRes.error.message}`);
  else topUsersWorkouts = parseTopUsers(topUsersRes.data);

  for (const { metric, dim, res } of breakdownResults) {
    if (res.error) {
      fetchErrors.push(`breakdown_${metric}_${dim}: ${res.error.message}`);
      continue;
    }
    const series = parseBreakdownJson(res.data);
    if (!breakdowns[metric]) breakdowns[metric] = { city: [], gender: [] };
    breakdowns[metric]![dim] = series;
  }

  return {
    premiumInPeriod,
    deletions,
    reportsPeriod,
    gymPeriodCheckins,
    topGyms,
    topUsersWorkouts,
    breakdowns,
    fetchErrors,
  };
}

export async function fetchChartsInsights(
  supabase: SupabaseClient,
  period: PeriodFilterDays
): Promise<ChartsInsights> {
  const fetchErrors: string[] = [];
  let goals: LabeledCount[] = [];
  let activeHour: LabeledCount[] = [];
  let activeWeekday: LabeledCount[] = [];

  const [goalsRes, activityRes] = await Promise.all([
    supabase.rpc("get_admin_goal_distribution"),
    supabase.rpc("get_admin_activity_patterns", { p_period_days: period }),
  ]);

  if (goalsRes.error) fetchErrors.push(`goals: ${goalsRes.error.message}`);
  else goals = parseBreakdownJson(goalsRes.data);

  if (activityRes.error) fetchErrors.push(`activity_patterns: ${activityRes.error.message}`);
  else {
    let raw: unknown = activityRes.data;
    if (typeof raw === "string") {
      try {
        raw = JSON.parse(raw);
      } catch {
        raw = null;
      }
    }
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const o = raw as Record<string, unknown>;
      activeHour = parseBreakdownJson(o.byHour ?? o.by_hour);
      activeWeekday = parseBreakdownJson(o.byWeekday ?? o.by_weekday);
    }
  }

  return { goals, activeHour, activeWeekday, fetchErrors };
}
