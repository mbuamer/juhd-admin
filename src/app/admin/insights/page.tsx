"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

type Tab = "content" | "revenue" | "gym" | "retention" | "friends" | "routines";

type ContentStats = {
  posts_total: number;
  posts_today: number;
  posts_week: number;
  posts_month: number;
  comments_total: number;
  likes_total: number;
  reposts_total: number;
  posts_by_type: Record<string, number>;
};

type GymStats = {
  checkins_today: number;
  checkins_week: number;
  checkins_month: number;
  top_gyms: { gym_name: string; checkin_count: number }[];
};

type RetentionRow = {
  cohort_week: string;
  signups: number;
  active_week1: number;
  retention_week1_pct: number;
  active_week4: number;
  retention_week4_pct: number;
};

type FriendsStats = {
  total_friendships: number;
  pending_requests: number;
  acceptance_rate_pct: number;
  avg_friends_per_user: number;
};

type RoutineStats = {
  explore_sessions_count: number;
  top_routines: { routine_name: string; use_count: number }[];
};

type ExerciseRow = {
  exercise_id: string;
  exercise_name: string;
  log_count: number;
};

function toInt(val: unknown): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") return parseInt(val, 10) || 0;
  return Number(val) || 0;
}

export default function InsightsPage() {
  const [tab, setTab] = useState<Tab>("content");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [content, setContent] = useState<ContentStats | null>(null);
  const [gym, setGym] = useState<GymStats | null>(null);
  const [retention, setRetention] = useState<RetentionRow[]>([]);
  const [friends, setFriends] = useState<FriendsStats | null>(null);
  const [routines, setRoutines] = useState<RoutineStats | null>(null);
  const [exercises, setExercises] = useState<ExerciseRow[]>([]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const [contentRes, gymRes, retentionRes, friendsRes, routinesRes, exercisesRes] = await Promise.all([
        supabase.rpc("get_admin_content_stats", { p_period: "week" }),
        supabase.rpc("get_admin_gym_checkins_stats"),
        supabase.rpc("get_admin_retention_stats"),
        supabase.rpc("get_admin_friends_stats"),
        supabase.rpc("get_admin_routine_usage_simple"),
        supabase.rpc("get_admin_exercise_popularity", { p_limit: 20 }),
      ]);

      if (contentRes.data && Array.isArray(contentRes.data) && contentRes.data[0]) {
        const r = contentRes.data[0] as Record<string, unknown>;
        setContent({
          posts_total: toInt(r.posts_total),
          posts_today: toInt(r.posts_today),
          posts_week: toInt(r.posts_week),
          posts_month: toInt(r.posts_month),
          comments_total: toInt(r.comments_total),
          likes_total: toInt(r.likes_total),
          reposts_total: toInt(r.reposts_total),
          posts_by_type: (r.posts_by_type as Record<string, number>) ?? {},
        });
      } else setContent(null);

      if (gymRes.data && Array.isArray(gymRes.data) && gymRes.data[0]) {
        const r = gymRes.data[0] as Record<string, unknown>;
        const top = (r.top_gyms as unknown[]) ?? [];
        setGym({
          checkins_today: toInt(r.checkins_today),
          checkins_week: toInt(r.checkins_week),
          checkins_month: toInt(r.checkins_month),
          top_gyms: top.map((g: unknown) => (g as { gym_name: string; checkin_count: number }) ?? {}),
        });
      } else setGym(null);

      setRetention((retentionRes.data as RetentionRow[]) ?? []);
      if (friendsRes.data && Array.isArray(friendsRes.data) && friendsRes.data[0]) {
        const r = friendsRes.data[0] as Record<string, unknown>;
        setFriends({
          total_friendships: toInt(r.total_friendships),
          pending_requests: toInt(r.pending_requests),
          acceptance_rate_pct: Number(r.acceptance_rate_pct) ?? 0,
          avg_friends_per_user: Number(r.avg_friends_per_user) ?? 0,
        });
      } else setFriends(null);

      if (routinesRes.data && Array.isArray(routinesRes.data) && routinesRes.data[0]) {
        const r = routinesRes.data[0] as Record<string, unknown>;
        const top = (r.top_routines as unknown[]) ?? [];
        setRoutines({
          explore_sessions_count: toInt(r.explore_sessions_count),
          top_routines: top.map((t: unknown) => (t as { routine_name: string; use_count: number }) ?? {}),
        });
      } else setRoutines(null);

      setExercises((exercisesRes.data as ExerciseRow[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "content", label: "Content", icon: "📝" },
    { id: "revenue", label: "Revenue", icon: "💰" },
    { id: "gym", label: "Gym Check-ins", icon: "🏋️" },
    { id: "retention", label: "Retention", icon: "📈" },
    { id: "friends", label: "Friends", icon: "👥" },
    { id: "routines", label: "Routines & Exercises", icon: "📋" },
  ];

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Insights & Reports</h1>
        <button onClick={load} className="px-3 py-2 rounded-lg bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-sm">
          Refresh
        </button>
      </div>

      {error && <p className="text-red-600 dark:text-red-400 mb-4 text-sm">{error}</p>}

      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
              tab === t.id ? "bg-red-600 text-white" : "bg-zinc-200 dark:bg-zinc-700"
            }`}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-zinc-500 py-8">Loading…</p>
      ) : (
        <>
          {tab === "content" && (
            <ContentTab data={content} />
          )}
          {tab === "revenue" && (
            <RevenueTab />
          )}
          {tab === "gym" && (
            <GymTab data={gym} />
          )}
          {tab === "retention" && (
            <RetentionTab data={retention} />
          )}
          {tab === "friends" && (
            <FriendsTab data={friends} />
          )}
          {tab === "routines" && (
            <RoutinesTab routines={routines} exercises={exercises} />
          )}
        </>
      )}
    </div>
  );
}

function ContentTab({ data }: { data: ContentStats | null }) {
  if (!data) return <p className="text-zinc-500">No content stats available</p>;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Posts Total" value={data.posts_total} />
        <StatCard title="Posts Today" value={data.posts_today} accent />
        <StatCard title="Posts (7d)" value={data.posts_week} />
        <StatCard title="Posts (30d)" value={data.posts_month} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <StatCard title="Comments" value={data.comments_total} />
        <StatCard title="Likes" value={data.likes_total} />
        <StatCard title="Reposts" value={data.reposts_total} />
      </div>
      {Object.keys(data.posts_by_type).length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-2">Posts by type</h3>
          <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
            {Object.entries(data.posts_by_type).map(([type, count]) => (
              <div key={type} className="flex justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-700 last:border-0">
                <span className="capitalize">{type}</span>
                <span className="font-semibold">{count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RevenueTab() {
  return (
    <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-8">
      <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">Revenue (Coming Soon)</h3>
      <p className="text-zinc-600 dark:text-zinc-400 mb-4">
        Revenue metrics (MRR, ARR, new conversions, churn) require integration with RevenueCat or App Store Server Notifications.
      </p>
      <ul className="list-disc list-inside text-sm text-zinc-500 space-y-1">
        <li>Connect RevenueCat webhooks to track subscriptions</li>
        <li>Or use App Store Connect webhooks for direct purchases</li>
        <li>Store conversion events in a revenue_events table</li>
      </ul>
    </div>
  );
}

function GymTab({ data }: { data: GymStats | null }) {
  if (!data) return <p className="text-zinc-500">No gym check-in stats available</p>;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatCard title="Check-ins Today" value={data.checkins_today} accent />
        <StatCard title="Check-ins (7d)" value={data.checkins_week} />
        <StatCard title="Check-ins (30d)" value={data.checkins_month} />
      </div>
      {data.top_gyms && data.top_gyms.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-2">Top gyms (30d)</h3>
          <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
            {data.top_gyms.map((g, i) => (
              <div key={i} className="flex justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-700 last:border-0">
                <span>{g.gym_name ?? "Unknown"}</span>
                <span className="font-semibold">{Number(g.checkin_count ?? 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RetentionTab({ data }: { data: RetentionRow[] }) {
  if (!data || data.length === 0) return <p className="text-zinc-500">No retention data available</p>;
  return (
    <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 dark:border-zinc-700">
            <th className="text-left px-4 py-3">Cohort</th>
            <th className="text-right px-4 py-3">Signups</th>
            <th className="text-right px-4 py-3">W1 Active</th>
            <th className="text-right px-4 py-3">W1 %</th>
            <th className="text-right px-4 py-3">W4 Active</th>
            <th className="text-right px-4 py-3">W4 %</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.cohort_week} className="border-b border-zinc-100 dark:border-zinc-700 last:border-0">
              <td className="px-4 py-3">{row.cohort_week}</td>
              <td className="text-right px-4 py-3">{row.signups}</td>
              <td className="text-right px-4 py-3">{row.active_week1}</td>
              <td className="text-right px-4 py-3">{row.retention_week1_pct}%</td>
              <td className="text-right px-4 py-3">{row.active_week4}</td>
              <td className="text-right px-4 py-3">{row.retention_week4_pct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FriendsTab({ data }: { data: FriendsStats | null }) {
  if (!data) return <p className="text-zinc-500">No friends stats available</p>;
  const rate = Number.isFinite(data.acceptance_rate_pct) ? data.acceptance_rate_pct : 0;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard title="Total Friendships" value={data.total_friendships} />
      <StatCard title="Pending Requests" value={data.pending_requests} accent />
      <StatCard title="Acceptance Rate" value={`${rate}%`} />
      <StatCard title="Avg Friends/User" value={data.avg_friends_per_user} />
    </div>
  );
}

function RoutinesTab({ routines, exercises }: { routines: RoutineStats | null; exercises: ExerciseRow[] }) {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-2">Explore routine sessions</h3>
        <StatCard title="Sessions using explore routines" value={routines?.explore_sessions_count ?? 0} />
      </div>
      {routines?.top_routines && routines.top_routines.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-2">Top routines</h3>
          <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
            {routines.top_routines.map((r, i) => (
              <div key={i} className="flex justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-700 last:border-0">
                <span>{r.routine_name ?? "Unknown"}</span>
                <span className="font-semibold">{Number(r.use_count ?? 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div>
        <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-2">Most logged exercises</h3>
        <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
          {exercises.length === 0 ? (
            <p className="px-4 py-8 text-zinc-500 text-center">No data</p>
          ) : (
            exercises.map((e) => (
              <div key={e.exercise_id} className="flex justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-700 last:border-0">
                <span>{e.exercise_name}</span>
                <span className="font-semibold">{e.log_count.toLocaleString()}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, accent }: { title: string; value: number | string; accent?: boolean }) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        accent ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50" : "bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700"
      }`}
    >
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{title}</p>
      <p className={`text-2xl font-bold mt-1 ${accent ? "text-red-700 dark:text-red-400" : "text-zinc-900 dark:text-white"}`}>
        {value}
      </p>
    </div>
  );
}
