import type { SupabaseClient } from "@supabase/supabase-js";
import type { GrowthDashboardResult } from "@/lib/growth-dashboard";
import { fetchGrowthDashboard } from "@/lib/growth-dashboard";
import { fetchGrowthNumericSnapshot, type GrowthNumericSnapshot } from "@/lib/growth-numeric-snapshot";
import {
  fetchAnalyticsHubExtras,
  type AnalyticsHubExtras,
  type HubWindowDays,
} from "@/lib/analytics-hub-rpc";
export type { HubWindowDays };
import {
  buildGrowthAnalyticsViews,
  type GrowthAnalyticsViews,
  type PeriodFilterDays,
} from "@/lib/growth-analytics-views";

export type { PeriodFilterDays, GrowthAnalyticsViews };

export interface RetentionCohortRow {
  cohort_week: string;
  signups: number;
  active_week1: number;
  retention_week1_pct: number;
  active_week4: number;
  retention_week4_pct: number;
}

function toInt(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string") return parseInt(v, 10) || 0;
  if (v && typeof v === "object" && "toString" in v) return parseInt(String(v), 10) || 0;
  return 0;
}

export interface OpsPulse {
  unresolvedErrors: number | null;
  pendingBugReports: number | null;
  pendingPostReports: number;
  pendingMessageReports: number;
}

export interface GrowthAnalyticsPageBundle {
  /** Selected 1 / 7 / 30 day window — Period Analytics panel only. */
  growthPeriod: GrowthDashboardResult;
  /** Always last-1-day — Daily Command Center. */
  growthToday: GrowthDashboardResult;
  /** Always all-time — All-Time Snapshot + Targeting Intelligence demographics. */
  growthAll: GrowthDashboardResult;
  numeric: GrowthNumericSnapshot;
  hub: AnalyticsHubExtras;
  /** All-time metric breakdowns (workouts by city/gender for Targeting). */
  targetingHub: AnalyticsHubExtras;
  ops: OpsPulse;
  views: GrowthAnalyticsViews;
  /** @deprecated retention UI removed from hub */
  retention: RetentionCohortRow[] | null;
  retentionError: string | null;
}

/** @deprecated use growthPeriod */
export type GrowthAnalyticsPageBundleLegacy = GrowthAnalyticsPageBundle & { growth: GrowthDashboardResult };

/** Fetches period-window growth only (for period tab changes). */
export async function fetchGrowthPeriodData(
  supabase: SupabaseClient,
  period: PeriodFilterDays
): Promise<GrowthDashboardResult> {
  return fetchGrowthDashboard(supabase, period);
}

export async function fetchGrowthPeriodLayer(
  supabase: SupabaseClient,
  period: PeriodFilterDays
): Promise<{ growthPeriod: GrowthDashboardResult; hub: AnalyticsHubExtras }> {
  const [growthPeriod, hub] = await Promise.all([
    fetchGrowthDashboard(supabase, period),
    fetchAnalyticsHubExtras(supabase, period),
  ]);
  return { growthPeriod, hub };
}

/** Full page bundle: daily + all-time layers are fixed; period layer follows `period`. */
export async function fetchGrowthAnalyticsPageData(
  supabase: SupabaseClient,
  period: PeriodFilterDays
): Promise<GrowthAnalyticsPageBundle> {
  const [growthPeriod, growthToday, growthAll, numeric, hub, targetingHub, errorsRes, bugsRes, pendingRes] =
    await Promise.all([
      fetchGrowthDashboard(supabase, period),
      fetchGrowthDashboard(supabase, 1),
      fetchGrowthDashboard(supabase, "all"),
      fetchGrowthNumericSnapshot(supabase),
      fetchAnalyticsHubExtras(supabase, period),
      fetchAnalyticsHubExtras(supabase, 0),
      supabase.rpc("get_admin_unresolved_errors_count"),
      supabase.rpc("get_admin_pending_bug_reports_count"),
      supabase.rpc("get_admin_pending_reports_count"),
    ]);

  const pendingRows = pendingRes.data as { post_count?: number; message_count?: number }[] | null;
  const pendingRow = Array.isArray(pendingRows) ? pendingRows[0] : null;

  const ops: OpsPulse = {
    unresolvedErrors: errorsRes.error ? null : toInt(errorsRes.data),
    pendingBugReports: bugsRes.error ? null : toInt(bugsRes.data),
    pendingPostReports: toInt(pendingRow?.post_count),
    pendingMessageReports: toInt(pendingRow?.message_count),
  };

  const views = buildGrowthAnalyticsViews({ growthToday, growthAll, numeric, ops });

  return {
    growthPeriod,
    growthToday,
    growthAll,
    numeric,
    hub,
    targetingHub,
    retention: null,
    retentionError: null,
    ops,
    views,
  };
}
