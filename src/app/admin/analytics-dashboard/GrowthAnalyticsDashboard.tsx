"use client";

import { useEffect, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
  Filler,
  type TooltipItem,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";
import type { GrowthDashboardPayload, LabeledCount } from "@/lib/analytics-dashboard-mock";
import type { GrowthAnalyticsPageBundle } from "@/lib/growth-analytics-fetch";
import type { PeriodFilterDays } from "@/lib/growth-analytics-views";
import {
  chartSeriesToCsv,
  downloadTextFile,
  growthDashboardFullCsv,
  type GrowthDataSource,
} from "@/lib/growth-dashboard";
import { postsByTypeSorted } from "@/lib/growth-numeric-snapshot";
import {
  communityHealthScorePlaceholder,
  interpretStickyFactor,
  labeledValue,
  missingDataWarningMessage,
  missingProfileStats,
  periodLabel,
  safeDivide,
  stickyFactorPercent,
  stickyInterpretationLabel,
} from "@/lib/growth-analytics-math";
import { HoverTip } from "./growth-components";
import Link from "next/link";
import {
  AllTimeHeroCard,
  AllTimeStatCard,
  ChartPanel,
  CommunityHeroCard,
  CompactMetricPill,
  DebugPanel,
  EmptyStatePanel,
  FunnelStep,
  InsightCard,
  PeriodAnalyticsPanel,
  SectionHeader,
  SupportStatCard,
  TargetingSummaryCard,
} from "./growth-analytics-cards";

let growthChartPluginsRegistered = false;
export function registerGrowthCharts() {
  if (typeof window === "undefined" || growthChartPluginsRegistered) return;
  ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler);
  growthChartPluginsRegistered = true;
}

