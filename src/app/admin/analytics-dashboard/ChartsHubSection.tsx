"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { GrowthAnalyticsPageBundle } from "@/lib/growth-analytics-fetch";
import type { PeriodFilterDays } from "@/lib/growth-analytics-views";
import {
  buildChartsHubView,
  bucketSeriesSum,
  hasRealBucketVariance,
  isMirroredSignupBuckets,
} from "@/lib/charts-hub-data";
import { fetchChartsInsights } from "@/lib/analytics-hub-rpc";
import { SimpleBucketList } from "./SimpleBucketList";
import {
  MetricCard,
  PeriodFilterBar,
  SectionHeader,
  EmptyStatePanel,
  AnalyticsTable,
} from "./analytics-hub-components";

function TrendPanel({
  title,
  subtitle,
  total,
  rows,
  color,
  mirrorNote,
  bucketSum,
}: {
  title: string;
  subtitle: string;
  total: number;
  rows: { label: string; value: number }[];
  color: string;
  mirrorNote?: string;
  bucketSum?: number;
}) {
  const sumMismatch =
    bucketSum != null && rows.length > 0 && Math.abs(bucketSum - total) > 1;
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="text-xs text-zinc-500">{subtitle}</p>
        </div>
        <p className="text-2xl font-semibold tabular-nums text-white">{total.toLocaleString()}</p>
      </div>
      {sumMismatch ? (
        <p className="mb-3 rounded-lg border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-xs text-sky-200/90">
          Chart buckets sum to {bucketSum!.toLocaleString()} (headline {total.toLocaleString()}). Re-run{" "}
          <code className="text-[10px]">admin_growth_dashboard_exclude_test.sql</code> if buckets look wrong.
        </p>
      ) : null}
      {mirrorNote ? (
        <p className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90">
          {mirrorNote}
        </p>
      ) : (
        <SimpleBucketList rows={rows} color={color} />
      )}
    </div>
  );
}

