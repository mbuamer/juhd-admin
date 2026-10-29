import type { LabeledCount } from "@/lib/analytics-dashboard-mock";
import type { GrowthDashboardPayload } from "@/lib/analytics-dashboard-mock";
import type { AnalyticsHubExtras } from "@/lib/analytics-hub-rpc";
import type { GrowthNumericSnapshot } from "@/lib/growth-numeric-snapshot";
import { contentCountsForPeriod } from "@/lib/growth-numeric-snapshot";
import type { PeriodFilterDays } from "@/lib/growth-analytics-views";

const GOAL_ORDER = ["Lose fat", "Build muscle", "Recomp", "Maintain"];

export function bucketSeriesSum(series: LabeledCount[]): number {
  return series.reduce((a, b) => a + b.value, 0);
}

function topN(series: LabeledCount[], n = 10): LabeledCount[] {
  return [...series]
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, n);
}

function mergeCityEngagement(hub: AnalyticsHubExtras): LabeledCount[] {
  const map = new Map<string, number>();
  const add = (rows: LabeledCount[] | undefined) => {
    for (const r of rows ?? []) {
      map.set(r.label, (map.get(r.label) ?? 0) + r.value);
    }
  };
  add(hub.breakdowns.workouts?.city);
  add(hub.breakdowns.posts?.city);
  add(hub.breakdowns.comments?.city);
  add(hub.breakdowns.likes?.city);
  return topN(
    [...map.entries()].map(([label, value]) => ({ label, value })),
    10
  );
}

function bucketCaption(period: PeriodFilterDays): string {
  if (period === 7) return "Daily counts (last 7 Saudi calendar dates)";
  if (period === 30) return "Daily counts (last 30 Saudi calendar dates)";
  return "Monthly counts (last 365 Saudi calendar dates)";
}

/** RPC often copies signup buckets into routines/premium — don't chart that. */
export function isMirroredSignupBuckets(
  series: LabeledCount[],
  signups: LabeledCount[]
): boolean {
  if (!series.length || series.length !== signups.length) return false;
  return series.every((r, i) => r.value === signups[i]?.value && r.label === signups[i]?.label);
}

export function hasRealBucketVariance(series: LabeledCount[]): boolean {
  const vals = series.map((r) => r.value);
  if (!vals.some((v) => v > 0)) return false;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  if (max === 0) return false;
  return max !== min;
}

export interface ChartsInsights {
  goals: LabeledCount[];
  activeHour: LabeledCount[];
  activeWeekday: LabeledCount[];
  fetchErrors: string[];
}

export interface ChartsHubView {
  period: PeriodFilterDays;
  bucketCaption: string;
  signupsSeries: LabeledCount[];
  workoutsSeries: LabeledCount[];
  routinesSeries: LabeledCount[];
  premiumSeries: LabeledCount[];
  totals: {
    signups: number;
    workouts: number;
    routines: number;
    premium: number;
  };
  topCitiesActive: LabeledCount[];
  topCitiesWorkouts: LabeledCount[];
  topCitiesEngagement: LabeledCount[];
  fastestGrowingCity: { label: string; value: number } | null;
  goals: LabeledCount[];
  activeHour: LabeledCount[];
  activeWeekday: LabeledCount[];
  avgCommentsPerPost: number | null;
  avgLikesPerPost: number | null;
}

export function buildChartsHubView(
  periodPayload: GrowthDashboardPayload,
  hub: AnalyticsHubExtras,
  numeric: GrowthNumericSnapshot,
  period: PeriodFilterDays,
  insights: ChartsInsights
): ChartsHubView {
  const signupsCity = hub.breakdowns.signups?.city ?? [];
  const workoutsCity = hub.breakdowns.workouts?.city ?? [];
  const topSignup = topN(signupsCity, 1)[0] ?? null;

  const content = numeric.content ? contentCountsForPeriod(numeric.content, period) : null;
  const posts = content?.posts ?? 0;
  const comments = content?.comments ?? 0;
  const likes = content?.likes ?? 0;

  const goals = [...insights.goals].sort(
    (a, b) =>
      (GOAL_ORDER.indexOf(a.label) === -1 ? 99 : GOAL_ORDER.indexOf(a.label)) -
        (GOAL_ORDER.indexOf(b.label) === -1 ? 99 : GOAL_ORDER.indexOf(b.label)) ||
      b.value - a.value
  );

  return {
    period,
    bucketCaption: bucketCaption(period),
    signupsSeries: periodPayload.signUpsOverTime,
    /** Workouts are never signup-mirror filtered (only routines/premium were copied from signups in old SQL). */
    workoutsSeries: periodPayload.workoutsOverTime,
    routinesSeries: periodPayload.routinesBuckets,
    premiumSeries: periodPayload.premiumBuckets,
    totals: {
      signups: periodPayload.newSignUps,
      workouts: periodPayload.workoutsLogged,
      routines: periodPayload.newRoutinesCreated,
      premium: periodPayload.newPremiumSubscribers,
    },
    topCitiesActive: topN(signupsCity),
    topCitiesWorkouts: topN(workoutsCity),
    topCitiesEngagement: mergeCityEngagement(hub),
    fastestGrowingCity: topSignup,
    goals,
    activeHour: insights.activeHour,
    activeWeekday: insights.activeWeekday,
    avgCommentsPerPost: posts > 0 ? Math.round((comments / posts) * 10) / 10 : null,
    avgLikesPerPost: posts > 0 ? Math.round((likes / posts) * 10) / 10 : null,
  };
}
