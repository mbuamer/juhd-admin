"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

type PostReport = {
  id: string;
  post_id: string;
  reported_user_id: string;
  reported_by: string;
  reason: string;
  description: string | null;
  status: string | null;
  created_at: string | null;
};

type MessageReport = {
  id: string;
  reported_user_id: string;
  reported_by: string;
  message_id: string | null;
  reason: string;
  description: string | null;
  status: string | null;
  created_at: string | null;
};

export default function ReportsPage() {
  const [tab, setTab] = useState<"post" | "message">("post");
  const [filter, setFilter] = useState<"active" | "all">("active");
  const [postReports, setPostReports] = useState<PostReport[]>([]);
  const [messageReports, setMessageReports] = useState<MessageReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const [postRes, msgRes] = await Promise.all([
        supabase.from("post_reports").select("*").order("created_at", { ascending: false }).limit(50),
        supabase.from("message_reports").select("*").order("created_at", { ascending: false }).limit(50),
      ]);
      if (postRes.error) throw postRes.error;
      if (msgRes.error) throw msgRes.error;
      setPostReports((postRes.data as PostReport[]) ?? []);
      setMessageReports((msgRes.data as MessageReport[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filteredPosts = filter === "active" ? postReports.filter((r) => r.status === "pending") : postReports;
  const filteredMessages = filter === "active" ? messageReports.filter((r) => r.status === "pending") : messageReports;

  async function markPostResolved(id: string) {
    try {
      const supabase = createClient();
      const { error: err } = await supabase.from("post_reports").update({ status: "resolved" }).eq("id", id);
      if (err) throw err;
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    }
  }

  async function markMessageResolved(id: string) {
    try {
      const supabase = createClient();
      const { error: err } = await supabase.from("message_reports").update({ status: "resolved" }).eq("id", id);
      if (err) throw err;
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    }
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Reports</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setTab("post")}
            className={`px-3 py-1.5 rounded-lg text-sm ${tab === "post" ? "bg-red-600 text-white" : "bg-zinc-200 dark:bg-zinc-700"}`}
          >
            Post Reports
          </button>
          <button
            onClick={() => setTab("message")}
            className={`px-3 py-1.5 rounded-lg text-sm ${tab === "message" ? "bg-red-600 text-white" : "bg-zinc-200 dark:bg-zinc-700"}`}
          >
            Message Reports
          </button>
          <button
            onClick={() => setFilter(filter === "active" ? "all" : "active")}
            className={`px-3 py-1.5 rounded-lg text-sm ${filter === "active" ? "bg-zinc-800 text-white" : "bg-zinc-200 dark:bg-zinc-700"}`}
          >
            {filter === "active" ? "Active" : "All"}
          </button>
          <button onClick={load} className="px-3 py-1.5 rounded-lg text-sm bg-zinc-200 dark:bg-zinc-700">
            Refresh
          </button>
        </div>
      </div>

      {error && <p className="text-red-600 dark:text-red-400 mb-4 text-sm">{error}</p>}

      {loading ? (
        <p className="text-zinc-500 py-8">Loading…</p>
      ) : tab === "post" ? (
        <div className="space-y-3">
          {filteredPosts.length === 0 ? (
            <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-12 text-center">
              <p className="text-zinc-500 dark:text-zinc-400">No post reports</p>
            </div>
          ) : (
            filteredPosts.map((r) => (
              <div
                key={r.id}
                className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-zinc-900 dark:text-white">{r.reason}</p>
                    {r.description && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{r.description}</p>}
                    <p className="mt-1 text-xs text-zinc-400">Post: {r.post_id.slice(0, 8)}…</p>
                    {r.created_at && <p className="text-xs text-zinc-400">{new Date(r.created_at).toLocaleString()}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {r.status === "resolved" ? (
                      <span className="text-xs text-green-600 dark:text-green-400">Resolved</span>
                    ) : (
                      <button
                        onClick={() => markPostResolved(r.id)}
                        className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm"
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredMessages.length === 0 ? (
            <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-12 text-center">
              <p className="text-zinc-500 dark:text-zinc-400">No message reports</p>
            </div>
          ) : (
            filteredMessages.map((r) => (
              <div
                key={r.id}
                className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-zinc-900 dark:text-white">{r.reason}</p>
                    {r.description && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{r.description}</p>}
                    <p className="mt-1 text-xs text-zinc-400">User: {r.reported_user_id.slice(0, 8)}…</p>
                    {r.created_at && <p className="text-xs text-zinc-400">{new Date(r.created_at).toLocaleString()}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {r.status === "resolved" ? (
                      <span className="text-xs text-green-600 dark:text-green-400">Resolved</span>
                    ) : (
                      <button
                        onClick={() => markMessageResolved(r.id)}
                        className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm"
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
