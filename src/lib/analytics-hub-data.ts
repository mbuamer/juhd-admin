import type { LabeledCount } from "@/lib/analytics-dashboard-mock";
import type { GrowthAnalyticsPageBundle } from "@/lib/growth-analytics-fetch";
import type { AnalyticsHubExtras, BreakdownMetric } from "@/lib/analytics-hub-rpc";
import type { PeriodFilterDays } from "@/lib/growth-analytics-views";
import { contentCountsForPeriod } from "@/lib/growth-numeric-snapshot";
import {
  formatAveragePerDay,
  labeledValue,
  periodAverageDayLabel,
  safeDivide,
} from "@/lib/growth-analytics-math";

export type HubTabId = "push" | "retention" | "overview" | "period" | "charts" | "tables" | "alltime" | "ratios" | "targeting";

export interface HubMetric {
  id: string;
  label: string;
  value: number | string | null;
  sub?: string;
  unavailable?: boolean;
}

export interface HubRatio {
  id: string;
  label: string;
  value: string;
  formula: string;
  unavailable?: boolean;
}

export interface HubTableDef {
  id: string;
  title: string;
  rows: LabeledCount[];
  emptyMessage: string;
}

export interface TablesHubView {
  tables: HubTableDef[];
  topUsers: { username: string; count: number }[];
  topGyms: { gymName: string; checkinCount: number }[];
}

export interface AnalyticsHubData {
  overview: HubMetric[];
  period: HubMetric[];
  periodSource: string;
  tables: HubTableDef[];
  topUsers: { username: string; count: number }[];
  topGyms: { gymName: string; checkinCount: number }[];
  allTime: HubMetric[];
  allTimeHero: { totalUsers: number | null };
  demographics: {
    usersByCity: LabeledCount[];
    usersByGender: LabeledCount[];
  };
  ratios: HubRatio[];
  targeting: {
    summary: GrowthAnalyticsPageBundle["views"]["targeting"]["summary"];
    usersByCity: LabeledCount[];
    usersByGender: LabeledCount[];
    usersByAgeGroup: LabeledCount[];
    workoutsByCity: LabeledCount[];
    workoutsByGender: LabeledCount[];
    insight: string;
    confidence: "high" | "low";
  };
}

const NA = "Unavailable";

const TABLE_DEFS: { id: string; title: string; metric: BreakdownMetric; dim: "city" | "gender" }[] = [
  { id: "workouts-city", title: "Workouts per city", metric: "workouts", dim: "city" },
  { id: "workouts-gender", title: "Workouts per gender", metric: "workouts", dim: "gender" },
  { id: "signups-city", title: "New signups per city", metric: "signups", dim: "city" },
  { id: "signups-gender", title: "New signups per gender", metric: "signups", dim: "gender" },
  { id: "posts-city", title: "Posts per city", metric: "posts", dim: "city" },
  { id: "posts-gender", title: "Posts per gender", metric: "posts", dim: "gender" },
  { id: "premium-city", title: "Premium upgrades per city", metric: "premium_new", dim: "city" },
  { id: "premium-gender", title: "Premium upgrades per gender", metric: "premium_new", dim: "gender" },
  { id: "deletions-city", title: "Deletions per city", metric: "deletions", dim: "city" },
  { id: "deletions-gender", title: "Deletions per gender", metric: "deletions", dim: "gender" },
];

function breakdownRpcFailed(errors: string[], metric: BreakdownMetric, dim: "city" | "gender"): boolean {
  return errors.some((e) => e.startsWith(`breakdown_${metric}_${dim}:`));
}

export function buildTablesHubView(hub: AnalyticsHubExtras): TablesHubView {
  const b = hub.breakdowns;
  const tables: HubTableDef[] = TABLE_DEFS.map(({ id, title, metric, dim }) => {
    const rows = b[metric]?.[dim] ?? [];
    const failed = breakdownRpcFailed(hub.fetchErrors, metric, dim);
    return {
      id,
      title,
      rows,
      emptyMessage: rows.length ? "" : failed ? NA : "No records in this window",
    };
  });
  return {
    tables,
    topUsers: hub.topUsersWorkouts.map((u) => ({ username: u.username, count: u.count })),
    topGyms: hub.topGyms,
  };
}

function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return NA;
  return n.toLocaleString();
}

function pct(n: number, d: number): string {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return NA;
  return `${((n / d) * 100).toFixed(1)}%`;
}

function ratioFixed(n:number,d:number):string { return d>0 ? (n/d).toFixed(2) : NA; }

function ratioPct(n: number, d: number): string {
  const v = safeDivide(n, d) * 100;
  if (d <= 0) return NA;
  return `${v.toFixed(1)}%`;
}

