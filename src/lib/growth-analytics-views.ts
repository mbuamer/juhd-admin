import type { GrowthDashboardPayload, LabeledCount } from "@/lib/analytics-dashboard-mock";
import type { GrowthDashboardResult } from "@/lib/growth-dashboard";
import type { GrowthNumericSnapshot } from "@/lib/growth-numeric-snapshot";
import type { OpsPulse } from "@/lib/growth-analytics-fetch";
import { missingProfileStats, type MissingProfileStats } from "@/lib/growth-analytics-math";

/** Period filter for the Period Analytics panel: weekly / monthly / yearly. */
export type PeriodFilterDays = 7 | 30 | 365;

export interface DailySnapshot {
  activeUsers: number;
  activeUsersEstimated: boolean;
  signups: number;
  workouts: number;
  posts: number | null;
  newPremium: number;
  unresolvedErrors: number | null;
  pendingBugReports: number | null;
  mostActiveCity: string;
}

export interface AllTimeSnapshot {
  totalUsers: number;
  totalWorkouts: number;
  totalRoutines: number;
  totalPosts: number | null;
  totalPremium: number | null;
  totalFriendships: number | null;
  totalLikes: number | null;
  totalComments: number | null;
  totalGymCheckins: number | null;
  unresolvedErrors: number | null;
  pendingBugReports: number | null;
}

export interface TargetingSummaryCards {
  topCity: string;
  largestGender: string;
  largestAgeGroup: string;
  missingLocationPct: number;
  missingAgePct: number;
  missingGenderPct: number;
  suggestedSegment: string;
  segmentConfidence: "high" | "low";
}

export interface TargetingIntelligence {
  usersByCity: LabeledCount[];
  usersByGender: LabeledCount[];
  usersByAgeGroup: LabeledCount[];
  missing: MissingProfileStats;
  topCities: LabeledCount[];
  summary: TargetingSummaryCards;
}

export interface GrowthAnalyticsViews {
  daily: DailySnapshot;
  allTime: AllTimeSnapshot;
  targeting: TargetingIntelligence;
}

const UNSPECIFIED = [
  "not specified",
  "unknown",
  "unspecified",
];

function isUnspecifiedLabel(label: string): boolean {
  const l = label.toLowerCase();
  return UNSPECIFIED.some((u) => l.includes(u));
}

function topBucket(series: LabeledCount[]): { label: string; value: number } | null {
  const rows = series.filter((r) => r.value > 0 && !isUnspecifiedLabel(r.label));
  if (!rows.length) return null;
  return rows.reduce((best, r) => (r.value > best.value ? r : best));
}

function formatGenderLabel(label: string): string {
  if (label.toLowerCase().includes("not specified")) return label;
  return label;
}

export function buildTargetingSegment(input: {
  topCity: { label: string } | null;
  topGender: { label: string } | null;
  topAge: { label: string } | null;
  missing: MissingProfileStats;
}): { text: string; confidence: "high" | "low" } {
  const { topCity, topGender, topAge, missing } = input;
  const incomplete =
    missing.cityMissingPct > 35 ||
    missing.genderMissingPct > 35 ||
    missing.ageMissingPct > 35 ||
    !topGender ||
    !topAge;

  if (incomplete) {
    return {
      text: "Targeting confidence low — profile data incomplete.",
      confidence: "low",
    };
  }

  const gender = formatGenderLabel(topGender.label);
  const age = topAge.label;
  const cities: string[] = [];
  if (topCity && !isUnspecifiedLabel(topCity.label)) cities.push(topCity.label);

  const cityPart = cities.length ? cities.join(" / ") : "mixed cities";
  return {
    text: `Primary segment: ${gender} users, ${age}, ${cityPart}`,
    confidence: "high",
  };
}

export function buildGrowthAnalyticsViews(input: {
  growthToday: GrowthDashboardResult;
  growthAll: GrowthDashboardResult;
  numeric: GrowthNumericSnapshot;
  ops: OpsPulse;
}): GrowthAnalyticsViews {
  const today = input.growthToday.payload;
  const all = input.growthAll.payload;
  const { numeric, ops } = input;
  const todaySource = input.growthToday.source;

  const dauToday = today.platformActivity.dau;
  const daily: DailySnapshot = {
    activeUsers: dauToday > 0 ? dauToday : today.activeUsers,
    activeUsersEstimated: todaySource !== "live" && dauToday <= 0,
    signups: today.newSignUps,
    workouts: today.workoutsLogged,
    posts: numeric.content?.postsToday ?? null,
    newPremium: today.newPremiumSubscribers,
    unresolvedErrors: ops.unresolvedErrors,
    pendingBugReports: ops.pendingBugReports,
    mostActiveCity: today.platformActivity.mostActiveCity,
  };

  const totalGym =
    numeric.gymCheckinsTableRows != null
      ? numeric.gymCheckinsTableRows
      : numeric.gym != null
        ? numeric.gym.checkinsMonth
        : null;

  const allTime: AllTimeSnapshot = {
    totalUsers: all.totalUsers,
    totalWorkouts: Math.max(all.workoutsLogged, all.platformActivity.totalWorkouts),
    totalRoutines: all.newRoutinesCreated,
    totalPosts: numeric.content?.postsTotal ?? null,
    totalPremium: numeric.premiumSubscribers,
    totalFriendships: numeric.friends?.totalFriendships ?? null,
    totalLikes: numeric.content?.likesTotal ?? null,
    totalComments: numeric.content?.commentsTotal ?? null,
    totalGymCheckins: totalGym,
    unresolvedErrors: ops.unresolvedErrors,
    pendingBugReports: ops.pendingBugReports,
  };

  const missing = missingProfileStats(
    all.totalUsers,
    all.usersByCity,
    all.usersByAgeGroup,
    all.usersByGender
  );

  const topCity = topBucket(all.usersByCity);
  const topGender = topBucket(all.usersByGender);
  const topAge = topBucket(all.usersByAgeGroup);

  const segment = buildTargetingSegment({ topCity, topGender, topAge, missing });

  const topCities = [...all.usersByCity]
    .filter((r) => !isUnspecifiedLabel(r.label))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, 10);

  const targeting: TargetingIntelligence = {
    usersByCity: all.usersByCity,
    usersByGender: all.usersByGender,
    usersByAgeGroup: all.usersByAgeGroup,
    missing,
    topCities,
    summary: {
      topCity: topCity?.label ?? "—",
      largestGender: topGender?.label ?? "—",
      largestAgeGroup: topAge?.label ?? "—",
      missingLocationPct: missing.cityMissingPct,
      missingAgePct: missing.ageMissingPct,
      missingGenderPct: missing.genderMissingPct,
      suggestedSegment: segment.text,
      segmentConfidence: segment.confidence,
    },
  };

  return { daily, allTime, targeting };
}
