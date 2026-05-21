"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

type User = {
  id: string;
  username: string;
  email: string;
  role: string;
  city: string | null;
  created_at: string | null;
  banned_until: string | null;
};

const USER_COLUMNS = "id, username, email, role, city, created_at, banned_until";
const PAGE_SIZE = 50;
const SEARCH_LIMIT = 100;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function escapeIlike(term: string): string {
  return term.replace(/[%_\\]/g, (c) => `\\${c}`);
}

/** Role filter values; matched case-insensitively against `users.role`. */
export type RoleFilter =
  | "all"
  | "regular"
  | "test"
  | "premium"
  | "admin"
  | "trainer"
  | "pro"
  | "user";

const ROLE_FILTERS: { id: RoleFilter; label: string; pillClass: string }[] = [
  { id: "all", label: "All", pillClass: "border-zinc-400 text-zinc-700 dark:text-zinc-200" },
  { id: "test", label: "Test (QA)", pillClass: "border-violet-500 text-violet-700 dark:text-violet-300" },
  { id: "regular", label: "Regular", pillClass: "border-zinc-500 text-zinc-600 dark:text-zinc-300" },
  { id: "premium", label: "Premium", pillClass: "border-amber-500 text-amber-700 dark:text-amber-300" },
  { id: "admin", label: "Admin", pillClass: "border-red-500 text-red-700 dark:text-red-300" },
  { id: "trainer", label: "Trainer", pillClass: "border-orange-500 text-orange-700 dark:text-orange-300" },
  { id: "pro", label: "Pro", pillClass: "border-amber-600 text-amber-800 dark:text-amber-200" },
  { id: "user", label: "User", pillClass: "border-zinc-500 text-zinc-600 dark:text-zinc-300" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyRoleFilter(query: any, roleFilter: RoleFilter) {
  if (roleFilter === "all") return query;
  return query.ilike("role", roleFilter);
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [roleCounts, setRoleCounts] = useState<Partial<Record<RoleFilter, number>>>({});
  const [page, setPage] = useState(0);
  const [totalUsers, setTotalUsers] = useState<number | null>(null);
  const [searchMode, setSearchMode] = useState(false);
  const [banModal, setBanModal] = useState<User | null>(null);
  const [viewUser, setViewUser] = useState<User | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchRoleCounts = useCallback(async () => {
    const supabase = createClient();
    const filters: RoleFilter[] = ["all", "test", "regular", "premium", "admin"];
    const results = await Promise.all(
      filters.map(async (f) => {
        let q = supabase.from("users").select("*", { count: "exact", head: true });
        q = applyRoleFilter(q, f);
        const { count, error: err } = await q;
        if (err) return [f, null] as const;
        return [f, count ?? 0] as const;
      })
    );
    const next: Partial<Record<RoleFilter, number>> = {};
    for (const [f, n] of results) {
      if (n != null) next[f] = n;
    }
    setRoleCounts(next);
  }, []);

  const fetchBrowse = useCallback(
    async (pageIndex: number, filter: RoleFilter) => {
      const supabase = createClient();
      const from = pageIndex * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let listQuery = supabase
        .from("users")
        .select(USER_COLUMNS)
        .order("created_at", { ascending: false })
        .range(from, to);
      listQuery = applyRoleFilter(listQuery, filter);

      let countQuery = supabase.from("users").select("*", { count: "exact", head: true });
      countQuery = applyRoleFilter(countQuery, filter);

      const [{ data, error: err }, { count, error: countErr }] = await Promise.all([listQuery, countQuery]);

      if (err) throw err;
      if (!countErr && count != null) setTotalUsers(count);
      setUsers((data as User[]) ?? []);
      setSearchMode(false);
    },
    []
  );

  const fetchSearch = useCallback(async (query: string, filter: RoleFilter) => {
    const supabase = createClient();
    const q = query.trim();

    if (q.length < 2) {
      return;
    }

    let request = supabase
      .from("users")
      .select(USER_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(SEARCH_LIMIT);
    request = applyRoleFilter(request, filter);

    if (UUID_RE.test(q)) {
      request = request.eq("id", q);
    } else {
      const pattern = `%${escapeIlike(q)}%`;
      request = request.or(`username.ilike.${pattern},email.ilike.${pattern}`);
    }

    const { data, error: err } = await request;
    if (err) throw err;
    setUsers((data as User[]) ?? []);
    setSearchMode(true);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (debouncedSearch.length >= 2) {
        await fetchSearch(debouncedSearch, roleFilter);
      } else {
        await fetchBrowse(page, roleFilter);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, fetchBrowse, fetchSearch, page, roleFilter]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    void fetchRoleCounts();
  }, [fetchRoleCounts, updating]);

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, roleFilter]);

  function isBanned(u: User): boolean {
    if (!u.banned_until) return false;
    return new Date(u.banned_until) > new Date();
  }

  async function updateRole(userId: string, role: string) {
    setUpdating(true);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.from("users").update({ role }).eq("id", userId);
      if (err) throw err;
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setUpdating(false);
    }
  }

  async function banUser(userId: string, days: number) {
    setUpdating(true);
    try {
      const supabase = createClient();
      const until =
        days >= 9999
          ? new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000)
          : new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      const { error: err } = await supabase
        .from("users")
        .update({ banned_until: until.toISOString() })
        .eq("id", userId);
      if (err) throw err;
      await reload();
      setBanModal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to ban");
    } finally {
      setUpdating(false);
    }
  }

  async function unbanUser(userId: string) {
    setUpdating(true);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.from("users").update({ banned_until: null }).eq("id", userId);
      if (err) throw err;
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to unban");
    } finally {
      setUpdating(false);
    }
  }

  function roleColor(role: string): string {
    switch (role.toLowerCase()) {
      case "admin":
        return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400";
      case "premium":
      case "pro":
        return "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400";
      case "test":
        return "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400";
      case "trainer":
        return "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400";
      default:
        return "bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400";
    }
  }

  const ROLE_OPTIONS = [
    { value: "user", label: "user" },
    { value: "regular", label: "regular" },
    { value: "premium", label: "premium" },
    { value: "trainer", label: "trainer" },
    { value: "pro", label: "pro" },
    { value: "test", label: "test" },
    { value: "admin", label: "admin" },
  ] as const;

  const totalPages =
    totalUsers != null && !searchMode ? Math.max(1, Math.ceil(totalUsers / PAGE_SIZE)) : 1;
  const canPrev = !searchMode && page > 0;
  const canNext = !searchMode && page + 1 < totalPages;

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">User Management</h1>
        <div className="flex gap-2 flex-wrap">
          <input
            type="search"
            placeholder="Search all users (username, email, or ID)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white w-72 min-w-[16rem]"
          />
          <button
            onClick={() => void reload()}
            className="px-3 py-2 rounded-lg bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="mb-4">
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2 uppercase tracking-wide">
          Filter by role
        </p>
        <div className="flex flex-wrap gap-2">
          {ROLE_FILTERS.map((f) => {
            const active = roleFilter === f.id;
            const count = roleCounts[f.id];
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setRoleFilter(f.id)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  f.pillClass
                } ${
                  active
                    ? "bg-white/90 dark:bg-zinc-700 ring-2 ring-offset-1 ring-offset-zinc-100 dark:ring-offset-zinc-900 ring-red-500 font-medium"
                    : "bg-white/50 dark:bg-zinc-800/80 opacity-80 hover:opacity-100"
                }`}
              >
                {f.label}
                {count != null ? ` (${count.toLocaleString()})` : ""}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
        {searchMode
          ? debouncedSearch.length >= 2
            ? `Search results across all users (up to ${SEARCH_LIMIT}).`
            : null
          : totalUsers != null
            ? `Browsing ${roleFilter === "all" ? "all users" : `role: ${roleFilter}`} — page ${page + 1} of ${totalPages} (${totalUsers.toLocaleString()} matching). Type 2+ characters to search within this filter.`
            : `Browsing ${roleFilter === "all" ? "users" : `role: ${roleFilter}`}. Type 2+ characters to search.`}
      </p>
      {roleFilter === "test" && (
        <p className="text-sm text-violet-700 dark:text-violet-400 mb-4 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2">
          <span className="font-medium">Test users</span> still exist in the database, but Supabase RPCs for{" "}
          <Link href="/admin/dashboard" className="underline">
            Dashboard
          </Link>{" "}
          and{" "}
          <Link href="/admin/analytics-dashboard" className="underline">
            Growth analytics
          </Link>{" "}
          skip them via <code className="text-xs">is_admin_dashboard_user()</code> (role ≠ test). Verify with the checklist
          below.
        </p>
      )}
      <details className="text-sm text-zinc-600 dark:text-zinc-400 mb-4 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2">
        <summary className="cursor-pointer font-medium text-zinc-800 dark:text-zinc-200">
          How to verify test data is excluded from the dash
        </summary>
        <ul className="mt-2 list-disc pl-5 space-y-1.5">
          <li>
            <span className="font-medium">In Growth analytics:</span> footer note says counts exclude{" "}
            <code className="text-xs">role=test</code>; period badge is <span className="text-green-600 dark:text-green-400">live</span>{" "}
            (not hybrid/mock).
          </li>
          <li>
            <span className="font-medium">Before / after:</span> note Total users on Dashboard, tag one user as test here, refresh
            Dashboard — count should drop by 1 if SQL migrations are applied.
          </li>
          <li>
            <span className="font-medium">In Supabase SQL editor</span> (run as postgres): compare{" "}
            <code className="text-xs">count(*) FROM users</code> vs{" "}
            <code className="text-xs">count(*) WHERE is_admin_dashboard_user(role)</code> — see{" "}
            <code className="text-xs">admin_local_dashboard_verify.sql</code> in the iOS repo.
          </li>
          <li>
            <span className="font-medium">Required SQL (in order):</span>{" "}
            <code className="text-xs">admin_exclude_test_role.sql</code>,{" "}
            <code className="text-xs">admin_growth_dashboard_exclude_test.sql</code>,{" "}
            <code className="text-xs">admin_dashboard_exclude_test_extended.sql</code> (friendships, posts, gym, top users).
          </li>
        </ul>
      </details>

      {error && <p className="text-red-600 dark:text-red-400 mb-4 text-sm">{error}</p>}

      {loading ? (
        <p className="text-zinc-500 py-8">Loading…</p>
      ) : (
        <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700">
                  <th className="text-left p-4 text-sm font-medium text-zinc-500 dark:text-zinc-400">User</th>
                  <th className="text-left p-4 text-sm font-medium text-zinc-500 dark:text-zinc-400">Role</th>
                  <th className="text-left p-4 text-sm font-medium text-zinc-500 dark:text-zinc-400">Joined</th>
                  <th className="text-right p-4 text-sm font-medium text-zinc-500 dark:text-zinc-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                      {searchMode
                        ? "No users match your search and role filter."
                        : roleFilter === "all"
                          ? "No users found."
                          : `No users with role “${roleFilter}”.`}
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr
                      key={u.id}
                      className="border-b border-zinc-100 dark:border-zinc-700/50 hover:bg-zinc-50 dark:hover:bg-zinc-700/30"
                    >
                      <td className="p-4">
                        <div>
                          <p className="font-medium text-zinc-900 dark:text-white">{u.username}</p>
                          <p className="text-sm text-zinc-500 dark:text-zinc-400">{u.email}</p>
                          {isBanned(u) && (
                            <span className="text-xs text-red-600 dark:text-red-400">Banned</span>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <select
                          value={u.role}
                          onChange={(e) => updateRole(u.id, e.target.value)}
                          disabled={updating}
                          className={`px-2 py-1 rounded text-sm max-w-[14rem] ${roleColor(u.role)} border-0 cursor-pointer`}
                        >
                          {ROLE_OPTIONS.some((o) => o.value === u.role.toLowerCase()) ? null : (
                            <option value={u.role}>{u.role}</option>
                          )}
                          {ROLE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-4 text-sm text-zinc-500 dark:text-zinc-400">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            onClick={() => setViewUser(u)}
                            className="text-sm text-zinc-600 dark:text-zinc-400 hover:underline"
                          >
                            View
                          </button>
                          {isBanned(u) ? (
                            <button
                              onClick={() => unbanUser(u.id)}
                              disabled={updating}
                              className="text-sm text-green-600 dark:text-green-400 hover:underline"
                            >
                              Unban
                            </button>
                          ) : (
                            <button
                              onClick={() => setBanModal(u)}
                              className="text-sm text-red-600 dark:text-red-400 hover:underline"
                            >
                              Ban
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="p-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 dark:border-zinc-700">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {searchMode
                ? `${users.length} match${users.length === 1 ? "" : "es"}`
                : `${users.length} on this page`}
            </p>
            {!searchMode && (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!canPrev || loading}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="px-3 py-1.5 rounded-lg text-sm border border-zinc-300 dark:border-zinc-600 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={!canNext || loading}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1.5 rounded-lg text-sm border border-zinc-300 dark:border-zinc-600 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {viewUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-800 rounded-2xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-4">
              View as user: {viewUser.username}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
              Use this data for debugging or to send a single-user push notification.
            </p>
            <div className="space-y-2 text-sm font-mono">
              <div className="flex justify-between gap-4 py-2 border-b border-zinc-100 dark:border-zinc-700">
                <span className="text-zinc-500">ID</span>
                <span className="text-zinc-900 dark:text-white break-all text-right">{viewUser.id}</span>
              </div>
              <div className="flex justify-between gap-4 py-2 border-b border-zinc-100 dark:border-zinc-700">
                <span className="text-zinc-500">Username</span>
                <span className="text-zinc-900 dark:text-white">{viewUser.username}</span>
              </div>
              <div className="flex justify-between gap-4 py-2 border-b border-zinc-100 dark:border-zinc-700">
                <span className="text-zinc-500">Email</span>
                <span className="text-zinc-900 dark:text-white break-all text-right">{viewUser.email}</span>
              </div>
              <div className="flex justify-between gap-4 py-2 border-b border-zinc-100 dark:border-zinc-700">
                <span className="text-zinc-500">Role</span>
                <span className="text-zinc-900 dark:text-white">{viewUser.role}</span>
              </div>
              <div className="flex justify-between gap-4 py-2 border-b border-zinc-100 dark:border-zinc-700">
                <span className="text-zinc-500">City</span>
                <span className="text-zinc-900 dark:text-white">{viewUser.city ?? "—"}</span>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <span className="text-zinc-500">Joined</span>
                <span className="text-zinc-900 dark:text-white">
                  {viewUser.created_at ? new Date(viewUser.created_at).toLocaleString() : "—"}
                </span>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(viewUser.id);
                }}
                className="flex-1 py-2 rounded-lg bg-zinc-600 hover:bg-zinc-700 text-white text-sm"
              >
                Copy user ID
              </button>
              <Link
                href={`/admin/notifications?single=${viewUser.id}`}
                className="flex-1 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 text-center text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700"
              >
                Send push
              </Link>
              <button
                onClick={() => setViewUser(null)}
                className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {banModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-800 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Ban {banModal.username}?</h3>
            <div className="flex flex-wrap gap-2 mt-4">
              {[
                { days: 1, label: "1 day" },
                { days: 7, label: "1 week" },
                { days: 30, label: "1 month" },
                { days: 9999, label: "Permanent" },
              ].map(({ days, label }) => (
                <button
                  key={days}
                  onClick={() => banUser(banModal.id, days)}
                  disabled={updating}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm disabled:opacity-50"
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setBanModal(null)}
              className="mt-4 w-full py-2 rounded-lg border border-zinc-300 dark:border-zinc-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
