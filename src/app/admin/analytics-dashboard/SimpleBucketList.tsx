"use client";

import type { LabeledCount } from "@/lib/analytics-dashboard-mock";

/** Horizontal bar rows — easier to read than line/area charts. */
export function SimpleBucketList({
  rows,
  additive = true,
  color = "#FF3B30",
  emptyMessage = "No data in this period.",
}: {
  rows: LabeledCount[];
  additive?: boolean;
  color?: string;
  emptyMessage?: string;
}) {
  const filtered = rows.filter((r) => r.value > 0);
  const totalAll = rows.reduce((s, r) => s + r.value, 0);
  if (!filtered.length) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        {totalAll > 0 ? "No positive buckets to display." : emptyMessage}
      </p>
    );
  }

  const max = Math.max(...filtered.map((r) => r.value), 1);
  const total = filtered.reduce((s, r) => s + r.value, 0);

  return (
    <div className="max-h-[22rem] overflow-y-auto pr-1">
      <p className="mb-3 text-xs text-zinc-500">
        {additive ? <>Total in chart: <span className="font-medium text-zinc-300">{total.toLocaleString()}</span></> : "Unique users per bucket · users can appear in several buckets"}
      </p>
      <ul className="space-y-2.5">
        {filtered.map((r) => {
          const pct = Math.round((r.value / max) * 100);
          return (
            <li
              key={r.label}
              className="grid grid-cols-[minmax(3.5rem,5rem)_1fr_2.75rem] items-center gap-2 text-sm"
            >
              <span className="truncate text-zinc-400" title={r.label}>
                {r.label}
              </span>
              <div className="h-2.5 overflow-hidden rounded-full bg-zinc-800/90">
                <div
                  className="h-full rounded-full transition-[width]"
                  style={{ width: `${Math.max(pct, r.value > 0 ? 4 : 0)}%`, backgroundColor: color }}
                />
              </div>
              <span className="text-right font-medium tabular-nums text-white">{r.value.toLocaleString()}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