function ChartCanvasPlaceholder({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-zinc-800/50 ${className}`} aria-hidden />;
}

const ACCENT = "#FF3B30";
const MUTED = "rgba(161, 161, 170, 0.95)";
const GRID = "rgba(39, 39, 42, 0.75)";
const BORDER = "rgba(39, 39, 42, 0.9)";

const GENDER_SLICE_COLORS = [
  ACCENT,
  "rgba(255, 59, 48, 0.55)",
  MUTED,
  "#52525b",
  "rgba(244, 63, 94, 0.75)",
  "rgba(56, 189, 248, 0.75)",
  "rgba(167, 139, 250, 0.85)",
  "rgba(34, 197, 94, 0.8)",
];

type ExpandedChartKey =
  | "signUps"
  | "workouts"
  | "premium"
  | "routines"
  | "cities"
  | "gender"
  | "ages"
  | "postsByType"
  | "growthActivity";

const CHART_HELP: Record<ExpandedChartKey, string> = {
  signUps: "Registrations per time bucket for the selected range.",
  workouts: "Finished workout sessions per bucket (same window as KPI).",
  premium: "New premium conversions per bucket (StoreKit + grant flow when live).",
  routines: "New routines created per bucket.",
  cities: "Users by profile city; missing city grouped as City not specified.",
  gender: "Users by normalized profile gender.",
  ages: "Users by age bracket from birthdate.",
  postsByType: "Totals by post_type from admin content stats.",
  growthActivity: "Sign-ups and workouts per bucket for the selected range (shared timeline).",
};

const CHART_TITLE: Record<ExpandedChartKey, string> = {
  signUps: "Sign ups over time",
  workouts: "Workouts logged over time",
  premium: "Premium subscribers",
  routines: "New routines created",
  cities: "Users by city",
  gender: "Users by gender",
  ages: "Users by age group",
  postsByType: "Posts by type",
  growthActivity: "Growth & activity",
};

function seriesForChart(
  periodPayload: GrowthDashboardPayload,
  demoPayload: GrowthDashboardPayload,
  key: ExpandedChartKey
): LabeledCount[] {
  switch (key) {
    case "signUps":
      return periodPayload.signUpsOverTime;
    case "workouts":
      return periodPayload.workoutsOverTime;
    case "premium":
      return periodPayload.premiumBuckets;
    case "routines":
      return periodPayload.routinesBuckets;
    case "cities":
      return demoPayload.usersByCity;
    case "gender":
      return demoPayload.usersByGender;
    case "ages":
      return demoPayload.usersByAgeGroup;
    case "growthActivity":
      return periodPayload.signUpsOverTime;
    default:
      return [];
  }
}

function seriesSum(values: number[]): number {
  return values.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
}

function baseTooltipLegend() {
  return {
    tooltip: {
      backgroundColor: "rgba(9, 9, 11, 0.94)",
      titleColor: "#fafafa",
      bodyColor: "#e4e4e7",
      borderColor: BORDER,
      borderWidth: 1,
      padding: 12,
      cornerRadius: 10,
    },
    legend: { display: false as const },
  };
}

function tooltipValueLabel(ctx: TooltipItem<"line" | "bar">) {
  const data = ctx.dataset.data as unknown[];
  const v = data[ctx.dataIndex];
  let n = 0;
  if (typeof v === "number" && Number.isFinite(v)) n = v;
  else if (typeof v === "string") {
    const p = Number(v);
    n = Number.isFinite(p) ? p : 0;
  }
  const ds = ctx.dataset.label ?? "Value";
  return ` ${ds}: ${Math.trunc(n).toLocaleString()}`;
}

function tooltipBucketTitle(items: TooltipItem<"line" | "bar">[]) {
  const i = items[0];
  return i?.label ? `Bucket: ${i.label}` : "";
}

const lineOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "index" as const, intersect: false },
  animation: { duration: 480, easing: "easeOutQuart" as const },
  plugins: {
    ...baseTooltipLegend(),
    legend: { display: false },
    tooltip: {
      ...baseTooltipLegend().tooltip,
      callbacks: {
        title: (items: TooltipItem<"line" | "bar">[]) => tooltipBucketTitle(items),
        label: tooltipValueLabel,
      },
    },
  },
  scales: {
    x: {
      grid: { color: GRID, drawBorder: false },
      ticks: { color: MUTED, maxRotation: 45, minRotation: 0 },
    },
    y: {
      beginAtZero: true,
      grace: "12%",
      grid: { color: GRID, drawBorder: false },
      ticks: { color: MUTED },
    },
  },
};

const barOptionsVertical = { ...lineOptions };

const barOptionsHorizontal = {
  indexAxis: "y" as const,
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "index" as const, intersect: false },
  animation: { duration: 480, easing: "easeOutQuart" as const },
  plugins: {
    ...baseTooltipLegend(),
    tooltip: {
      ...baseTooltipLegend().tooltip,
      callbacks: {
        title: (items: TooltipItem<"line" | "bar">[]) => tooltipBucketTitle(items),
        label: tooltipValueLabel,
      },
    },
  },
  scales: {
    x: {
      beginAtZero: true,
      grace: "12%",
      grid: { color: GRID, drawBorder: false },
      ticks: { color: MUTED },
    },
    y: {
      grid: { display: false },
      ticks: { color: MUTED },
    },
  },
};

const lineOptionsMulti = {
  ...lineOptions,
  plugins: {
    ...lineOptions.plugins,
    legend: {
      display: true,
      position: "top" as const,
      labels: { color: MUTED, boxWidth: 10, font: { size: 10 } },
    },
  },
};

export function GrowthAnalyticsDashboard({
  bundle,
  period,
  onPeriodChange,
  periodLoading = false,
  chartJsReady,
}: {
  bundle: GrowthAnalyticsPageBundle;
  period: PeriodFilterDays;
  onPeriodChange: (p: PeriodFilterDays) => void;
  periodLoading?: boolean;
  chartJsReady: boolean;
}) {
  const [expanded, setExpanded] = useState<ExpandedChartKey | null>(null);
  const payload = bundle.growthPeriod.payload;
  const source = bundle.growthPeriod.source as GrowthDataSource;
  const fetchNote = bundle.growthPeriod.fetchNote;
  const allPayload = bundle.growthAll.payload;
  const numeric = bundle.numeric;
  const { daily, allTime, targeting } = bundle.views;
  const ops = bundle.ops;

  const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString());

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(null);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [expanded]);

  const pLabel = periodLabel(period);
  const activeLabel =
    source === "live" ? "Active users · period" : "Active users · period (est.)";
  const activeSub = source === "live" ? undefined : "Estimated from hybrid events";
  const workoutsLabel = period === 1 ? "Workouts · today" : `Workouts · ${pLabel}`;
  const postsHeroLabel = "Posts · today";
  const activeMeta =
    source === "live"
      ? "Meaningful active users — definition from get_growth_dashboard (qualifying product actions)."
      : "Estimated active users — hybrid uses summed analytics event counts in-window when live active_users is unavailable; capped to headcount.";

  const missingWarn = missingDataWarningMessage(targeting.missing);

  const pa = payload.platformActivity;
  const stickyPct = stickyFactorPercent(pa.dau, pa.mau);
  const stickyBand = interpretStickyFactor(stickyPct);

  const healthScore = communityHealthScorePlaceholder({
    postsTotal: numeric.content?.postsTotal ?? 0,
    commentsTotal: numeric.content?.commentsTotal ?? 0,
    likesTotal: numeric.content?.likesTotal ?? 0,
    friendshipsTotal: numeric.friends?.totalFriendships ?? 0,
    gymCheckinsMonth: numeric.gym?.checkinsMonth ?? 0,
  });

  const premiumConv = safeDivide(payload.newPremiumSubscribers, payload.newSignUps) * 100;

  const postsByTypeRows = numeric.content ? postsByTypeSorted(numeric.content.postsByType) : [];

  const charts = {
    signUps: {
      labels: payload.signUpsOverTime.map((d) => d.label),
      datasets: [
        {
          label: "New sign ups",
          data: payload.signUpsOverTime.map((d) => d.value),
          borderColor: ACCENT,
          backgroundColor: "rgba(255, 59, 48, 0.06)",
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: ACCENT,
        },
      ],
    },
    workouts: {
      labels: payload.workoutsOverTime.map((d) => d.label),
      datasets: [
        {
          label: "Workouts logged",
          data: payload.workoutsOverTime.map((d) => d.value),
          borderColor: "#fafafa",
          backgroundColor: "rgba(250, 250, 250, 0.04)",
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: "#fafafa",
        },
      ],
    },
    premium: {
      labels: payload.premiumBuckets.map((d) => d.label),
      datasets: [
        {
          label: "New premium",
          data: payload.premiumBuckets.map((d) => d.value),
          backgroundColor: payload.premiumBuckets.map((_, i) => (i % 2 === 0 ? ACCENT : "rgba(255, 59, 48, 0.55)")),
          borderRadius: 6,
          borderSkipped: false as const,
        },
      ],
    },
    routines: {
      labels: payload.routinesBuckets.map((d) => d.label),
      datasets: [
        {
          label: "New routines",
          data: payload.routinesBuckets.map((d) => d.value),
          backgroundColor: "rgba(250, 250, 250, 0.18)",
          borderRadius: 6,
          borderSkipped: false as const,
        },
      ],
    },
    cities: {
      labels: allPayload.usersByCity.map((d) => d.label),
      datasets: [
        {
          label: "Users",
          data: allPayload.usersByCity.map((d) => d.value),
          backgroundColor: ACCENT,
          borderRadius: 4,
          borderSkipped: false as const,
        },
      ],
    },
    ages: {
      labels: allPayload.usersByAgeGroup.map((d) => d.label),
      datasets: [
        {
          label: "Users",
          data: allPayload.usersByAgeGroup.map((d) => d.value),
          backgroundColor: "rgba(250, 250, 250, 0.22)",
          borderRadius: 4,
          borderSkipped: false as const,
        },
      ],
    },
    gender: {
      labels: allPayload.usersByGender.map((d) => d.label),
      datasets: [
        {
          label: "Users",
          data: allPayload.usersByGender.map((d) => d.value),
          backgroundColor: allPayload.usersByGender.map(
            (_, i) => GENDER_SLICE_COLORS[i % GENDER_SLICE_COLORS.length]
          ),
          borderRadius: 4,
          borderSkipped: false as const,
        },
      ],
    },
    postsByType: {
      labels: postsByTypeRows.map((r) => r.label),
      datasets: [
        {
          label: "Posts",
          data: postsByTypeRows.map((r) => r.count),
          backgroundColor: "rgba(250, 250, 250, 0.2)",
          borderRadius: 4,
          borderSkipped: false as const,
        },
      ],
    },
    growthActivity: {
      labels: payload.signUpsOverTime.map((d) => d.label),
      datasets: [
        {
          label: "Sign-ups",
          data: payload.signUpsOverTime.map((d) => d.value),
          borderColor: ACCENT,
          backgroundColor: "rgba(255, 59, 48, 0.07)",
          borderWidth: 2,
          fill: true,
          tension: 0.35,
          pointRadius: 0,
        },
        {
          label: "Workouts",
          data: payload.workoutsOverTime.map((d) => d.value),
          borderColor: "#d4d4d8",
          backgroundColor: "rgba(244, 244, 245, 0.05)",
          borderWidth: 2,
          fill: true,
          tension: 0.35,
          pointRadius: 0,
        },
      ],
    },
  };

  const chartDead =
    source === "empty" ||
    (seriesSum(payload.signUpsOverTime.map((x) => x.value)) === 0 &&
      seriesSum(payload.workoutsOverTime.map((x) => x.value)) === 0 &&
      payload.totalUsers === 0);

  const funnelSignups = allPayload.totalUsers.toLocaleString();
  const profileProxy = Math.max(
    0,
    allPayload.totalUsers - labeledValue(allPayload.usersByGender, "Gender not specified")
  );
  const debugLines = [
    ...(fetchNote ? [`Growth: ${fetchNote}`] : []),
    ...numeric.fetchErrors.map((e) => `Aux: ${e}`),
    ...(bundle.retentionError ? [`Retention: ${bundle.retentionError}`] : []),
  ];

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
@media print {
  body * { visibility: hidden !important; }
  .growth-print-root, .growth-print-root * { visibility: visible !important; }
  .growth-print-root { position: absolute; left: 0; top: 0; width: 100%; background: #fff !important; color: #000 !important; padding: 16px; }
  .growth-print-root canvas { max-width: 100% !important; height: auto !important; }
}`,
        }}
      />
      <div className="min-h-full bg-[#0a0a0b] text-zinc-100">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
          <header className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-red-500">JUHD Admin</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Growth command center</h1>
              <p className="mt-2 max-w-xl text-sm text-zinc-500">
                Today, all-time scale, and ad targeting stay visible. Period charts use the filter below.
              </p>
              {fetchNote && <p className="mt-2 text-xs text-zinc-600">{fetchNote}</p>}
            </div>
            <div className="flex flex-col items-stretch gap-2 sm:items-end">
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                {source === "live" ? "Live RPC" : source === "hybrid" ? "Hybrid KPIs" : "No payload"}
              </span>
              <button
                type="button"
                onClick={() =>
                  downloadTextFile(
                    `juhd-growth-period-${period}d-${source}.csv`,
                    growthDashboardFullCsv(payload, source),
                    "text/csv;charset=utf-8"
                  )
                }
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 hover:border-red-500/35"
              >
                Export period CSV
              </button>
              <Link href="/admin/dashboard" className="text-center text-sm text-zinc-500 hover:text-red-400 sm:text-right">
                ← Operations dashboard
              </Link>
            </div>
          </header>

          <section className="mb-16">
            <SectionHeader kicker="Today" title="Daily command center" hint="Last 24h UTC — not affected by period filter." />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
              <InsightCard
                headline={`${fmt(daily.activeUsers)} active`}
                label={daily.activeUsersEstimated ? "Estimated meaningful users" : "Meaningful active users"}
                status="healthy"
              />
              <InsightCard headline={`${fmt(daily.signups)} signups`} label="Today" status="healthy" />
              <InsightCard headline={`${fmt(daily.workouts)} workouts`} label="Today" />
              <InsightCard headline={`${fmt(daily.posts)} posts`} label="Today · content RPC" />
              <InsightCard headline={`${fmt(daily.newPremium)} premium`} label="New today" />
              <InsightCard
                headline={`${fmt(daily.pendingBugReports)} bugs · ${fmt(daily.unresolvedErrors)} err`}
                label="Issues"
                status={
                  (daily.pendingBugReports != null && daily.pendingBugReports > 0) ||
                  (daily.unresolvedErrors != null && daily.unresolvedErrors > 0)
                    ? "watch"
                    : "neutral"
                }
              />
              <InsightCard headline={`${daily.mostActiveCity} most active`} label="Top city (profile)" />
            </div>
          </section>

          <section className="mb-20">
            <SectionHeader kicker="Scale" title="All-time snapshot" hint="Since launch — independent of period filter." />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <AllTimeHeroCard label="Total users" value={allTime.totalUsers} />
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:col-span-7">
                <AllTimeStatCard label="Workouts" value={allTime.totalWorkouts} />
                <AllTimeStatCard label="Routines" value={allTime.totalRoutines} />
                <AllTimeStatCard label="Posts" value={allTime.totalPosts ?? "—"} />
                <AllTimeStatCard label="Premium" value={allTime.totalPremium ?? "—"} />
                <AllTimeStatCard label="Friendships" value={allTime.totalFriendships ?? "—"} />
                <AllTimeStatCard label="Likes" value={allTime.totalLikes ?? "—"} />
                <AllTimeStatCard label="Comments" value={allTime.totalComments ?? "—"} />
                <AllTimeStatCard label="Gym check-ins" value={allTime.totalGymCheckins ?? "—"} />
                <AllTimeStatCard label="Bug reports" value={allTime.pendingBugReports ?? "—"} subtitle="Pending queue" />
                <AllTimeStatCard label="Errors" value={allTime.unresolvedErrors ?? "—"} subtitle="Unresolved" />
              </div>
            </div>
          </section>

          <section className="mb-20" id="targeting">
            <SectionHeader kicker="Ads" title="Targeting intelligence" hint="Profile demographics for marketing — all-time user base." />
            {missingWarn && (
              <div className="mb-6 rounded-xl border border-amber-900/35 bg-amber-950/15 px-4 py-3 text-sm text-amber-100/90">
                {missingWarn}
              </div>
            )}
            <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <TargetingSummaryCard label="Top city" value={targeting.summary.topCity} />
              <TargetingSummaryCard label="Largest gender" value={targeting.summary.largestGender} />
              <TargetingSummaryCard label="Largest age group" value={targeting.summary.largestAgeGroup} />
              <TargetingSummaryCard label="Missing location" value={`${targeting.summary.missingLocationPct.toFixed(1)}%`} />
              <TargetingSummaryCard label="Missing age" value={`${targeting.summary.missingAgePct.toFixed(1)}%`} />
              <TargetingSummaryCard label="Missing gender" value={`${targeting.summary.missingGenderPct.toFixed(1)}%`} />
              <TargetingSummaryCard
                label="Suggested segment"
                value={targeting.summary.suggestedSegment}
                hint={
                  targeting.summary.segmentConfidence === "low"
                    ? "Low confidence — incomplete profiles"
                    : "Derived from real profile distributions"
                }
              />
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <HoverTip text={CHART_HELP.cities}>
                <ChartPanel title={CHART_TITLE.cities} subtitle="All-time users by city" tall onExpand={() => setExpanded("cities")}>
                  {chartJsReady && allPayload.usersByCity.length ? (
                    <Bar data={charts.cities} options={barOptionsHorizontal} />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <EmptyStatePanel title="No cities" body="Demographics payload has no city rows." />
                    </div>
                  )}
                </ChartPanel>
              </HoverTip>
              <HoverTip text={CHART_HELP.gender}>
                <ChartPanel title={CHART_TITLE.gender} subtitle="All-time" tall onExpand={() => setExpanded("gender")}>
                  {chartJsReady && allPayload.usersByGender.length ? (
                    <Bar data={charts.gender} options={barOptionsHorizontal} />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <EmptyStatePanel title="No gender data" body="Profiles may be missing gender." />
                    </div>
                  )}
                </ChartPanel>
              </HoverTip>
              <HoverTip text={CHART_HELP.ages}>
                <ChartPanel title={CHART_TITLE.ages} subtitle="All-time" tall onExpand={() => setExpanded("ages")}>
                  {chartJsReady && allPayload.usersByAgeGroup.length ? (
                    <Bar data={charts.ages} options={barOptionsHorizontal} />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <EmptyStatePanel title="No age groups" body="Birthdate buckets empty in payload." />
                    </div>
                  )}
                </ChartPanel>
              </HoverTip>
            </div>
          </section>

          <PeriodAnalyticsPanel period={period} onPeriodChange={onPeriodChange} dataSource={source} loading={periodLoading}>
            <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <SupportStatCard
                label={activeLabel}
                value={payload.activeUsers}
                hint={activeMeta}
                sub={activeSub}
                delta="No comparison yet"
                status={payload.activeUsers > 0 ? "healthy" : "neutral"}
              />
              <SupportStatCard label="Signups" value={payload.newSignUps} delta="No comparison yet" />
              <SupportStatCard label="Workouts" value={payload.workoutsLogged} delta="No comparison yet" status="strong" />
              <SupportStatCard label="New premium" value={payload.newPremiumSubscribers} delta="No comparison yet" />
              <SupportStatCard label="New routines" value={payload.newRoutinesCreated} delta="No comparison yet" />
              <SupportStatCard
                label="Sticky factor"
                value={`${stickyPct.toFixed(1)}%`}
                hint={stickyInterpretationLabel(stickyBand)}
                delta={stickyBand}
                status={stickyBand === "weak" ? "weak" : stickyBand === "strong" || stickyBand === "excellent" ? "strong" : "neutral"}
              />
            </div>

          <section className="mt-4">
            <SectionHeader kicker="Trends" title="Period charts" hint="Expand for full-screen and CSV export." />
            {chartDead && (
              <div className="mb-6 rounded-xl border border-dashed border-zinc-700/80 bg-zinc-950/50 px-4 py-3 text-sm text-zinc-400">
                No time-series or headcount in this window — check Supabase RPCs, RLS, or fetch timeout.
              </div>
            )}
            <div className="space-y-6">
              <HoverTip text={CHART_HELP.growthActivity}>
                <ChartPanel
                  title="Growth & activity"
                  subtitle="Sign-ups and workouts per bucket"
                  tall
                  onExpand={() => setExpanded("growthActivity")}
                >
                  {chartJsReady ? (
                    <Line data={charts.growthActivity} options={lineOptionsMulti} />
                  ) : (
                    <ChartCanvasPlaceholder className="h-full w-full rounded-xl" />
                  )}
                </ChartPanel>
              </HoverTip>
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <HoverTip text={CHART_HELP.signUps}>
                  <ChartPanel title={CHART_TITLE.signUps} subtitle="New registrations" tall onExpand={() => setExpanded("signUps")}>
                    {chartJsReady ? (
                      <Line data={charts.signUps} options={lineOptions} />
                    ) : (
                      <ChartCanvasPlaceholder className="h-full w-full rounded-xl" />
                    )}
                  </ChartPanel>
                </HoverTip>
                <HoverTip text={CHART_HELP.workouts}>
                  <ChartPanel title={CHART_TITLE.workouts} subtitle="Finished sessions" tall onExpand={() => setExpanded("workouts")}>
                    {chartJsReady ? (
                      <Line data={charts.workouts} options={lineOptions} />
                    ) : (
                      <ChartCanvasPlaceholder className="h-full w-full rounded-xl" />
                    )}
                  </ChartPanel>
                </HoverTip>
                <HoverTip text={CHART_HELP.premium}>
                  <ChartPanel title={CHART_TITLE.premium} subtitle="New conversions per bucket" tall onExpand={() => setExpanded("premium")}>
                    {chartJsReady ? (
                      <Bar data={charts.premium} options={barOptionsVertical} />
                    ) : (
                      <ChartCanvasPlaceholder className="h-full w-full rounded-xl" />
                    )}
                  </ChartPanel>
                </HoverTip>
                <HoverTip text={CHART_HELP.routines}>
                  <ChartPanel title={CHART_TITLE.routines} subtitle="Created per bucket" tall onExpand={() => setExpanded("routines")}>
                    {chartJsReady ? (
                      <Bar data={charts.routines} options={barOptionsVertical} />
                    ) : (
                      <ChartCanvasPlaceholder className="h-full w-full rounded-xl" />
                    )}
                  </ChartPanel>
                </HoverTip>
              </div>
              <ChartPanel title="Posts over time" subtitle="Daily series (not wired)">
                <div className="flex h-full min-h-[10rem] items-center justify-center">
                  <EmptyStatePanel
                    title="Not connected yet"
                    body="Add a daily posts aggregate RPC to plot this curve. Intentionally empty — no fabricated bucket data."
                  />
                </div>
              </ChartPanel>
            </div>
          </section>

          </PeriodAnalyticsPanel>

          <section className="mt-24 scroll-mt-10" id="community">
            <SectionHeader kicker="Community" title="Social graph" hint="Admin content + friends + gym RPCs. Health score is experimental." />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <CommunityHeroCard
                  score={healthScore}
                  subtitle="Log blend of posts, engagement, friendships, gym (30d). For signal only — not a KPI target."
                />
              </div>
              <div className="space-y-5 lg:col-span-7">
                <div className="flex flex-wrap gap-2">
                  <CompactMetricPill label="Posts total" value={numeric.content?.postsTotal ?? "—"} />
                  <CompactMetricPill label="Posts today" value={numeric.content?.postsToday ?? "—"} />
                  <CompactMetricPill label="Posts 7d" value={numeric.content?.postsWeek ?? "—"} />
                  <CompactMetricPill label="Posts 30d" value={numeric.content?.postsMonth ?? "—"} />
                  <CompactMetricPill label="Likes" value={numeric.content?.likesTotal ?? "—"} />
                  <CompactMetricPill label="Comments" value={numeric.content?.commentsTotal ?? "—"} />
                  <CompactMetricPill label="Reposts" value={numeric.content?.repostsTotal ?? "—"} />
                  <CompactMetricPill label="Friendships" value={numeric.friends?.totalFriendships ?? "—"} />
                  <CompactMetricPill label="Pending req." value={numeric.friends?.pendingRequests ?? "—"} />
                  <CompactMetricPill
                    label="Accept %"
                    value={numeric.friends != null ? `${numeric.friends.acceptanceRatePct.toFixed(1)}%` : "—"}
                  />
                  <CompactMetricPill
                    label="Avg friends"
                    value={numeric.friends != null ? numeric.friends.avgFriendsPerUser.toFixed(2) : "—"}
                  />
                  <CompactMetricPill label="Gym 30d" value={numeric.gym?.checkinsMonth ?? "—"} />
                  <CompactMetricPill
                    label="Post reports"
                    value={ops.pendingPostReports ?? "—"}
                    accent={!!ops.pendingPostReports && ops.pendingPostReports > 0}
                  />
                </div>
                <HoverTip text={CHART_HELP.postsByType}>
                  <ChartPanel title="Posts by type" subtitle="Content mix" tall onExpand={() => setExpanded("postsByType")}>
                    {chartJsReady ? (
                      postsByTypeRows.length ? (
                        <Bar data={charts.postsByType} options={barOptionsHorizontal} />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <EmptyStatePanel title="No breakdown" body="get_admin_content_stats did not return posts_by_type." />
                        </div>
                      )
                    ) : (
                      <ChartCanvasPlaceholder className="h-full w-full rounded-xl" />
                    )}
                  </ChartPanel>
                </HoverTip>
              </div>
            </div>
          </section>

          <section className="mt-24 scroll-mt-10" id="monetization">
            <SectionHeader kicker="Revenue" title="Monetization" hint="StoreKit + grant-premium. Conversion = new premium ÷ new sign-ups in the same window." />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:col-span-7">
                <SupportStatCard
                  label="New premium · period"
                  value={payload.newPremiumSubscribers}
                  delta="No comparison yet"
                  status={payload.newPremiumSubscribers > 0 ? "strong" : "neutral"}
                />
                <SupportStatCard
                  label="Conversion · period"
                  value={`${premiumConv.toFixed(2)}%`}
                  hint="Rough: new premium ÷ new sign-ups (undefined if sign-ups = 0)."
                  delta="No comparison yet"
                  status="neutral"
                />
                <SupportStatCard
                  label="New sign-ups · period"
                  value={payload.newSignUps}
                  delta="No comparison yet"
                  status="neutral"
                />
              </div>
              <div className="flex flex-col gap-3 lg:col-span-5">
                <EmptyStatePanel
                  title="Premium by city"
                  body="Needs a dedicated SQL slice. Placeholder until wired — not estimated in-app."
                />
                <EmptyStatePanel
                  title="Premium user activity"
                  body="Workouts and posts per premium user can be added once server aggregates exist."
                />
              </div>
            </div>
          </section>

          <section className="mt-24 scroll-mt-10" id="funnel">
            <SectionHeader
              kicker="Journey"
              title="Funnel"
              hint="Downloads through premium. Telemetry gaps show as not connected — not broken data."
            />
            <div className="flex flex-wrap items-stretch justify-center gap-1.5 md:gap-2">
              <FunnelStep label="Downloads" value="Not connected yet" state="off" />
              <span className="hidden self-center text-zinc-600 md:inline" aria-hidden>
                →
              </span>
              <FunnelStep label="App opens" value="Not connected yet" state="off" />
              <span className="hidden self-center text-zinc-600 md:inline" aria-hidden>
                →
              </span>
              <FunnelStep label="Sign-ups" value={funnelSignups} state="ok" />
              <span className="hidden self-center text-zinc-600 md:inline" aria-hidden>
                →
              </span>
              <FunnelStep label="Completed profile" value={`~${profileProxy.toLocaleString()}`} state="pending" />
              <span className="hidden self-center text-zinc-600 md:inline" aria-hidden>
                →
              </span>
              <FunnelStep label="First workout" value="Not connected yet" state="pending" />
              <span className="hidden self-center text-zinc-600 md:inline" aria-hidden>
                →
              </span>
              <FunnelStep label="First post" value="Not connected yet" state="pending" />
              <span className="hidden self-center text-zinc-600 md:inline" aria-hidden>
                →
              </span>
              <FunnelStep label="Returned D7" value="Not connected yet" state="pending" />
              <span className="hidden self-center text-zinc-600 md:inline" aria-hidden>
                →
              </span>
              <FunnelStep label="Premium" value={(numeric.premiumSubscribers ?? 0).toLocaleString()} state="ok" />
            </div>
          </section>

          <section className="mt-24 scroll-mt-10" id="retention">
            <SectionHeader kicker="Habit" title="Retention" hint="D1/D7/D30 need daily cohort materialization. Weekly table uses get_admin_retention_stats." />
            <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(["D1", "D7", "D30"] as const).map((d) => (
                <div
                  key={d}
                  className="rounded-xl border border-white/[0.06] bg-zinc-950/50 px-4 py-4 text-center transition-colors hover:border-white/[0.1]"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{d}</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-500">—</p>
                  <p className="mt-1 text-[11px] text-zinc-600">Not connected</p>
                </div>
              ))}
            </div>
            {bundle.retention && bundle.retention.length > 0 ? (
              <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-zinc-950/30">
                <div className="max-h-80 overflow-auto">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead className="sticky top-0 bg-zinc-950/95 text-xs uppercase text-zinc-500">
                      <tr>
                        <th className="px-4 py-3">Cohort</th>
                        <th className="px-4 py-3 text-right">Signups</th>
                        <th className="px-4 py-3 text-right">W1 active</th>
                        <th className="px-4 py-3 text-right">W1 %</th>
                        <th className="px-4 py-3 text-right">W4 active</th>
                        <th className="px-4 py-3 text-right">W4 %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bundle.retention.slice(0, 12).map((row) => (
                        <tr key={row.cohort_week} className="border-t border-zinc-800/80 hover:bg-zinc-900/40">
                          <td className="px-4 py-2.5 text-zinc-300">{row.cohort_week}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{row.signups.toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{row.active_week1.toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{row.retention_week1_pct}%</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{row.active_week4.toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{row.retention_week4_pct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <EmptyStatePanel
                title="Weekly cohort unavailable"
                body="Retention tracking needs completed_at / event tracking connection, or the RPC returned no rows for this admin session."
              />
            )}
            <p className="mt-5 text-[11px] text-zinc-600">Cohort heatmap — placeholder until return events are materialized.</p>
            <div className="mt-2 grid grid-cols-8 gap-1 opacity-50 sm:grid-cols-12">
              {Array.from({ length: 48 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-sm bg-zinc-800/80" />
              ))}
            </div>
          </section>

          {missingWarn && (
            <div className="mt-16 rounded-xl border border-amber-900/35 bg-amber-950/15 px-4 py-3 text-sm text-amber-100/90">
              {missingWarn}
            </div>
          )}

          <DebugPanel title="Developer / RPC notes" lines={debugLines} />

          {(
            <section className="mt-4 border-t border-zinc-800/80 pt-12" aria-labelledby="city-table">
              <h2 id="city-table" className="mb-2 text-lg font-semibold text-white">
                Users by city (table)
              </h2>
              <p className="mb-4 text-sm text-zinc-500">All cities in the demographics payload, sorted by users.</p>
              <div className="overflow-hidden rounded-2xl border border-zinc-800">
                <div className="max-h-[min(70vh,720px)] overflow-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-zinc-950/95 text-xs uppercase text-zinc-500">
                      <tr>
                        <th className="px-4 py-3">City</th>
                        <th className="px-4 py-3 text-right">Users</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...allPayload.usersByCity]
                        .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
                        .map((row, i) => (
                          <tr key={`${row.label}-${i}`} className="border-t border-zinc-800/70 hover:bg-zinc-900/40">
                            <td className="px-4 py-2.5">{row.label}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">{row.value.toLocaleString()}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>

      {expanded && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setExpanded(null)}
          role="presentation"
        >
          <div
            className="growth-print-root flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-[#0b0b0c] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-5 py-4">
              <h2 className="text-lg font-semibold text-white">{CHART_TITLE[expanded]}</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:border-red-500/40"
                  onClick={() =>
                    downloadTextFile(
                      `juhd-growth-${expanded}.csv`,
                      chartSeriesToCsv(
                        CHART_TITLE[expanded],
                        expanded === "postsByType"
                          ? postsByTypeRows.map((r) => ({ label: r.label, value: r.count }))
                          : seriesForChart(payload, allPayload, expanded)
                      ),
                      "text/csv;charset=utf-8"
                    )
                  }
                >
                  CSV
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:border-red-500/40"
                  onClick={() => setExpanded(null)}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="p-5">
              <div className="h-[65vh] min-h-[280px] w-full">
                {chartJsReady && expanded === "signUps" && <Line data={charts.signUps} options={lineOptions} />}
                {chartJsReady && expanded === "workouts" && <Line data={charts.workouts} options={lineOptions} />}
                {chartJsReady && expanded === "premium" && <Bar data={charts.premium} options={barOptionsVertical} />}
                {chartJsReady && expanded === "routines" && <Bar data={charts.routines} options={barOptionsVertical} />}
                {chartJsReady && expanded === "cities" && <Bar data={charts.cities} options={barOptionsHorizontal} />}
                {chartJsReady && expanded === "gender" && <Bar data={charts.gender} options={barOptionsHorizontal} />}
                {chartJsReady && expanded === "ages" && <Bar data={charts.ages} options={barOptionsHorizontal} />}
                {chartJsReady && expanded === "postsByType" && postsByTypeRows.length > 0 && (
                  <Bar data={charts.postsByType} options={barOptionsHorizontal} />
                )}
                {chartJsReady && expanded === "growthActivity" && (
                  <Line data={charts.growthActivity} options={lineOptionsMulti} />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