export function ChartsHubSection({
  bundle,
  period,
  onPeriodChange,
  periodLoading,
  refreshCount = 0,
}: {
  bundle: GrowthAnalyticsPageBundle;
  period: PeriodFilterDays;
  onPeriodChange: (p: PeriodFilterDays) => void;
  periodLoading?: boolean;
  refreshCount?: number;
}) {
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insights, setInsights] = useState({
    goals: [] as { label: string; value: number }[],
    activeHour: [] as { label: string; value: number }[],
    activeWeekday: [] as { label: string; value: number }[],
    fetchErrors: [] as string[],
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setInsightsLoading(true);
      try {
        const supabase = createClient();
        const data = await fetchChartsInsights(supabase, period);
        if (!cancelled) setInsights(data);
      } finally {
        if (!cancelled) setInsightsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [period, refreshCount]);

  const view = useMemo(
    () =>
      buildChartsHubView(
        bundle.growthPeriod.payload,
        bundle.hub,
        bundle.numeric,
        period,
        insights
      ),
    [bundle, period, insights]
  );

  const routinesMirrored = isMirroredSignupBuckets(view.routinesSeries, view.signupsSeries);
  const premiumMirrored = isMirroredSignupBuckets(view.premiumSeries, view.signupsSeries);
  const busy = Boolean(periodLoading || insightsLoading);

  return (
    <section>
      <SectionHeader
        kicker="Trends"
        title="Charts"
        hint="Simple daily/monthly counts. Excludes role=test."
      />
      <PeriodFilterBar
        period={period}
        onChange={(p) => onPeriodChange(p as PeriodFilterDays)}
        dataSource={bundle.growthPeriod.source}
        loading={busy}
        hint={
          bundle.growthPeriod.fetchNote?.includes("Workout chart empty")
            ? bundle.growthPeriod.fetchNote
            : view.bucketCaption
        }
      />

      {periodLoading ? (
        <div className="py-16 text-center text-sm text-zinc-500">Updating…</div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard label="Signups" value={view.totals.signups.toLocaleString()} />
            <MetricCard label="Workouts" value={view.totals.workouts.toLocaleString()} />
            <MetricCard label="New routines" value={view.totals.routines.toLocaleString()} />
            <MetricCard label="New premium" value={view.totals.premium.toLocaleString()} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <TrendPanel
              title="Signups"
              subtitle={view.bucketCaption}
              total={view.totals.signups}
              rows={view.signupsSeries}
              color="#FF3B30"
              bucketSum={bucketSeriesSum(view.signupsSeries)}
            />
            <TrendPanel
              title="Workouts"
              subtitle="Finished sessions per bucket"
              total={view.totals.workouts}
              rows={view.workoutsSeries}
              color="#a1a1aa"
              bucketSum={bucketSeriesSum(view.workoutsSeries)}
              mirrorNote={
                view.workoutsSeries.length === 0 && view.totals.workouts > 0
                  ? "Workout buckets need get_admin_workouts_over_time in Supabase. Run FitLog/scripts/admin_workouts_over_time_rpc.sql (or the full admin_growth_dashboard_exclude_test.sql), then restart juhd-admin."
                  : undefined
              }
            />
            <TrendPanel
              title="Routines created"
              subtitle={view.bucketCaption}
              total={view.totals.routines}
              rows={view.routinesSeries}
              color="#f59e0b"
              bucketSum={bucketSeriesSum(view.routinesSeries)}
              mirrorNote={
                routinesMirrored
                  ? "Routine buckets matched signup shape (stale SQL). Re-run admin_growth_dashboard_exclude_test.sql."
                  : view.routinesSeries.length === 0 && view.totals.routines > 0
                    ? `Total: ${view.totals.routines.toLocaleString()} new routines — per-day buckets could not be loaded (check admin RLS on routines).`
                    : !hasRealBucketVariance(view.routinesSeries) && view.routinesSeries.length > 0
                      ? "Bucket values look synthetic (all equal). Re-run admin_growth_dashboard_exclude_test.sql."
                      : undefined
              }
            />
            <TrendPanel
              title="New premium"
              subtitle="Upgrades in period"
              total={view.totals.premium}
              rows={view.premiumSeries}
              color="#a855f7"
              mirrorNote={
                premiumMirrored || !hasRealBucketVariance(view.premiumSeries)
                  ? view.totals.premium === 0
                    ? "No premium upgrades in this period."
                    : `Total: ${view.totals.premium.toLocaleString()} upgrades. Per-day chart needs premium bucket data from SQL.`
                  : undefined
              }
            />
          </div>

          <div className="mt-10">
            <SectionHeader kicker="Geo" title="Cities" hint="Top 10 in selected window." />
            <div className="grid gap-4 lg:grid-cols-2">
              <AnalyticsTable
                title="Top cities — new signups"
                rows={view.topCitiesActive}
                emptyMessage="No signups by city."
              />
              <AnalyticsTable
                title="Top cities — workouts"
                rows={view.topCitiesWorkouts}
                emptyMessage="No workouts by city."
              />
              <AnalyticsTable
                title="Top cities — engagement"
                rows={view.topCitiesEngagement}
                emptyMessage="No engagement breakdown."
              />
              {view.fastestGrowingCity ? (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <h3 className="text-sm font-semibold text-white">Top signup city</h3>
                  <p className="mt-1 text-xs text-zinc-500">Most new users in this period</p>
                  <p className="mt-4 text-xl font-semibold text-white">{view.fastestGrowingCity.label}</p>
                  <p className="mt-1 text-3xl font-bold tabular-nums text-red-400">
                    {view.fastestGrowingCity.value.toLocaleString()}
                  </p>
                </div>
              ) : (
                <EmptyStatePanel title="No leader" body="No signup cities in window." />
              )}
            </div>
          </div>

          <div className="mt-10">
            <SectionHeader kicker="Goals" title="Goal & fitness insights" />
            <AnalyticsTable title="Goals selected" rows={view.goals} emptyMessage="Run admin_charts_insights_rpc.sql" />
          </div>

          <div className="mt-10">
            <SectionHeader kicker="Social" title="Social engagement" />
            <div className="mb-4 grid max-w-lg grid-cols-2 gap-3">
              <MetricCard
                label="Avg comments / post"
                value={view.avgCommentsPerPost != null ? String(view.avgCommentsPerPost) : "—"}
              />
              <MetricCard
                label="Avg likes / post"
                value={view.avgLikesPerPost != null ? String(view.avgLikesPerPost) : "—"}
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {view.activeHour.length > 0 ? (
                <SimpleBucketList rows={view.activeHour} color="#38bdf8" emptyMessage="No events" />
              ) : (
                <EmptyStatePanel title="Active hour" body="Run admin_charts_insights_rpc.sql" />
              )}
              {view.activeWeekday.length > 0 ? (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <h3 className="mb-3 text-sm font-semibold text-white">Busiest weekdays</h3>
                  <SimpleBucketList rows={view.activeWeekday} color="#818cf8" />
                </div>
              ) : (
                <EmptyStatePanel title="Active weekday" body="No weekday data." />
              )}
            </div>
          </div>

          {insights.fetchErrors.length > 0 && (
            <p className="mt-6 text-xs text-amber-500/90">{insights.fetchErrors.join(" · ")}</p>
          )}
        </>
      )}
    </section>
  );
}
