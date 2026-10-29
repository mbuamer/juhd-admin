"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Line, Bar } from "react-chartjs-2";
import { createClient } from "@/lib/supabase";
import type { GrowthAnalyticsPageBundle } from "@/lib/growth-analytics-fetch";
import type { PeriodFilterDays } from "@/lib/growth-analytics-views";
import {
  buildAnalyticsHubData,
  buildTablesHubView,
  displayMetricValue,
  type HubTabId,
} from "@/lib/analytics-hub-data";
import { fetchAnalyticsHubExtras, type HubWindowDays } from "@/lib/analytics-hub-rpc";
import { hubWindowLabel, periodLabel } from "@/lib/growth-analytics-math";
import { PushSection } from "./PushSection";
import { RetentionSection } from "./RetentionSection";
import { ChartsHubSection } from "./ChartsHubSection";
import { TargetingSummaryCard, DebugPanel } from "./growth-analytics-cards";
import {
  AnalyticsTabs,
  MetricCard,
  HeroMetricCard,
  RatioCard,
  InsightCard,
  AnalyticsTable,
  PeriodFilterBar,
  SectionHeader,
  ChartPanel,
  EmptyStatePanel,
} from "./analytics-hub-components";
import { barChartData, growthActivityChartData, hubBarOptions, hubLineOptions } from "./analytics-hub-charts";

function ChartPlaceholder() {
  return <div className="h-full min-h-[16rem] animate-pulse rounded-xl bg-zinc-800/40" aria-hidden />;
}

