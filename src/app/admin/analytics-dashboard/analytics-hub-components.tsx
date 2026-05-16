"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { HubTabId } from "@/lib/analytics-hub-data";
import type { HubWindowDays } from "@/lib/analytics-hub-rpc";
import type { LabeledCount } from "@/lib/analytics-dashboard-mock";
import { chartSeriesToCsv, downloadTextFile } from "@/lib/growth-dashboard";
import { SectionHeader, EmptyStatePanel, ChartPanel } from "./growth-analytics-cards";

const TABS: { id: HubTabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "period", label: "Period Summary" },
  { id: "tables", label: "Tables" },
  { id: "alltime", label: "All-Time" },
  { id: "ratios", label: "Ratios" },
  { id: "targeting", label: "Targeting" },
];

const card =
  "rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-4 transition-colors hover:border-white/[0.1] hover:bg-white/[0.035]";

function HubCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`${card} ${className}`}>{children}</div>;
}

export function AnalyticsTabs({
  active,
  onChange,
}: {
  active: HubTabId;
  onChange: (t: HubTabId) => void;
}) {
  return (
    <nav
      className="flex flex-wrap gap-1 rounded-xl border border-white/[0.08] bg-black/40 p-1"
      aria-label="Analytics views"
    >
      {TABS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:px-4 ${
            active === id
              ? "bg-red-600 text-white shadow-sm"
              : "text-zinc-400 hover:bg-white/[0.04] hover:text-white"
          }`}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}

export function MetricCard({
  label,
  value,
  sub,
  className = "",
}: {
  label: string;
  value: string;
  sub?: string;
  className?: string;
}) {
  return (
    <HubCard className={className}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-white sm:text-3xl">{value}</p>
      {sub && <p className="mt-1 text-[11px] text-zinc-500">{sub}</p>}
    </HubCard>
  );
}

export function HeroMetricCard({
  label,
  value,
  sub = "All-time · since launch",
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <HubCard className="sm:col-span-2 lg:col-span-2 !py-6">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">{label}</p>
      <p className="mt-3 text-5xl font-semibold tabular-nums tracking-tight text-white sm:text-6xl">{value}</p>
      <p className="mt-2 text-xs text-zinc-500">{sub}</p>
    </HubCard>
  );
}

export function RatioCard({ label, value, formula }: { label: string; value: string; formula: string }) {
  return (
    <HubCard>
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-xl font-semibold tabular-nums text-white">{value}</p>
      <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">{formula}</p>
    </HubCard>
  );
}

export function InsightCard({
  headline,
  body,
  lowConfidence,
}: {
  headline: string;
  body: string;
  lowConfidence?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-6 ${
        lowConfidence
          ? "border-amber-500/25 bg-amber-950/15"
          : "border-red-500/20 bg-gradient-to-br from-zinc-900/80 to-zinc-950"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Targeting insight</p>
      <p className="mt-3 text-lg font-semibold leading-snug text-white">{headline}</p>
      <p className="mt-2 text-sm text-zinc-400">{body}</p>
    </div>
  );
}

export function AnalyticsTable({
  title,
  rows,
  emptyMessage,
}: {
  title: string;
  rows: LabeledCount[];
  emptyMessage: string;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => r.label.toLowerCase().includes(needle));
  }, [rows, q]);

  const exportCsv = () => {
    downloadTextFile(
      `juhd-${title.replace(/\s+/g, "-").toLowerCase()}.csv`,
      chartSeriesToCsv(title, rows),
      "text/csv;charset=utf-8"
    );
  };

  return (
    <div className="rounded-xl border border-white/[0.06] bg-zinc-950/40 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            placeholder="Filter…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="rounded-lg border border-white/10 bg-black/50 px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-600"
          />
          <button
            type="button"
            onClick={exportCsv}
            disabled={!rows.length}
            className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 hover:border-red-500/30 disabled:opacity-40"
          >
            CSV
          </button>
        </div>
      </div>
      {filtered.length === 0 ? (
        <EmptyStatePanel title="No rows" body={emptyMessage || "Not available yet"} />
      ) : (
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-zinc-950/95 text-[10px] uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="pb-2 pr-4 font-medium">Label</th>
                <th className="pb-2 text-right font-medium">Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filtered.map((r) => (
                <tr key={r.label} className="text-zinc-300">
                  <td className="py-2 pr-4">{r.label}</td>
                  <td className="py-2 text-right tabular-nums text-white">{r.value.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function PeriodFilterBar({
  period,
  onChange,
  dataSource,
  loading,
  includeAllTime = false,
  hint = "Period filter applies to this view only.",
}: {
  period: HubWindowDays;
  onChange: (p: HubWindowDays) => void;
  dataSource?: string;
  loading?: boolean;
  includeAllTime?: boolean;
  hint?: string;
}) {
  const tabs: { d: HubWindowDays; label: string }[] = includeAllTime
    ? [
        { d: 1, label: "1 Day" },
        { d: 7, label: "7 Days" },
        { d: 30, label: "30 Days" },
        { d: 0, label: "All Time" },
      ]
    : [
        { d: 1, label: "1 Day" },
        { d: 7, label: "7 Days" },
        { d: 30, label: "30 Days" },
      ];
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-zinc-500">{hint}</p>
      <div className="flex flex-wrap items-center gap-2">
        {dataSource && (
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-medium uppercase text-zinc-400">
            {dataSource}
          </span>
        )}
        {loading && <span className="text-[11px] text-zinc-500">Updating…</span>}
        <div className="inline-flex gap-1 rounded-lg border border-white/[0.08] bg-black/40 p-0.5">
          {tabs.map(({ d, label }) => (
            <button
              key={d}
              type="button"
              onClick={() => onChange(d)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                period === d ? "bg-red-600 text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export { SectionHeader, EmptyStatePanel, ChartPanel };
