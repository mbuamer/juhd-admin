"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

type Notification = {
  id: string;
  admin_id: string;
  title: string;
  message: string;
  target_all: boolean;
  sent_at: string | null;
  notification_count: number;
  created_at: string;
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [targetAll, setTargetAll] = useState(true);
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error: err } = await supabase
        .from("admin_notifications")
        .select("id, admin_id, title, message, target_all, sent_at, notification_count, created_at")
        .eq("admin_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (err) throw err;
      setNotifications((data as Notification[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createAndSend() {
    if (!title.trim() || !message.trim()) {
      setError("Title and message required");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");

      const { data: inserted, error: insertErr } = await supabase
        .from("admin_notifications")
        .insert({
          admin_id: user.id,
          title: title.trim(),
          message: message.trim(),
          target_all: targetAll,
          notification_count: 0,
        })
        .select("id")
        .single();

      if (insertErr) throw insertErr;
      if (!inserted) throw new Error("Insert failed");

      setSending(true);
      const { data: broadcastResult, error: rpcErr } = await supabase.rpc("broadcast_admin_notification", {
        p_admin_notification_id: inserted.id,
      });

      if (rpcErr) throw rpcErr;

      setTitle("");
      setMessage("");
      setShowCreate(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setCreating(false);
      setSending(false);
    }
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Broadcast Notifications</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium"
          >
            + New Notification
          </button>
          <button onClick={load} className="px-3 py-2 rounded-lg bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600">
            Refresh
          </button>
        </div>
      </div>

      {error && <p className="text-red-600 dark:text-red-400 mb-4 text-sm">{error}</p>}

      {loading ? (
        <p className="text-zinc-500 py-8">Loading…</p>
      ) : notifications.length === 0 ? (
        <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-12 text-center">
          <p className="text-zinc-500 dark:text-zinc-400 mb-4">No notifications yet</p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white"
          >
            Send your first notification
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <div
              key={n.id}
              className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-zinc-900 dark:text-white">{n.title}</p>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2">{n.message}</p>
                  <div className="mt-2 flex gap-4 text-xs text-zinc-500 dark:text-zinc-400">
                    <span>{n.target_all ? "All users" : "Filtered"}</span>
                    {n.sent_at && (
                      <span>Sent: {new Date(n.sent_at).toLocaleString()} ({n.notification_count} users)</span>
                    )}
                    {!n.sent_at && <span className="text-amber-600 dark:text-amber-400">Not sent</span>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-800 rounded-2xl p-6 max-w-md w-full">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white mb-4">New Broadcast</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Notification title"
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Message</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Notification message"
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={targetAll}
                  onChange={(e) => setTargetAll(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-zinc-700 dark:text-zinc-300">Send to all users</span>
              </label>
            </div>
            <div className="mt-6 flex gap-2">
              <button
                onClick={createAndSend}
                disabled={creating || sending}
                className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-50"
              >
                {creating || sending ? "Sending…" : "Create & Send"}
              </button>
              <button
                onClick={() => {
                  setShowCreate(false);
                  setTitle("");
                  setMessage("");
                  setError("");
                }}
                className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