export function AnalyticsHub({
  bundle,
  period,
  onPeriodChange,
  periodLoading,
  refreshing,
  onRefresh,
  refreshCount = 0,
  chartJsReady,
}: {
  bundle: GrowthAnalyticsPageBundle;
  period: PeriodFilterDays;
  onPeriodChange: (p: PeriodFilterDays) => void;
  periodLoading?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void | Promise<void>;
  refreshCount?: number;
  chartJsReady: boolean;
}) {
  const [tab, setTab] = useState<HubTabId>("overview");
  const [tablesPeriod, setTablesPeriod] = useState<HubWindowDays>(7);
  const [tablesHub, setTablesHub] = useState(bundle.hub);
  const [tablesLoading, setTablesLoading] = useState(false);

  const hub = useMemo(() => buildAnalyticsHubData(bundle, bundle.hub, period), [bundle, period]);
  const tablesView = useMemo(() => buildTablesHubView(tablesHub), [tablesHub]);
  const periodPayload = bundle.growthPeriod.payload;
  const debugLines = [
    ...bundle.numeric.fetchErrors.map((e) => `numeric: ${e}`),
    ...bundle.hub.fetchErrors.map((e) => `hub: ${e}`),
    ...bundle.targetingHub.fetchErrors.map((e) => `targeting: ${e}`),
    ...tablesHub.fetchErrors.map((e) => `tables: ${e}`),
    bundle.growthPeriod.fetchNote ? `period: ${bundle.growthPeriod.fetchNote}` : "",
  ].filter(Boolean);

  const periodHint = periodLabel(period);
  const tablesHint = hubWindowLabel(tablesPeriod);

  useEffect(() => {
    if (tab !== "tables") return;
    let cancelled = false;
    async function loadTables() {
      setTablesLoading(true);
      try {
        const supabase = createClient();
        const data = await fetchAnalyticsHubExtras(supabase, tablesPeriod);
        if (!cancelled) setTablesHub(data);
      } finally {
        if (!cancelled) setTablesLoading(false);
      }
    }
    void loadTables();
    return () => {
      cancelled = true;
    };
  }, [tab, tablesPeriod, refreshCount]);

  useEffect(() => {
    if (tab !== "tables") setTablesHub(bundle.hub);
  }, [bundle.hub, tab]);

  const busy = Boolean(periodLoading || refreshing);

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-zinc-100">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.06] pb-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-red-500/90">JUHD Dash</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Analytics Hub</h1>
            <p className="mt-2 max-w-xl text-sm text-zinc-500">
              Founder dashboard — daily pulse, period trends, breakdowns, and targeting. Workouts = finished sessions.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {onRefresh && (
              <button
                type="button"
                onClick={() => void onRefresh()}
                disabled={busy}
                className="rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
            )}
            <Link
              href="/admin/dashboard"
              className="rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-400 hover:border-white/20 hover:text-white"
            >
              ← Admin home
            </Link>
          </div>
        </header>

        <p className="mb-4 text-sm text-zinc-400">{bundle.growthPeriod.fetchNote} {bundle.growthPeriod.generatedAt ? `Updated ${new Date(bundle.growthPeriod.generatedAt).toLocaleString("en-GB", {timeZone:"Asia/Riyadh"})} (Asia/Riyadh)` : ""}</p>
        <p className="mb-4 rounded-lg border border-amber-500/30 p-3 text-sm text-amber-200">Local rollout review: growth, content, gym and report analytics use Saudi calendar periods and QA exclusions. Verified subscription starts, deletion history and goals remain unavailable pending their audits. Operational error and message-report queues remain separate support inventories.</p>
        <div className="mb-8">
          <AnalyticsTabs active={tab} onChange={setTab} />
        </div>

        {tab === "push" && <PushSection refreshCount={refreshCount} />}
        {tab === "retention" && <RetentionSection refreshCount={refreshCount} />}
        {tab === "overview" && (
          <section>
            <SectionHeader kicker="Daily" title="Overview" hint="Today only · Asia/Riyadh. Historical activity is observed, not complete coverage." />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {hub.overview.map((m) => (
                <MetricCard key={m.id} label={m.label} value={displayMetricValue(m)} sub={m.sub} />
              ))}
            </div>
          </section>
        )}

        {tab === "charts" && (
          <ChartsHubSection
            bundle={bundle}
            period={period}
            onPeriodChange={onPeriodChange}
            periodLoading={periodLoading}
            refreshCount={refreshCount}
          />
        )}

        {tab === "period" && (
          <section>
            <SectionHeader kicker="Windowed" title="Period Summary" />
            <PeriodFilterBar
              period={period}
              onChange={(p) => onPeriodChange(p as PeriodFilterDays)}
              dataSource={hub.periodSource}
              loading={periodLoading}
            />
            {periodLoading ? (
              <div className="py-16 text-center text-sm text-zinc-500">Updating period…</div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {hub.period.map((m) => (
                    <MetricCard key={m.id} label={m.label} value={displayMetricValue(m)} sub={m.sub} />
                  ))}
                </div>
                <div className="mt-8">
                  <ChartPanel title="Growth & activity" subtitle={`Sign-ups and workouts per bucket · ${periodHint}`}>
                    {bundle.growthPeriod.source === "empty" ? <EmptyStatePanel title="Unavailable" body="Measured chart data could not be loaded." /> : chartJsReady ? (
                      <Line data={growthActivityChartData(periodPayload)} options={hubLineOptions} />
                    ) : (
                      <ChartPlaceholder />
                    )}
                  </ChartPanel>
                </div>
              </>
            )}
          </section>
        )}

        {tab === "tables" && (
          <section>
            <SectionHeader
              kicker="Operations"
              title="Tables"
              hint="City/gender breakdowns and leaderboards for the selected window."
            />
            <PeriodFilterBar
              period={tablesPeriod}
              onChange={setTablesPeriod}
              includeAllTime
              loading={tablesLoading}
              hint={`Breakdown window: ${tablesHint}`}
            />
            {tablesLoading ? (
              <div className="py-16 text-center text-sm text-zinc-500">Loading tables…</div>
            ) : (
              <>
                <div className="mb-6 grid gap-4 lg:grid-cols-2">
                  <AnalyticsTable
                    title="Most active users (workouts)"
                    rows={tablesView.topUsers.map((u) => ({ label: u.username, value: u.count }))}
                    emptyMessage="No leaderboard data for this window."
                  />
                  <AnalyticsTable
                    title="Most active gyms"
                    rows={tablesView.topGyms.map((g) => ({ label: g.gymName, value: g.checkinCount }))}
                    emptyMessage="No gym check-ins in this window."
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {tablesView.tables.map((t) => (
                    <AnalyticsTable key={t.id} title={t.title} rows={t.rows} emptyMessage={t.emptyMessage} />
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        {tab === "alltime" && (
          <section>
            <SectionHeader kicker="Lifetime" title="All-Time" hint="Totals from retained records. No period filter." />
            <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <HeroMetricCard label="Total users" value={hub.allTimeHero.totalUsers?.toLocaleString() ?? "Unavailable"} />
              {hub.allTime.map((m) => (
                <MetricCard key={m.id} label={m.label} value={displayMetricValue(m)} />
              ))}
            </div>
            <div className="mt-8 grid gap-4 lg:grid-cols-2">
              <ChartPanel title="Users by city" subtitle="Stock profiles (all users)">
                {chartJsReady && hub.demographics.usersByCity.length ? (
                  <Bar
                    data={barChartData(hub.demographics.usersByCity.slice(0, 12))}
                    options={hubBarOptions}
                  />
                ) : (
                  <EmptyStatePanel title="No data" body="Not available yet" />
                )}
              </ChartPanel>
              <ChartPanel title="Users by gender" subtitle="Stock profiles (all users)">
                {chartJsReady && hub.demographics.usersByGender.length ? (
                  <Bar data={barChartData(hub.demographics.usersByGender)} options={hubBarOptions} />
                ) : (
                  <EmptyStatePanel title="No data" body="Not available yet" />
                )}
              </ChartPanel>
            </div>
          </section>
        )}

        {tab === "ratios" && (
          <section>
            <SectionHeader
              kicker="Health"
              title="Ratios"
              hint={`Computed from period (${periodHint}) and all-time totals. Uses ${hub.periodSource} period data.`}
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {hub.ratios.map((r) => (
                <RatioCard key={r.id} label={r.label} value={r.value} formula={r.formula} />
              ))}
            </div>
          </section>
        )}

        {tab === "targeting" && (
          <section>
            <SectionHeader kicker="Marketing" title="Targeting" />
            <InsightCard
              headline={hub.targeting.insight}
              body="Suggested segment from profile demographics and workout concentration."
              lowConfidence={hub.targeting.confidence === "low"}
            />
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <TargetingSummaryCard label="Top city" value={hub.targeting.summary.topCity} />
              <TargetingSummaryCard label="Largest gender" value={hub.targeting.summary.largestGender} />
              <TargetingSummaryCard label="Largest age group" value={hub.targeting.summary.largestAgeGroup} />
              <TargetingSummaryCard
                label="Missing city"
                value={`${hub.targeting.summary.missingLocationPct.toFixed(0)}%`}
              />
              <TargetingSummaryCard
                label="Missing gender"
                value={`${hub.targeting.summary.missingGenderPct.toFixed(0)}%`}
              />
              <TargetingSummaryCard
                label="Missing age"
                value={`${hub.targeting.summary.missingAgePct.toFixed(0)}%`}
              />
            </div>
            <div className="mt-8 grid gap-4 lg:grid-cols-2">
              <ChartPanel title="Users by city" subtitle="All-time profiles">
                {chartJsReady ? (
                  <Bar
                    data={barChartData(hub.targeting.usersByCity.slice(0, 10))}
                    options={hubBarOptions}
                  />
                ) : (
                  <ChartPlaceholder />
                )}
              </ChartPanel>
              <ChartPanel title="Workouts by city" subtitle="All-time finished sessions">
                {chartJsReady && hub.targeting.workoutsByCity.length ? (
                  <Bar data={barChartData(hub.targeting.workoutsByCity.slice(0, 10))} options={hubBarOptions} />
                ) : (
                  <EmptyStatePanel title="No data" body="No workout breakdown yet (check Diagnostics)." />
                )}
              </ChartPanel>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <AnalyticsTable
                title="Users by age group"
                rows={hub.targeting.usersByAgeGroup}
                emptyMessage="Not available yet"
              />
              <AnalyticsTable
                title="Workouts by gender"
                rows={hub.targeting.workoutsByGender}
                emptyMessage="No all-time workout breakdown yet"
              />
            </div>
          </section>
        )}

        <DebugPanel title="Diagnostics (dev)" lines={debugLines} />
      </div>
    </div>
  );
}
