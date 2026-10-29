"use client";

import { useEffect, useState } from "react";
import { fetchGrowthDashboard } from "@/lib/growth-dashboard";
import { createClient } from "@/lib/supabase";

type EventRow = { event_name: string; event_count: number };

const AUTH_EVENTS = ["sign_up", "login", "session_lifecycle"];
const CONTENT_EVENTS = ["post_created", "comment_created", "like_action", "friend_action", "message_sent"];
const WORKOUT_EVENTS = ["workout_session", "screen_view"];

function groupEvents(events: EventRow[]): { category: string; events: EventRow[] }[] {
  const groups: { category: string; events: EventRow[] }[] = [];
  let remaining = [...events];

  for (const [category, names] of [
    ["Auth", AUTH_EVENTS],
    ["Content", CONTENT_EVENTS],
    ["Workout", WORKOUT_EVENTS],
  ] as [string, string[]][]) {
    const matched = remaining.filter((e) => names.includes(e.event_name));
    remaining = remaining.filter((e) => !names.includes(e.event_name));
    if (matched.length > 0) {
      groups.push({ category, events: matched.sort((a, b) => b.event_count - a.event_count) });
    }
  }
  if (remaining.length > 0) {
    groups.push({ category: "Other", events: remaining.sort((a, b) => b.event_count - a.event_count) });
  }
  return groups;
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<7 | 30>(30);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [signupsToday, setSignupsToday] = useState<number | null>(null);
  const [signups7d, setSignups7d] = useState<number | null>(null);
  const [signups30d, setSignups30d] = useState<number | null>(null);
  const [premiumCount, setPremiumCount] = useState<number | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - period);

      const [all, today, week, month, eventsRes] = await Promise.all([
        fetchGrowthDashboard(supabase,"all"), fetchGrowthDashboard(supabase,1),
        fetchGrowthDashboard(supabase,7), fetchGrowthDashboard(supabase,30),
        supabase.rpc("get_event_counts", {p_start_date:start.toISOString(),p_end_date:end.toISOString()}),
      ]);
      setUserCount(all.source === "live" ? all.payload.totalUsers : null);
      setSignupsToday(today.source === "live" ? today.payload.newSignUps : null);
      setSignups7d(week.source === "live" ? week.payload.newSignUps : null);
      setSignups30d(month.source === "live" ? month.payload.newSignUps : null);
      setPremiumCount(all.premiumAccounts ?? null);

      if (eventsRes.error) throw eventsRes.error;
      const rows = (eventsRes.data as { event_name: string; event_count: number }[]) ?? [];
      setEvents(rows.map((r) => ({ event_name: r.event_name, event_count: Number(r.event_count) })));
    } catch (e) {
      setEvents([]);
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [period]);

  const eventGroups = groupEvents(events);

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Analytics</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setPeriod(7)}
            className={`px-3 py-1.5 rounded-lg text-sm ${period === 7 ? "bg-red-600 text-white" : "bg-zinc-200 dark:bg-zinc-700"}`}
          >
            7 days
          </button>
          <button
            onClick={() => setPeriod(30)}
            className={`px-3 py-1.5 rounded-lg text-sm ${period === 30 ? "bg-red-600 text-white" : "bg-zinc-200 dark:bg-zinc-700"}`}
          >
            30 days
          </button>
          <button onClick={load} className="px-3 py-1.5 rounded-lg text-sm bg-zinc-200 dark:bg-zinc-700">
            Refresh
          </button>
        </div>
      </div>

      {error && <p className="text-red-600 dark:text-red-400 mb-4 text-sm">{error}</p>}

      {loading ? (
        <p className="text-zinc-500 py-8">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard title="Total Users" value={userCount} />
            <StatCard title="Premium accounts" value={premiumCount} accent />
            <StatCard title="Signups Today" value={signupsToday} />
            <StatCard title={period === 7 ? "Signups (7d)" : "Signups (30d)"} value={period === 7 ? signups7d : signups30d} />
          </div>

          <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200 mb-4">Recorded event rows (not active-user counts)</h2>
          <p className="mb-4 text-sm text-zinc-500">Headline periods use Asia/Riyadh and exclude designated QA accounts. This legacy event diagnostic uses a rolling window and may contain duplicates or QA rows; it is not an engagement report.</p>
          {eventGroups.length === 0 ? (
            <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-12 text-center">
              <p className="text-zinc-500 dark:text-zinc-400">{error ? "Unavailable" : "No events recorded"}</p>
            </div>
          ) : (
            <div className="space-y-6">
              {eventGroups.map((group) => (
                <div key={group.category}>
                  <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase mb-2">{group.category}</p>
                  <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                    {group.events.map((row) => (
                      <div
                        key={row.event_name}
                        className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-700 last:border-0"
                      >
                        <span className="text-zinc-900 dark:text-white">{row.event_name}</span>
                        <span className="font-semibold text-zinc-600 dark:text-zinc-300">{row.event_count.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ title, value, accent }: { title: string; value: number | null; accent?: boolean }) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        accent ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50" : "bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700"
      }`}
    >
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{title}</p>
      <p className={`text-2xl font-bold mt-1 ${accent ? "text-red-700 dark:text-red-400" : "text-zinc-900 dark:text-white"}`}>
        {value ?? "Unavailable"}
      </p>
    </div>
  );
}