export function buildAnalyticsHubData(
  bundle: GrowthAnalyticsPageBundle,
  hub: AnalyticsHubExtras,
  period: PeriodFilterDays,
  targetingHub: AnalyticsHubExtras = bundle.targetingHub
): AnalyticsHubData {
  const today = bundle.growthToday.payload;
  const periodP = bundle.growthPeriod.payload;
  const all = bundle.growthAll.payload;
  const numeric = bundle.numeric;
  const content = numeric.content;
  const gym = numeric.gym;
  const { daily, allTime, targeting } = bundle.views;
  const ops = bundle.ops;
  const periodContent = content ? contentCountsForPeriod(content, period) : null;

  const premiumPeriod =
    hub.premiumInPeriod != null ? hub.premiumInPeriod : periodP.newPremiumSubscribers;

  const gymPeriod =
    hub.gymPeriodCheckins != null
      ? hub.gymPeriodCheckins
      : period === 7
        ? gym?.checkinsWeek
        : gym?.checkinsMonth;

  const deletionsToday = hub.deletions?.today ?? null;
  const deletionsPeriod = hub.deletions?.period ?? null;

  const overview: HubMetric[] = [
    { id: "signups", label: "Signups today", value: daily.signups },
    { id: "workouts", label: "Workouts today", value: daily.workouts, sub: "Finished sessions" },
    { id: "routines", label: "New routines today", value: today.newRoutinesCreated },
    {
      id: "posts",
      label: "New posts today",
      value: content ? content.postsToday : null,
      unavailable: !content,
    },
    {
      id: "comments",
      label: "New comments today",
      value: content ? content.commentsToday : null,
      unavailable: !content,
    },
    {
      id: "likes",
      label: "New likes today",
      value: content ? content.likesToday : null,
      unavailable: !content,
    },
    {
      id: "checkins",
      label: "Gym check-ins today",
      value: gym?.checkinsToday ?? null,
      unavailable: !gym,
    },
    {
      id: "deletions",
      label: "Account deletions today",
      value: deletionsToday,
      sub: deletionsToday == null ? "Log starts after deletion audit deploy" : undefined,
      unavailable: deletionsToday == null,
    },
    {
      id: "active",
      label: "Active users today",
      value: daily.activeUsers,
      sub: daily.activeUsersEstimated ? "Estimated" : "DAU · Saudi today",
    },
    { id: "premium", label: "New premium today", value: daily.newPremium },
    {
      id: "errors",
      label: "Unresolved errors",
      value: ops.unresolvedErrors,
      unavailable: ops.unresolvedErrors == null,
    },
    {
      id: "bugs",
      label: "Pending bug reports",
      value: ops.pendingBugReports,
      unavailable: ops.pendingBugReports == null,
    },
    { id: "city", label: "Top profile city", value: daily.mostActiveCity, sub: "By user count" },
  ];

  const periodMetrics: HubMetric[] = [
    { id: "signups", label: "User signups", value: periodP.newSignUps },
    {
      id: "avg-signups",
      label: "Avg signups / day",
      value: formatAveragePerDay(periodP.newSignUps, period),
      sub: periodAverageDayLabel(period),
    },
    { id: "workouts", label: "Workouts", value: periodP.workoutsLogged },
    {
      id: "avg-workouts",
      label: "Avg workouts / day",
      value: formatAveragePerDay(periodP.workoutsLogged, period),
      sub: periodAverageDayLabel(period),
    },
    { id: "routines", label: "New routines", value: periodP.newRoutinesCreated },
    {
      id: "posts",
      label: "New posts",
      value: periodContent?.posts ?? null,
      sub:
        period === 7 ? "Last 7 Saudi calendar dates" : period === 30 ? "Last 30 Saudi calendar dates" : period === 365 ? "Last 365 Saudi calendar dates" : "Today · Saudi time",
      unavailable: !periodContent,
    },
    {
      id: "comments",
      label: "New comments",
      value: periodContent?.comments ?? null,
      unavailable: !periodContent,
    },
    {
      id: "likes",
      label: "New likes",
      value: periodContent?.likes ?? null,
      unavailable: !periodContent,
    },
    {
      id: "checkins",
      label: "Gym check-ins",
      value: gymPeriod ?? null,
      unavailable: gymPeriod == null,
    },
    {
      id: "deletions",
      label: "Account deletions",
      value: deletionsPeriod,
      unavailable: deletionsPeriod == null,
    },
    {
      id: "active",
      label: "Active users",
      value: periodP.activeUsers,
      sub: bundle.growthPeriod.source !== "live" ? "May be estimated" : undefined,
    },
    { id: "premium", label: "New premium", value: premiumPeriod },
    {
      id: "bugs",
      label: "New bug reports",
      value: hub.reportsPeriod?.newBugReports ?? null,
      unavailable: !hub.reportsPeriod,
    },
    {
      id: "reports",
      label: "New post reports",
      value: hub.reportsPeriod?.newPostReports ?? null,
      unavailable: !hub.reportsPeriod,
    },
  ];

  const tablesView = buildTablesHubView(hub);

  const missing = targeting.missing;
  const totalUsers = all.totalUsers;
  const male = labeledValue(all.usersByGender, "Male") + labeledValue(all.usersByGender, "male");
  const female =
    labeledValue(all.usersByGender, "Female") + labeledValue(all.usersByGender, "female");
  const genderDenom = male + female || totalUsers;

  const ratios: HubRatio[] = [
    {
      id: "sticky",
      label: "DAU / MAU sticky factor",
      value: ratioPct(periodP.platformActivity.dau, periodP.platformActivity.mau),
      formula: "DAU ÷ MAU × 100",
    },
    {
      id: "wau-mau",
      label: "WAU / MAU",
      value: ratioPct(periodP.platformActivity.wau, periodP.platformActivity.mau),
      formula: "WAU ÷ MAU × 100",
    },
    {
      id: "workouts-user",
      label: "Workouts per user",
      value: allTime.totalUsers > 0 ? (allTime.totalWorkouts / allTime.totalUsers).toFixed(2) : NA,
      formula: "Total workouts ÷ total users",
    },
    {
      id: "posts-user",
      label: "Posts per user",
      value:
        allTime.totalPosts != null && allTime.totalUsers > 0
          ? (allTime.totalPosts / allTime.totalUsers).toFixed(2)
          : NA,
      formula: "Total posts ÷ total users",
    },
    {
      id: "comments-post",
      label: "Comments per post",
      value:
        allTime.totalPosts != null && allTime.totalPosts > 0 && allTime.totalComments != null
          ? (allTime.totalComments / allTime.totalPosts).toFixed(2)
          : NA,
      formula: "Total comments ÷ total posts",
    },
    {
      id: "likes-post",
      label: "Likes per post",
      value:
        allTime.totalPosts != null && allTime.totalPosts > 0 && allTime.totalLikes != null
          ? (allTime.totalLikes / allTime.totalPosts).toFixed(2)
          : NA,
      formula: "Total likes ÷ total posts",
    },
    {
      id: "checkins-user",
      label: "Gym check-ins per user",
      value:
        allTime.totalGymCheckins != null && allTime.totalUsers > 0
          ? (allTime.totalGymCheckins / allTime.totalUsers).toFixed(2)
          : NA,
      formula: "Total check-ins ÷ total users",
    },
    {
      id: "routines-rate",
      label: "Routines per new signup (not conversion)",
      value: ratioPct(periodP.newRoutinesCreated, periodP.newSignUps),
      formula: "New routines ÷ signups (period)",
    },
    {
      id: "premium-conv",
      label: "Premium conversion (period)",
      value: ratioPct(premiumPeriod, periodP.newSignUps),
      formula: "New premium ÷ signups (period)",
    },
    {
      id: "signup-workout",
      label: "Workouts per new signup (not conversion)",
      value: ratioPct(periodP.workoutsLogged, periodP.newSignUps),
      formula: "Workouts ÷ signups (period)",
    },
    {
      id: "signup-post",
      label: "Posts per new signup (not conversion)",
      value:
        periodContent && periodP.newSignUps > 0
          ? ratioPct(periodContent.posts, periodP.newSignUps)
          : NA,
      formula: "New posts ÷ signups (period)",
      unavailable: !periodContent,
    },
    {
      id: "deletion-rate",
      label: "Account deletion rate",
      value:
        deletionsPeriod != null && totalUsers > 0 ? ratioPct(deletionsPeriod, totalUsers) : NA,
      formula: "Deletions in period ÷ total users",
      unavailable: deletionsPeriod == null,
    },
    {
      id: "male-pct",
      label: "Male %",
      value: pct(male, genderDenom),
      formula: "Male users ÷ (male + female)",
    },
    {
      id: "female-pct",
      label: "Female %",
      value: pct(female, genderDenom),
      formula: "Female users ÷ (male + female)",
    },
    {
      id: "profile-complete",
      label: "Profile completion",
      value: `${(100 - (missing.cityMissingPct + missing.genderMissingPct + missing.ageMissingPct) / 3).toFixed(0)}%`,
      formula: "Approx. avg of filled city, gender, age",
    },
    {
      id: "active-rate",
      label: "Active user rate",
      value: ratioPct(periodP.activeUsers, totalUsers),
      formula: "Active users (period) ÷ total users",
    },
    {
      id: "engagement",
      label: "Content actions per observed active user",
      value: ratioFixed(
        (periodContent?.posts ?? 0) + (periodContent?.comments ?? 0) + (periodContent?.likes ?? 0),
        periodP.activeUsers
      ),
      formula: "(Posts + comments + likes) ÷ active users",
      unavailable: !periodContent,
    },
  ];

  const allTimeMetrics: HubMetric[] = [
    { id: "signups", label: "Total signups", value: all.totalUsers },
    { id: "workouts", label: "Total workouts", value: allTime.totalWorkouts },
    { id: "routines", label: "Total routines", value: allTime.totalRoutines },
    { id: "posts", label: "Total posts", value: allTime.totalPosts, unavailable: allTime.totalPosts == null },
    { id: "comments", label: "Total comments", value: allTime.totalComments, unavailable: allTime.totalComments == null },
    { id: "likes", label: "Total likes", value: allTime.totalLikes, unavailable: allTime.totalLikes == null },
    { id: "checkins", label: "Total gym check-ins", value: allTime.totalGymCheckins, unavailable: allTime.totalGymCheckins == null },
    { id: "deletions", label: "Total account deletions", value: hub.deletions?.total ?? null, unavailable: hub.deletions == null },
    { id: "premium", label: "Total premium subscribers", value: allTime.totalPremium, unavailable: allTime.totalPremium == null },
    { id: "friends", label: "Total friendships", value: allTime.totalFriendships, unavailable: allTime.totalFriendships == null },
    { id: "bugs", label: "Pending bug reports", value: ops.pendingBugReports, unavailable: ops.pendingBugReports == null },
    { id: "reports", label: "Pending post reports", value: ops.pendingPostReports, unavailable: ops.pendingPostReports == null },
  ];

  // Primary measurements only come from the versioned endpoint. Missing data stays missing.
  function guardMetrics(rows: HubMetric[], result: GrowthAnalyticsPageBundle["growthToday"]) {
    const keys: Record<string,string> = {signups:"newSignUps",workouts:"workoutsLogged",routines:"newRoutinesCreated",active:"activeUsers",premium:"newPremiumSubscribers","avg-signups":"newSignUps","avg-workouts":"workoutsLogged"};
    for (const row of rows) {
      const key = keys[row.id];
      if (key && (result.source === "empty" || result.payload.unavailable?.includes(key))) {
        row.value = null; row.unavailable = true;
      }
      if (row.id === "active") row.sub = "Observed foreground users · Asia/Riyadh";
    }
  }
  guardMetrics(overview, bundle.growthToday);
  guardMetrics(periodMetrics, bundle.growthPeriod);
  guardMetrics(allTimeMetrics, bundle.growthAll);
  // Premium stock is explicitly labelled; upgrade counts never use role-change proxies.
  const premiumStock = allTimeMetrics.find(r => r.id === "premium");
  if (premiumStock) { premiumStock.label = "Premium accounts"; premiumStock.value = bundle.growthAll.premiumAccounts ?? null; premiumStock.unavailable = premiumStock.value == null; }
  for (const ratio of ratios) {
    if (bundle.growthPeriod.source === "empty" || bundle.growthAll.source === "empty" ||
        (ratio.id.includes("active") || ratio.id === "engagement") && periodP.unavailable?.includes("activeUsers") ||
        ratio.id.includes("premium")) { ratio.value = "Unavailable"; ratio.unavailable = true; }
  }

  return {
    overview,
    period: periodMetrics,
    periodSource: bundle.growthPeriod.source.toUpperCase(),
    tables: tablesView.tables,
    topUsers: tablesView.topUsers,
    topGyms: tablesView.topGyms.length ? tablesView.topGyms : gym?.topGyms ?? [],
    allTime: allTimeMetrics,
    allTimeHero: { totalUsers: bundle.growthAll.source === "empty" ? null : all.totalUsers },
    demographics: {
      usersByCity: all.usersByCity,
      usersByGender: all.usersByGender,
    },
    ratios,
    targeting: {
      summary: targeting.summary,
      usersByCity: targeting.usersByCity,
      usersByGender: targeting.usersByGender,
      usersByAgeGroup: targeting.usersByAgeGroup,
      workoutsByCity: targetingHub.breakdowns.workouts?.city ?? [],
      workoutsByGender: targetingHub.breakdowns.workouts?.gender ?? [],
      insight: targeting.summary.suggestedSegment,
      confidence: targeting.summary.segmentConfidence,
    },
  };
}

export function displayMetricValue(m: HubMetric): string {
  if (m.unavailable) return "Unavailable";
  if (typeof m.value === "number") return fmt(m.value);
  if (m.value == null) return NA;
  return String(m.value);
}
