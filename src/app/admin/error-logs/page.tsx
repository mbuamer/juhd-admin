"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

type ErrorLog = {
  id: string;
  user_id: string | null;
  error_domain: string;
  error_code: number;
  error_description: string;
  context: string | null;
  severity: string | null;
  is_resolved: boolean | null;
  created_at: string | null;
};

export default function ErrorLogsPage() {
  const [logs, setLogs] = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "unresolved">("unresolved");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const supabase = createClient();
      let query = supabase
        .from("error_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (filter === "unresolved") {
        query = query.or("is_resolved.is.null,is_resolved.eq.false");
      }

      const { data, error: err } = await query;
      if (err) throw err;
      setLogs((data as ErrorLog[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [filter]);

  async function markResolved(id: string) {
    try {
      const supabase = createClient();
      const { error: err } = await supabase
        .from("error_logs")
        .update({ is_resolved: true, resolved_at: new Date().toISOString() })
        .eq("id", id);
      if (err) throw err;
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    }
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Error Logs</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setFilter("unresolved")}
            className={`px-3 py-1.5 rounded-lg text-sm ${filter === "unresolved" ? "bg-red-600 text-white" : "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400"}`}
          >
            Unresolved
          </button>
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-sm ${filter === "all" ? "bg-red-600 text-white" : "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400"}`}
          >
            All
          </button>
          <button onClick={load} className="px-3 py-1.5 rounded-lg text-sm bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600">
            Refresh
          </button>
        </div>
      </div>

      {error && <p className="text-red-600 dark:text-red-400 mb-4 text-sm">{error}</p>}

      {loading ? (
        <p className="text-zinc-500 py-8">Loading…</p>
      ) : logs.length === 0 ? (
        <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-12 text-center">
          <p className="text-zinc-500 dark:text-zinc-400">No error logs</p>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => (
            <div
              key={log.id}
              className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">{log.error_domain}</span>
                    {log.is_resolved && (
                      <span className="text-xs px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">Resolved</span>
                    )}
                    {log.severity === "critical" && (
                      <span className="text-xs px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">Critical</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-zinc-900 dark:text-white">{log.error_description}</p>
                  {log.context && (
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 truncate">{log.context}</p>
                  )}
                  {log.created_at && (
                    <p className="mt-1 text-xs text-zinc-400">{new Date(log.created_at).toLocaleString()}</p>
                  )}
                </div>
                {!log.is_resolved && (
                  <button
                    onClick={() => markResolved(log.id)}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm"
                  >
                    Mark resolved
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
