"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import {
  fetchGrowthAnalyticsPageData,
  fetchGrowthPeriodLayer,
  type GrowthAnalyticsPageBundle,
} from "@/lib/growth-analytics-fetch";
import type { PeriodFilterDays } from "@/lib/growth-analytics-views";
import { buildGrowthAnalyticsViews } from "@/lib/growth-analytics-views";
import { logGrowthDashboardView } from "@/lib/growth-dashboard";
import { AnalyticsHub } from "./AnalyticsHub";
import { registerGrowthCharts } from "./GrowthAnalyticsDashboard";

export default function GrowthAnalyticsPage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [period, setPeriod] = useState<PeriodFilterDays>(7);
  const [bundle, setBundle] = useState<GrowthAnalyticsPageBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  const [chartJsReady, setChartJsReady] = useState(false);
  const hasLoadedOnce = useRef(false);
  const lastPeriodFetched = useRef<PeriodFilterDays | null>(null);

  async function refreshAll() {
    if (!checked) return;
    setRefreshing(true);
    try {
      const supabase = createClient();
      const data = await fetchGrowthAnalyticsPageData(supabase, period);
      setBundle(data);
      lastPeriodFetched.current = period;
      setRefreshCount((c) => c + 1);
      void logGrowthDashboardView(supabase, { period, source: data.growthPeriod.source });
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    registerGrowthCharts();
    setChartJsReady(true);
  }, []);

  useEffect(() => {
    async function gate() {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/admin/login");
        return;
      }
      const { data: userData } = await supabase.from("users").select("role").eq("id", session.user.id).single();
      if (userData?.role?.toLowerCase() !== "admin") {
        router.replace("/admin/login");
        return;
      }
      setChecked(true);
    }
    void gate();
  }, [router]);

  useEffect(() => {
    if (!checked) return;
    let cancelled = false;

    async function load() {
      const isPeriodOnly = hasLoadedOnce.current && lastPeriodFetched.current !== period;
      if (isPeriodOnly) setPeriodLoading(true);
      else setLoading(true);

      try {
        const supabase = createClient();
        if (!hasLoadedOnce.current) {
          const data = await fetchGrowthAnalyticsPageData(supabase, period);
          if (cancelled) return;
          setBundle(data);
          hasLoadedOnce.current = true;
          lastPeriodFetched.current = period;
          void logGrowthDashboardView(supabase, { period, source: data.growthPeriod.source });
        } else {
          const { growthPeriod, hub } = await fetchGrowthPeriodLayer(supabase, period);
          if (cancelled) return;
          setBundle((prev) => {
            if (!prev) return prev;
            const views = buildGrowthAnalyticsViews({
              growthToday: prev.growthToday,
              growthAll: prev.growthAll,
              numeric: prev.numeric,
              ops: prev.ops,
            });
            return { ...prev, growthPeriod, hub, views };
          });
          lastPeriodFetched.current = period;
          void logGrowthDashboardView(supabase, { period, source: growthPeriod.source });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setPeriodLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [checked, period]);

  if (!checked || (!bundle && loading)) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-[#0a0a0b] text-zinc-500">
        Loading…
      </div>
    );
  }

  if (!bundle) return null;

  return (
    <AnalyticsHub
      bundle={bundle}
      period={period}
      onPeriodChange={setPeriod}
      periodLoading={periodLoading}
      refreshing={refreshing}
      onRefresh={refreshAll}
      refreshCount={refreshCount}
      chartJsReady={chartJsReady}
    />
  );
}
