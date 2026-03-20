"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

type DashboardStats = {
  userCount: number | null;
  signupsToday: number | null;
  signups7d: number | null;
  premiumCount: number | null;
  premiumUpgradesToday: number | null;
  workoutsToday: number | null;
  pendingPostReports: number;
  pendingMessageReports: number;
  pendingBugReports: number;
  unresolvedErrors: number;
};

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats>({
    userCount: null,
    signupsToday: null,
    signups7d: null,
    premiumCount: null,
    premiumUpgradesToday: null,
    workoutsToday: null,
    pendingPostReports: 0,
    pendingMessageReports: 0,
    pendingBugReports: 0,
    unresolvedErrors: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      router.replace("/admin/login");
      return;
    }

    const { data: userData } = await supabase
      .from("users")
      .select("role")
      .eq("id", session.user.id)
      .single();

    if (userData?.role?.toLowerCase() !== "admin") {
      router.replace("/admin/login");
      return;
    }

    setError("");
    try {
      const [
        usersRes,
        signupsRes,
        signups7Res,
        premiumRes,
        premiumTodayRes,
        workoutsRes,
        pendingRes,
        bugsRes,
        errorsRes,
      ] = await Promise.all([
        supabase.rpc("get_admin_user_count"),
        supabase.rpc("get_admin_signups_today"),
        supabase.rpc("get_admin_signups_last_n_days", { p_days: 7 }),
        supabase.rpc("get_admin_premium_count"),
        supabase.rpc("get_admin_premium_upgrades_today"),
        supabase.rpc("get_admin_workouts_today"),
        supabase.rpc("get_admin_pending_reports_count"),
        supabase.rpc("get_admin_pending_bug_reports_count"),
        supabase.rpc("get_admin_unresolved_errors_count"),
      ]);

      if (usersRes.error) setError(usersRes.error.message);

      const pendingRows = pendingRes.data as { post_count?: number; message_count?: number }[] | null;
      const pendingRow = Array.isArray(pendingRows) ? pendingRows[0] : null;

      setStats({
        userCount: toInt(usersRes.data),
        signupsToday: signupsRes.error ? null : toInt(signupsRes.data),
        signups7d: signups7Res.error ? null : toInt(signups7Res.data),
        premiumCount: premiumRes.error ? null : toInt(premiumRes.data),
        premiumUpgradesToday: premiumTodayRes.error ? null : toInt(premiumTodayRes.data),
        workoutsToday: workoutsRes.error ? null : toInt(workoutsRes.data),
        pendingPostReports: toInt(pendingRow?.post_count),
        pendingMessageReports: toInt(pendingRow?.message_count),
        pendingBugReports: bugsRes.error ? 0 : toInt(bugsRes.data),
        unresolvedErrors: errorsRes.error ? 0 : toInt(errorsRes.data),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [router]);

  function toInt(val: unknown): number {
    if (typeof val === "number") return val;
    if (typeof val === "string") return parseInt(val, 10) || 0;
    return Number(val) || 0;
  }

  const hasAlerts =
    stats.pendingPostReports > 0 ||
    stats.pendingMessageReports > 0 ||
    stats.pendingBugReports > 0 ||
    stats.unresolvedErrors > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-zinc-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
          Dashboard
        </h1>
        <button
          onClick={() => {
            setLoading(true);
            load().finally(() => setLoading(false));
          }}
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          Refresh
        </button>
      </div>

      {error && (
        <p className="text-red-600 dark:text-red-400 mb-4 text-sm">{error}</p>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        <StatCard title="Total Users" value={stats.userCount} icon="👥" />
        <StatCard title="Signups Today" value={stats.signupsToday} icon="📈" accent />
        <StatCard title="Signups (7d)" value={stats.signups7d} icon="📊" />
        <StatCard title="Premium" value={stats.premiumCount} icon="⭐" accent />
        <StatCard title="New Premium Today" value={stats.premiumUpgradesToday} icon="✨" accent />
        <StatCard title="Workouts Today" value={stats.workoutsToday} icon="🏋️" />
      </div>

      {/* Alerts */}
      {hasAlerts && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200 mb-4">
            Attention
          </h2>
          <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 divide-y divide-zinc-200 dark:divide-zinc-700 overflow-hidden">
            {(stats.pendingPostReports > 0 || stats.pendingMessageReports > 0) && (
              <AlertRow
                title="Reports"
                count={stats.pendingPostReports + stats.pendingMessageReports}
                subtitle={`${stats.pendingPostReports} post, ${stats.pendingMessageReports} message`}
                href="/admin/reports"
              />
            )}
            {stats.pendingBugReports > 0 && (
              <AlertRow
                title="Bug Reports"
                count={stats.pendingBugReports}
                subtitle="Pending"
                href="/admin/bug-reports"
              />
            )}
            {stats.unresolvedErrors > 0 && (
              <AlertRow
                title="Error Logs"
                count={stats.unresolvedErrors}
                subtitle="Unresolved"
                href="/admin/error-logs"
              />
            )}
          </div>
        </section>
      )}

      {/* Quick links */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200 mb-4">
          Quick Actions
        </h2>
        <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
          <QuickLink icon="📢" title="Broadcast Notifications" href="/admin/notifications" />
          <QuickLink icon="👥" title="User Management" href="/admin/users" />
          <QuickLink icon="📋" title="Insights" href="/admin/insights" />
          <QuickLink icon="📊" title="Analytics" href="/admin/analytics" />
          <QuickLink icon="🐛" title="Bug Reports" href="/admin/bug-reports" />
          <QuickLink icon="⚠️" title="Error Logs" href="/admin/error-logs" />
        </div>
      </section>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  accent,
}: {
  title: string;
  value: number | null;
  icon: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 shadow-sm ${
        accent
          ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50"
          : "bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-2xl">{icon}</span>
        <span
          className={`text-2xl font-bold ${
            accent ? "text-red-700 dark:text-red-400" : "text-zinc-900 dark:text-white"
          }`}
        >
          {value ?? "—"}
        </span>
      </div>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{title}</p>
    </div>
  );
}

function AlertRow({
  title,
  count,
  subtitle,
  href,
}: {
  title: string;
  count: number;
  subtitle: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors"
    >
      <div>
        <p className="font-medium text-zinc-900 dark:text-white">{title}</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-lg font-bold text-red-600 dark:text-red-400">{count}</span>
        <span className="text-zinc-400">→</span>
      </div>
    </Link>
  );
}

function QuickLink({ icon, title, href }: { icon: string; title: string; href: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors border-b border-zinc-200 dark:border-zinc-700 last:border-0"
    >
      <span className="text-xl">{icon}</span>
      <span className="font-medium text-zinc-900 dark:text-white">{title}</span>
      <span className="ml-auto text-zinc-400">→</span>
    </Link>
  );
}
