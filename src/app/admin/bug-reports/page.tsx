"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

type BugReport = {
  id: string;
  user_id: string;
  username: string | null;
  description: string;
  screenshot_url: string | null;
  status: string;
  app_version: string | null;
  device_info: string | null;
  created_at: string | null;
};

export default function BugReportsPage() {
  const [reports, setReports] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "reviewed" | "resolved">("all");
  const [selected, setSelected] = useState<BugReport | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const { data, error: err } = await supabase.rpc("get_admin_bug_reports", { p_limit: 100 });
      if (err) throw err;
      setReports((data as BugReport[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = filter === "all" ? reports : reports.filter((r) => r.status === filter);

  async function updateStatus(id: string, status: string) {
    setUpdatingStatus(true);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.from("bug_reports").update({ status }).eq("id", id);
      if (err) throw err;
      await load();
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setUpdatingStatus(false);
    }
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Bug Reports</h1>
        <div className="flex gap-2">
          {(["all", "pending", "reviewed", "resolved"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm capitalize ${filter === f ? "bg-red-600 text-white" : "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400"}`}
            >
              {f}
            </button>
          ))}
          <button onClick={load} className="px-3 py-1.5 rounded-lg text-sm bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600">
            Refresh
          </button>
        </div>
      </div>

      {error && <p className="text-red-600 dark:text-red-400 mb-4 text-sm">{error}</p>}

      {loading ? (
        <p className="text-zinc-500 py-8">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-12 text-center">
          <p className="text-zinc-500 dark:text-zinc-400">No bug reports</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((report) => (
            <div
              key={report.id}
              onClick={() => setSelected(report)}
              className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4 cursor-pointer hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-900 dark:text-white">{report.username ?? report.user_id.slice(0, 8)}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded capitalize ${
                        report.status === "pending"
                          ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                          : report.status === "resolved"
                            ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                            : "bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
                      {report.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2">{report.description}</p>
                  {report.created_at && (
                    <p className="mt-1 text-xs text-zinc-400">{new Date(report.created_at).toLocaleString()}</p>
                  )}
                </div>
                {report.screenshot_url && <span className="text-zinc-400 text-sm">📷</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white dark:bg-zinc-800 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white mb-4">
              {selected.username ?? "Bug Report"}
            </h2>
            {selected.screenshot_url && (
              <img
                src={selected.screenshot_url}
                alt="Screenshot"
                className="w-full rounded-lg mb-4 max-h-64 object-contain bg-zinc-100 dark:bg-zinc-900"
              />
            )}
            <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-4">{selected.description}</p>
            {selected.app_version && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{selected.app_version}</p>
            )}
            {selected.device_info && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{selected.device_info}</p>
            )}
            <div className="mt-6 flex gap-2">
              {(["pending", "reviewed", "resolved"] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => updateStatus(selected.id, status)}
                  disabled={updatingStatus || selected.status === status}
                  className={`px-4 py-2 rounded-lg text-sm capitalize ${
                    selected.status === status
                      ? "bg-red-600 text-white"
                      : "bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600"
                  } disabled:opacity-50`}
                >
                  {status}
                </button>
              ))}
            </div>
            <button
              onClick={() => setSelected(null)}
              className="mt-4 w-full py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
