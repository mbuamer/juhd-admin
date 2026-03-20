"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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
  const searchParams = useSearchParams();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showSingle, setShowSingle] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [targetAll, setTargetAll] = useState(true);
  const [filterGender, setFilterGender] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [filterAgeMin, setFilterAgeMin] = useState("");
  const [filterAgeMax, setFilterAgeMax] = useState("");
  const [targetedCount, setTargetedCount] = useState<number | null>(null);
  const [singleUserId, setSingleUserId] = useState("");
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

  useEffect(() => {
    const single = searchParams.get("single");
    if (single) {
      setSingleUserId(single);
      setShowSingle(true);
      router.replace("/admin/notifications", { scroll: false });
    }
  }, [searchParams, router]);

  useEffect(() => {
    if (!showCreate || targetAll) {
      setTargetedCount(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.rpc("get_admin_targeted_push_count", {
          p_gender: filterGender || null,
          p_city: filterCity || null,
          p_age_min: filterAgeMin ? parseInt(filterAgeMin, 10) : null,
          p_age_max: filterAgeMax ? parseInt(filterAgeMax, 10) : null,
        });
        setTargetedCount(Number(data) ?? 0);
      } catch {
        setTargetedCount(null);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [showCreate, targetAll, filterGender, filterCity, filterAgeMin, filterAgeMax]);

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

      const targetFilter = targetAll ? null : {
        ...(filterGender && { gender: filterGender }),
        ...(filterCity && { city: filterCity }),
        ...(filterAgeMin && { age_min: parseInt(filterAgeMin, 10) }),
        ...(filterAgeMax && { age_max: parseInt(filterAgeMax, 10) }),
      };
      const hasFilter = targetFilter && Object.keys(targetFilter).length > 0;

      const { data: inserted, error: insertErr } = await supabase
        .from("admin_notifications")
        .insert({
          admin_id: user.id,
          title: title.trim(),
          message: message.trim(),
          target_all: targetAll,
          ...(hasFilter && { target_filter: targetFilter }),
          notification_count: 0,
        })
        .select("id")
        .single();

      if (insertErr) throw insertErr;
      if (!inserted) throw new Error("Insert failed");

      setSending(true);
      await supabase.rpc("broadcast_admin_notification", {
        p_admin_notification_id: inserted.id,
      });

      setTitle("");
      setMessage("");
      setFilterGender("");
      setFilterCity("");
      setFilterAgeMin("");
      setFilterAgeMax("");
      setShowCreate(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setCreating(false);
      setSending(false);
    }
  }

  async function sendSingleUser() {
    if (!title.trim() || !message.trim() || !singleUserId.trim()) {
      setError("Title, message, and user ID required");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");

      const { error: rpcErr } = await supabase.rpc("send_admin_single_user_notification", {
        p_user_id: singleUserId.trim(),
        p_title: title.trim(),
        p_message: message.trim(),
        p_admin_id: user.id,
      });

      if (rpcErr) throw rpcErr;

      setTitle("");
      setMessage("");
      setSingleUserId("");
      setShowSingle(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setCreating(false);
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
            + Broadcast
          </button>
          <button
            onClick={() => setShowSingle(true)}
            className="px-4 py-2 rounded-lg bg-zinc-600 hover:bg-zinc-700 text-white font-medium"
          >
            Single User
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
              {!targetAll && (
                <div className="space-y-3 pt-2 border-t border-zinc-200 dark:border-zinc-600">
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Target filters</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-zinc-500 mb-0.5">Gender</label>
                      <select
                        value={filterGender}
                        onChange={(e) => setFilterGender(e.target.value)}
                        className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-sm"
                      >
                        <option value="">Any</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-0.5">City</label>
                      <input
                        type="text"
                        value={filterCity}
                        onChange={(e) => setFilterCity(e.target.value)}
                        placeholder="e.g. Riyadh"
                        className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-0.5">Age min</label>
                      <input
                        type="number"
                        value={filterAgeMin}
                        onChange={(e) => setFilterAgeMin(e.target.value)}
                        placeholder="18"
                        min={1}
                        max={120}
                        className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-0.5">Age max</label>
                      <input
                        type="number"
                        value={filterAgeMax}
                        onChange={(e) => setFilterAgeMax(e.target.value)}
                        placeholder="65"
                        min={1}
                        max={120}
                        className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-sm"
                      />
                    </div>
                  </div>
                  {targetedCount !== null && (
                    <p className="text-sm text-amber-600 dark:text-amber-400">
                      Will be sent to ~{targetedCount.toLocaleString()} users
                    </p>
                  )}
                </div>
              )}
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

      {showSingle && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-800 rounded-2xl p-6 max-w-md w-full">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white mb-4">Send to Single User</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
              Send a push notification to one user (e.g. after resolving a bug report). Use the user&apos;s UUID from Users or Bug Reports.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">User ID (UUID)</label>
                <input
                  type="text"
                  value={singleUserId}
                  onChange={(e) => setSingleUserId(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white font-mono text-sm"
                />
              </div>
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
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white"
                />
              </div>
            </div>
            <div className="mt-6 flex gap-2">
              <button
                onClick={sendSingleUser}
                disabled={creating || !title.trim() || !message.trim() || !singleUserId.trim()}
                className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-50"
              >
                {creating ? "Sending…" : "Send"}
              </button>
              <button
                onClick={() => {
                  setShowSingle(false);
                  setTitle("");
                  setMessage("");
                  setSingleUserId("");
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
