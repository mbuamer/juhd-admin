"use client";

import type { ReactNode } from "react";
import { HoverTip } from "./growth-components";

export const GA_ACCENT = "#FF3B30";
export const GA_MUTED = "rgb(161 161 170)";
export const GA_SURFACE = "rgba(24, 24, 27, 0.65)";
export const GA_BORDER = "rgba(63, 63, 70, 0.55)";

export type MetricStatus = "healthy" | "watch" | "weak" | "strong" | "neutral" | "off";

const STATUS_DOT: Record<MetricStatus, string> = {
  healthy: "bg-emerald-500",
  strong: "bg-emerald-400",
  watch: "bg-amber-400",
  weak: "bg-red-500/80",
  neutral: "bg-zinc-600",
  off: "bg-zinc-700",
};

const STATUS_LABEL: Partial<Record<MetricStatus, string>> = {
  healthy: "Healthy",
  strong: "Strong",
  watch: "Watch",
  weak: "Weak",
  off: "Not connected",
};

export function DeltaLine({ delta, trend }: { delta?: string | null; trend?: "up" | "down" | "flat" }) {
  const text = delta ?? "No comparison yet";
  const arrow = trend === "up" ? "↑ " : trend === "down" ? "↓ " : trend === "flat" ? "→ " : "";
  return (
    <p className="mt-1 text-[11px] leading-snug text-zinc-500">
      {arrow}
      {text}
    </p>
  );
}

export function SectionHeader({
  title,
  hint,
  kicker,
}: {
  title: string;
  hint?: string;
  kicker?: string;
}) {
  const head = (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.06] pb-5">
      <div>
        {kicker && (
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">{kicker}</p>
        )}
        <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">{title}</h2>
      </div>
    </div>
  );
  if (hint) return <HoverTip text={hint}>{head}</HoverTip>;
  return head;
}

export function CompactMetricPill({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}) {
  const v = typeof value === "number" ? value.toLocaleString() : value;
  return (
      <MetricPillInner kicker={label} title={v} accent={accent} sub={sub} />
  );
}

function MetricPillInner({
  kicker,
  title,
  accent,
  sub,
}: {
  kicker: string;
  title: string;
  accent?: boolean;
  sub?: string;
}) {
  return (
    <div
      className={`inline-flex min-w-[4.5rem] flex-col rounded-lg border px-3 py-1.5 transition-colors ${
        accent
          ? "border-red-500/25 bg-red-950/15 hover:border-red-500/40"
          : "border-white/[0.06] bg-white/[0.025] hover:border-white/[0.12] hover:bg-white/[0.04]"
      }`}
    >
      <span className="text-[9px] font-medium uppercase tracking-wider text-zinc-500">{kicker}</span>
      <span className={`truncate text-sm font-semibold tabular-nums leading-tight ${accent ? "text-red-400" : "text-white"}`}>
        {title}
      </span>
      {sub && <span className="truncate text-[9px] capitalize text-zinc-500">{sub}</span>}
    </div>
  );
}

