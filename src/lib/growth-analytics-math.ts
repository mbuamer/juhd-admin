import type { LabeledCount } from "@/lib/analytics-dashboard-mock";

export function safeDivide(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return 0;
  return numerator / denominator;
}

/** Mean per calendar day in a 7 / 30 / 365-day analytics window. */
export function averagePerDayInPeriod(total: number, periodDays: 7 | 30 | 365): number {
  return safeDivide(total, periodDays);
}

export function formatAveragePerDay(total: number, periodDays: 7 | 30 | 365, digits = 1): string {
  const avg = averagePerDayInPeriod(total, periodDays);
  if (!Number.isFinite(avg)) return "—";
  return avg.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function periodFilterTabLabel(period: 7 | 30 | 365): string {
  if (period === 7) return "Weekly";
  if (period === 30) return "Monthly";
  return "Yearly";
}

export function periodAverageDayLabel(period: 7 | 30 | 365): string {
  if (period === 7) return "weekly window";
  if (period === 30) return "monthly window";
  return "yearly window";
}

/** Returns null when prior period is unknown (no comparison RPC). */
export function percentChange(current: number, previous: number | null | undefined): number | null {
  if (previous == null || !Number.isFinite(previous) || previous <= 0) return null;
  if (!Number.isFinite(current)) return null;
  return ((current - previous) / previous) * 100;
}

export function formatSignedPercent(p: number | null, digits = 1): string {
  if (p == null || !Number.isFinite(p)) return "—";
  const sign = p > 0 ? "+" : "";
  return `${sign}${p.toFixed(digits)}%`;
}

/** DAU / MAU as 0–100+ percentage (sticky factor). */
export function stickyFactorPercent(dau: number, mau: number): number {
  return safeDivide(dau, mau) * 100;
}

export type StickyBand = "weak" | "okay" | "strong" | "excellent";

export function interpretStickyFactor(percent: number): StickyBand {
  if (!Number.isFinite(percent) || percent <= 0) return "weak";
  if (percent < 10) return "weak";
  if (percent < 20) return "okay";
  if (percent < 40) return "strong";
  return "excellent";
}

export function stickyInterpretationLabel(band: StickyBand): string {
  switch (band) {
    case "weak":
      return "Under 10% — weak habit (or MAU inflated vs DAU).";
    case "okay":
      return "10–20% — okay for many consumer apps.";
    case "strong":
      return "20–40% — strong recurring usage.";
    case "excellent":
      return "40%+ — excellent stickiness.";
    default:
      return "";
  }
}

export function labeledSumWhere(series: LabeledCount[], predicate: (label: string) => boolean): number {
  return series.filter((r) => predicate(r.label)).reduce((a, r) => a + r.value, 0);
}

export function labeledValue(series: LabeledCount[], label: string): number {
  return series.find((x) => x.label === label)?.value ?? 0;
}

export interface MissingProfileStats {
  cityUnspecified: number;
  ageUnspecified: number;
  genderUnspecified: number;
  totalUsers: number;
  cityMissingPct: number;
  ageMissingPct: number;
  genderMissingPct: number;
}

export function missingProfileStats(
  totalUsers: number,
  usersByCity: LabeledCount[],
  usersByAgeGroup: LabeledCount[],
  usersByGender: LabeledCount[]
): MissingProfileStats {
  const cityUnspecified = labeledSumWhere(usersByCity, label => ["not specified", "city not specified"].includes(label.trim().toLowerCase()));
  const ageUnspecified = labeledSumWhere(usersByAgeGroup, label => ["not specified", "age / birthdate not specified"].includes(label.trim().toLowerCase()));
  const genderUnspecified = labeledSumWhere(usersByGender, label => ["not specified", "gender not specified"].includes(label.trim().toLowerCase()));
  const tu = Math.max(0, totalUsers);
  return {
    cityUnspecified,
    ageUnspecified,
    genderUnspecified,
    totalUsers: tu,
    cityMissingPct: tu > 0 ? (cityUnspecified / tu) * 100 : 0,
    ageMissingPct: tu > 0 ? (ageUnspecified / tu) * 100 : 0,
    genderMissingPct: tu > 0 ? (genderUnspecified / tu) * 100 : 0,
  };
}

export function missingDataWarningMessage(m: MissingProfileStats): string | null {
  const parts: string[] = [];
  if (m.cityMissingPct >= 15) parts.push(`${m.cityMissingPct.toFixed(0)}% missing city`);
  if (m.ageMissingPct >= 15) parts.push(`${m.ageMissingPct.toFixed(0)}% missing age/birthdate`);
  if (m.genderMissingPct >= 15) parts.push(`${m.genderMissingPct.toFixed(0)}% missing gender`);
  if (parts.length === 0) return null;
  return `Profile completeness: ${parts.join(" · ")} — consider prompting users to complete profiles.`;
}

/**
 * Experimental 0–100 score from public aggregates (not a financial or medical metric).
 * Uses log scaling so large networks do not dominate.
 */
export function communityHealthScorePlaceholder(input: {
  postsTotal: number;
  commentsTotal: number;
  likesTotal: number;
  friendshipsTotal: number;
  gymCheckinsMonth: number;
}): number | null {
  const { postsTotal, commentsTotal, likesTotal, friendshipsTotal, gymCheckinsMonth } = input;
  if (
    [postsTotal, commentsTotal, likesTotal, friendshipsTotal, gymCheckinsMonth].every(
      (n) => !Number.isFinite(n) || n <= 0
    )
  ) {
    return null;
  }
  const engagement =
    Math.log1p(Math.max(0, postsTotal)) * 3 +
    Math.log1p(Math.max(0, commentsTotal)) * 2 +
    Math.log1p(Math.max(0, likesTotal)) * 0.5;
  const social = Math.log1p(Math.max(0, friendshipsTotal)) * 2;
  const gym = Math.log1p(Math.max(0, gymCheckinsMonth)) * 1.5;
  const raw = engagement + social + gym;
  const score = Math.round(Math.min(100, (raw / 25) * 100));
  return Number.isFinite(score) ? score : null;
}

export function periodLabel(period: import("@/lib/analytics-dashboard-mock").TimePeriod): string {
  if (period === 1) return "Today (Saudi time)";
  if (period === 7) return "Last 7 days (weekly)";
  if (period === 30) return "Last 30 days (monthly)";
  if (period === 365) return "Last 365 days (yearly)";
  return "All time";
}

/** Chart x-axis bucket description for period analytics panels. */
export function periodChartBucketHint(period: import("@/lib/analytics-dashboard-mock").TimePeriod): string {
  if (period === 1) return "Today’s calendar-date bucket (Saudi time)";
  if (period === 7) return "Signups & workouts per day (7 days)";
  if (period === 30) return "Signups & workouts per day (30 days)";
  if (period === 365) return "Monthly buckets over the last 365 calendar dates";
  return "Period buckets";
}

export function hubWindowLabel(period: 0 | 1 | 7 | 30 | 365): string {
  if (period === 0) return "All time";
  if (period === 1) return "Today (Saudi time)";
  if (period === 7) return "Weekly (7 days)";
  if (period === 30) return "Monthly (30 days)";
  return "Yearly (365 days)";
}
