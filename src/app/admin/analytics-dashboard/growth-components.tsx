import Link from "next/link";
import type { ReactNode } from "react";
import type { TimePeriod } from "@/lib/analytics-dashboard-mock";
import type { GrowthDataSource } from "@/lib/growth-dashboard";

/** Hover explanation; uses native title as fallback for accessibility. */
export function HoverTip({ text, children, className }: { text: string; children: ReactNode; className?: string }) {
  return (
    <span
      className={`group/tt relative inline-flex max-w-full cursor-help ${className ?? ""}`}
      title={text}
    >
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 hidden w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-left text-xs font-normal leading-relaxed text-zinc-300 shadow-xl ring-1 ring-black/40 group-hover/tt:block"
      >
        {text}
      </span>
    </span>
  );
}

export function StatCard({
  label,
  value,
  sub,
  highlight,
  description,
}: {
  label: string;
  value: number;
  sub?: string;
  highlight?: boolean;
  /** What this number measures; shown on hover */
  description?: string;
}) {
  const cardClass = `rounded-2xl border p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-red-500/25 hover:shadow-lg hover:shadow-red-950/20 ${
    highlight
      ? "border-red-500/30 bg-gradient-to-br from-red-950/30 to-zinc-900/40"
      : "border-zinc-800 bg-zinc-900/50"
  }`;

  const inner = (
    <>
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-white">
        {value.toLocaleString()}
      </p>
      {sub && <p className="mt-1 text-xs text-zinc-500">{sub}</p>}
    </>
  );

  if (description) {
    return (
      <HoverTip text={description}>
        <div className={`${cardClass} h-full`}>{inner}</div>
      </HoverTip>
    );
  }

  return <div className={cardClass}>{inner}</div>;
}

export function MiniStat({
  label,
  value,
  formatRatio,
  text,
  description,
}: {
  label: string;
  value: number | string;
  formatRatio?: boolean;
  text?: boolean;
  description?: string;
}) {
  const display =
    formatRatio && typeof value === "number"
      ? `${(value * 100).toFixed(1)}%`
      : typeof value === "number"
        ? value.toLocaleString()
        : value;
  const body = (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 transition-all duration-200 hover:border-zinc-600 h-full">
      <p className="text-xs text-zinc-500">{label}</p>
      <p
        className={`mt-1 truncate font-medium text-white ${text ? "text-sm" : "text-lg tabular-nums"}`}
        title={String(display)}
      >
        {display}
      </p>
    </div>
  );
  if (description) {
    return <HoverTip text={description}>{body}</HoverTip>;
  }
  return body;
}

export function ChartPanel({
  title,
  subtitle,
  children,
  description,
  onExpand,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** What the chart shows and how to read it */
  description?: string;
  /** Opens full-size chart */
  onExpand?: () => void;
}) {
  return (
    <div className="group/panel overflow-visible rounded-2xl border border-zinc-800/80 bg-zinc-900/35 p-5 transition-all duration-200 hover:border-zinc-700">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {description ? (
            <HoverTip text={description}>
              <h3 className="text-sm font-semibold text-white">{title}</h3>
            </HoverTip>
          ) : (
            <h3 className="text-sm font-semibold text-white">{title}</h3>
          )}
          {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
        </div>
        {onExpand && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onExpand();
            }}
            className="shrink-0 rounded-lg border border-zinc-700 bg-zinc-950/80 px-2.5 py-1 text-xs font-medium text-zinc-300 transition-colors hover:border-red-500/40 hover:bg-zinc-900 hover:text-white"
            aria-label={`Expand chart: ${title}`}
          >
            Expand
          </button>
        )}
      </div>
      <div
        className={`relative ${onExpand ? "cursor-zoom-in" : ""}`}
        onClick={onExpand}
        onKeyDown={(e) => {
          if (onExpand && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onExpand();
          }
        }}
        role={onExpand ? "button" : undefined}
        tabIndex={onExpand ? 0 : undefined}
      >
        {children}
        {onExpand && (
          <p className="pointer-events-none mt-2 text-center text-[10px] uppercase tracking-wider text-zinc-600 opacity-0 transition-opacity group-hover/panel:opacity-100">
            Click to expand · or use Expand
          </p>
        )}
      </div>
    </div>
  );
}

export function GrowthPageChrome({
  period,
  onPeriodChange,
  dataSource,
  fetchNote,
  onExportCsv,
}: {
  period: TimePeriod;
  onPeriodChange: (p: TimePeriod) => void;
  dataSource?: GrowthDataSource;
  fetchNote?: string;
  onExportCsv?: () => void;
}) {
  const badge =
    dataSource === "live"
      ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-300"
      : dataSource === "hybrid"
        ? "border-amber-500/40 bg-amber-950/35 text-amber-200"
        : dataSource === "empty"
          ? "border-rose-500/40 bg-rose-950/35 text-rose-200"
          : "border-zinc-600 bg-zinc-900/80 text-zinc-400";

  const badgeLabel =
    dataSource === "live"
      ? "Live (get_growth_dashboard)"
      : dataSource === "hybrid"
        ? "Hybrid (admin RPCs + real KPIs)"
        : dataSource === "empty"
          ? "No growth payload"
          : "Demo mock (env flag)";

  return (
    <header className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium uppercase tracking-widest text-red-500">Growth</p>
          {dataSource && (
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badge}`}
            >
              {badgeLabel}
            </span>
          )}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Growth command center</h1>
        <p className="mt-1.5 text-sm text-zinc-500">
          Daily pulse, trends, and health for {period === 1 ? "the last 24 hours" : period === "all" ? "all time" : `the last ${period} days`}.
        </p>
        {fetchNote && <p className="mt-1 max-w-xl text-xs text-zinc-500">{fetchNote}</p>}
      </div>
      <div className="flex flex-col items-stretch gap-3 sm:items-end">
        <div className="inline-flex flex-wrap justify-end gap-1 rounded-xl border border-zinc-800 bg-zinc-900/80 p-1 shadow-sm">
          {([1, 7, 30, "all"] as const).map((d) => (
            <HoverTip
              key={String(d)}
              className="inline-flex flex-1"
              text={
                d === 1
                  ? "Last 24 hours from UTC midnight, hourly-style buckets."
                  : d === 7
                    ? "Last 7 UTC calendar days, one bucket per day."
                    : d === 30
                      ? "Last 30 UTC calendar days, ~12 buckets."
                      : "Since 1970 UTC: cumulative totals and 12 wide buckets on live SQL (same as 30d chart layout)."
              }
            >
              <button
                type="button"
                onClick={() => onPeriodChange(d)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 sm:px-4 ${
                  period === d
                    ? "bg-red-600 text-white shadow-md shadow-red-950/40"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {d === 1 ? "1 Day" : d === 7 ? "7 Days" : d === 30 ? "30 Days" : "All time"}
              </button>
            </HoverTip>
          ))}
        </div>
        {onExportCsv && (
          <button
            type="button"
            onClick={onExportCsv}
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm font-medium text-zinc-200 transition-colors hover:border-red-500/35 hover:text-white"
          >
            Export full CSV
          </button>
        )}
        <HoverTip text="Returns to the main admin operations dashboard (alerts, quick links, etc.). This Growth view is separate on purpose.">
          <Link
            href="/admin/dashboard"
            className="inline-block cursor-help text-center text-sm text-zinc-500 transition-colors hover:text-red-400"
          >
            ← Back to operations dashboard
          </Link>
        </HoverTip>
      </div>
    </header>
  );
}