export function StickyCommandBar({ children }: { children: ReactNode }) {
  return (
    <div
      className="sticky top-0 z-50 -mx-4 border-b border-white/[0.06] bg-[#0a0a0b]/92 px-4 py-2 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
      role="region"
      aria-label="Daily command metrics"
    >
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function StatusDot({ status }: { status: MetricStatus }) {
  return (
    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[status]}`} title={STATUS_LABEL[status] ?? status} />
  );
}

export function HeroMetricCard({
  title,
  totalUsers,
  signupsLabel,
  signupsValue,
  dau,
  wau,
  mau,
  chart,
  footnote,
}: {
  title: string;
  totalUsers: number;
  signupsLabel: string;
  signupsValue: number;
  dau: number;
  wau: number;
  mau: number;
  chart: ReactNode;
  footnote?: string;
}) {
  return (
    <div className="relative flex h-full min-h-[22rem] flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-zinc-900/70 to-zinc-950/95 shadow-[inset_3px_0_0_0_rgba(255,59,48,0.55)]">
      <div className="border-b border-white/[0.06] px-6 py-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">{title}</p>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-3">
          <div>
            <p className="text-[11px] text-zinc-500">Total users</p>
            <p className="text-4xl font-semibold tracking-tight text-white tabular-nums sm:text-[2.75rem]">
              {totalUsers.toLocaleString()}
            </p>
          </div>
          <div className="hidden h-10 w-px bg-white/10 sm:block" aria-hidden />
          <div>
            <p className="text-[11px] text-zinc-500">{signupsLabel}</p>
            <p className="text-2xl font-semibold tabular-nums text-white">{signupsValue.toLocaleString()}</p>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 sm:border-l sm:border-white/[0.08] sm:pl-5">
            {(
              [
                ["DAU", dau],
                ["WAU", wau],
                ["MAU", mau],
              ] as const
            ).map(([k, n]) => (
              <span key={k} className="text-sm text-zinc-500">
                {k} <span className="font-semibold text-white tabular-nums">{n.toLocaleString()}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="min-h-[12rem] flex-1 px-4 pb-4 pt-2 sm:px-6">{chart}</div>
      {footnote && (
        <p className="border-t border-white/[0.05] px-6 py-2 text-[10px] leading-relaxed text-zinc-500">{footnote}</p>
      )}
    </div>
  );
}

export const HeroGrowthCard = HeroMetricCard;

export function SupportStatCard({
  label,
  value,
  hint,
  sub,
  delta,
  status,
}: {
  label: string;
  value: string | number;
  hint?: string;
  sub?: string;
  delta?: string | null;
  status?: MetricStatus;
}) {
  const v = typeof value === "number" ? value.toLocaleString() : value;
  const inner = (
    <div className="group flex flex-col justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5 transition-colors hover:border-white/[0.12] hover:bg-white/[0.045]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
        {status && <StatusDot status={status} />}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-white">{v}</p>
      {sub && <p className="mt-0.5 text-[10px] text-zinc-500">{sub}</p>}
      <DeltaLine delta={delta} />
      {status && STATUS_LABEL[status] && (
        <p className="mt-1 text-[10px] font-medium text-zinc-600">{STATUS_LABEL[status]}</p>
      )}
    </div>
  );
  if (hint) return <HoverTip text={hint}>{inner}</HoverTip>;
  return inner;
}

export function InsightCard({
  headline,
  label,
  delta,
  status,
}: {
  headline: string;
  label: string;
  delta?: string | null;
  status?: "healthy" | "watch" | "neutral";
}) {
  const ring =
    status === "healthy"
      ? "ring-1 ring-emerald-500/25"
      : status === "watch"
        ? "ring-1 ring-amber-500/25"
        : "";
  return (
    <div
      className={`flex min-h-[6.5rem] flex-col justify-between rounded-xl border border-white/[0.06] bg-zinc-950/55 p-5 transition-colors hover:border-white/[0.1] ${ring}`}
    >
      <div>
        <p className="text-xl font-semibold tracking-tight text-white sm:text-2xl">{headline}</p>
        <p className="mt-1.5 text-xs text-zinc-500">{label}</p>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <DeltaLine delta={delta} />
        {status && STATUS_LABEL[status] && (
          <span className="shrink-0 text-[10px] font-medium text-zinc-600">{STATUS_LABEL[status]}</span>
        )}
      </div>
    </div>
  );
}

export const DailyPulseCard = InsightCard;

export function CommunityHeroCard({
  score,
  subtitle,
}: {
  score: number | null;
  subtitle: string;
}) {
  return (
    <div className="relative flex min-h-[12rem] flex-col justify-end overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-zinc-900/85 via-zinc-950 to-black p-6">
      <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-red-600/[0.12] blur-3xl" />
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Community health</p>
      <p className="mt-2 text-5xl font-semibold tabular-nums tracking-tight text-white">{score != null ? score : "—"}</p>
      <p className="mt-2 max-w-sm text-xs leading-relaxed text-zinc-500">{subtitle}</p>
    </div>
  );
}

export function EmptyStatePanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-700/50 bg-zinc-950/35 px-5 py-7 text-center">
      <p className="text-sm font-medium text-zinc-300">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-zinc-500">{body}</p>
    </div>
  );
}

export function ChartPanel({
  title,
  subtitle,
  children,
  onExpand,
  tall,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onExpand?: () => void;
  tall?: boolean;
}) {
  const h = tall ? "min-h-[22rem] h-[22rem] sm:h-[26rem]" : "min-h-[18rem] h-[18rem] sm:h-[22rem]";
  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/[0.06] bg-zinc-950/35 p-5 transition-colors hover:border-white/[0.09] sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-white">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[11px] text-zinc-500">{subtitle}</p>}
        </div>
        {onExpand && (
          <button
            type="button"
            onClick={onExpand}
            className="shrink-0 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-zinc-300 transition-colors hover:border-red-500/30 hover:text-white"
          >
            Expand
          </button>
        )}
      </div>
      <div className={`relative flex-1 ${h}`}>{children}</div>
    </div>
  );
}

export const ChartShell = ChartPanel;

export function FunnelStep({
  label,
  value,
  state,
}: {
  label: string;
  value: string;
  state: "ok" | "pending" | "off";
}) {
  const tone =
    state === "ok"
      ? "border-white/[0.08] bg-white/[0.03]"
      : state === "pending"
        ? "border-amber-500/20 bg-amber-950/10"
        : "border-white/[0.05] bg-zinc-950/40";
  return (
    <div className={`min-w-[6.5rem] flex-1 rounded-xl border px-3 py-3 text-center transition-colors hover:border-white/[0.12] ${tone}`}>
      <p className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-xs font-medium leading-snug text-zinc-200">{value}</p>
      {state === "off" && <p className="mt-1 text-[9px] text-zinc-600">Not connected</p>}
    </div>
  );
}

export function AllTimeHeroCard({
  label,
  value,
  subtitle = "All-time · since launch",
}: {
  label: string;
  value: string | number;
  subtitle?: string;
}) {
  const v = typeof value === "number" ? value.toLocaleString() : value;
  return (
    <div className="relative flex min-h-[11rem] flex-col justify-end overflow-hidden rounded-2xl border border-white/[0.1] bg-gradient-to-br from-zinc-900/90 via-zinc-950 to-black p-6 sm:p-8 shadow-[inset_3px_0_0_0_rgba(255,59,48,0.5)]">
      <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-red-600/[0.08] blur-3xl" />
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">{label}</p>
      <p className="mt-3 text-5xl font-semibold tabular-nums tracking-tight text-white sm:text-6xl">{v}</p>
      <p className="mt-2 text-xs text-zinc-500">{subtitle}</p>
    </div>
  );
}

export function AllTimeStatCard({
  label,
  value,
  subtitle = "All-time",
}: {
  label: string;
  value: string | number;
  subtitle?: string;
}) {
  const v = typeof value === "number" ? value.toLocaleString() : value;
  return (
    <div className="flex min-h-[7.5rem] flex-col justify-between rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-5 transition-colors hover:border-white/[0.14] hover:bg-white/[0.05]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight text-white sm:text-4xl">{v}</p>
      <p className="mt-2 text-[11px] text-zinc-500">{subtitle}</p>
    </div>
  );
}

export function TargetingSummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  const inner = (
    <div className="flex min-h-[5.5rem] flex-col justify-between rounded-xl border border-white/[0.06] bg-zinc-950/55 px-4 py-4">
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-base font-semibold leading-snug text-white sm:text-lg">{value}</p>
    </div>
  );
  if (hint) return <HoverTip text={hint}>{inner}</HoverTip>;
  return inner;
}

export function PeriodAnalyticsPanel({
  period,
  onPeriodChange,
  dataSource,
  loading,
  children,
}: {
  period: 1 | 7 | 30;
  onPeriodChange: (p: 1 | 7 | 30) => void;
  dataSource?: string;
  loading?: boolean;
  children: ReactNode;
}) {
  const tabs = [
    { d: 1 as const, label: "1 Day" },
    { d: 7 as const, label: "7 Days" },
    { d: 30 as const, label: "30 Days" },
  ];
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-zinc-950/30 p-5 sm:p-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.06] pb-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Windowed</p>
          <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">Period analytics</h2>
          <p className="mt-1 text-xs text-zinc-500">Metrics and charts for the selected range only.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {dataSource && (
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
              {dataSource}
            </span>
          )}
          <div className="inline-flex gap-1 rounded-xl border border-white/[0.08] bg-black/40 p-1">
            {tabs.map(({ d, label }) => (
              <button
                key={d}
                type="button"
                onClick={() => onPeriodChange(d)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  period === d ? "bg-red-600 text-white shadow-sm" : "text-zinc-400 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {loading ? (
        <div className="flex min-h-[12rem] items-center justify-center text-sm text-zinc-500">Updating period…</div>
      ) : (
        children
      )}
    </section>
  );
}

export function DebugPanel({ title, lines }: { title: string; lines: string[] }) {
  if (!lines.length) return null;
  return (
    <details className="mt-12 rounded-xl border border-white/[0.05] bg-black/50 p-4 text-left">
      <summary className="cursor-pointer text-xs font-medium text-zinc-500">{title}</summary>
      <ul className="mt-3 space-y-1 font-mono text-[10px] leading-relaxed text-zinc-600">
        {lines.map((l, i) => (
          <li key={`${i}-${l.slice(0, 48)}`}>{l}</li>
        ))}
      </ul>
    </details>
  );
}
