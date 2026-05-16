/**
 * All-time / admin RPC counts for the Growth analytics numeric strip (no chart dependency).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { rpcFirstRow } from "@/lib/rpc-row";

function toInt(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string") return parseInt(v, 10) || 0;
  if (v && typeof v === "object" && "toString" in v) return parseInt(String(v), 10) || 0;
  return 0;
}

/** Matches app `PostType` raw values + common aliases. */
export const POST_TYPE_LABELS: Record<string, string> = {
  workout_summary: "Workout summary",
  image: "Image",
  video: "Video",
  text: "Text",
  music: "Music",
  gym_checkin: "Gym check-in",
  repost: "Repost",
};

export interface AdminContentStatsRow {
  postsTotal: number;
  postsToday: number;
  postsWeek: number;
  postsMonth: number;
  commentsTotal: number;
  commentsToday: number;
  commentsWeek: number;
  commentsMonth: number;
  likesTotal: number;
  likesToday: number;
  likesWeek: number;
  likesMonth: number;
  repostsTotal: number;
  postsByType: Record<string, number>;
}

export interface AdminGymCheckinStatsRow {
  checkinsToday: number;
  checkinsWeek: number;
  checkinsMonth: number;
  checkinsPeriod: number | null;
  topGyms: { gymName: string; checkinCount: number }[];
}

export interface AdminFriendsStatsRow {
  totalFriendships: number;
  pendingRequests: number;
  acceptanceRatePct: number;
  avgFriendsPerUser: number;
}

export interface GrowthNumericSnapshot {
  content: AdminContentStatsRow | null;
  /** Window label for `content` activity columns (today/week/month); totals may still be all-time depending on RPC. */
  contentPeriodUsed: string | null;
  gym: AdminGymCheckinStatsRow | null;
  friends: AdminFriendsStatsRow | null;
  premiumSubscribers: number | null;
  /** Rows in public.gym_checkins (RLS permitting). */
  gymCheckinsTableRows: number | null;
  fetchErrors: string[];
}

function parseContentRow(r: Record<string, unknown>): AdminContentStatsRow {
  const pbt = r.posts_by_type ?? r.postsByType;
  let postsByType: Record<string, number> = {};
  if (pbt && typeof pbt === "object" && !Array.isArray(pbt)) {
    postsByType = Object.fromEntries(
      Object.entries(pbt as Record<string, unknown>).map(([k, v]) => [k, toInt(v)])
    );
  }
  return {
    postsTotal: toInt(r.posts_total ?? r.postsTotal),
    postsToday: toInt(r.posts_today ?? r.postsToday),
    postsWeek: toInt(r.posts_week ?? r.postsWeek),
    postsMonth: toInt(r.posts_month ?? r.postsMonth),
    commentsTotal: toInt(r.comments_total ?? r.commentsTotal),
    commentsToday: toInt(r.comments_today ?? r.commentsToday),
    commentsWeek: toInt(r.comments_week ?? r.commentsWeek),
    commentsMonth: toInt(r.comments_month ?? r.commentsMonth),
    likesTotal: toInt(r.likes_total ?? r.likesTotal),
    likesToday: toInt(r.likes_today ?? r.likesToday),
    likesWeek: toInt(r.likes_week ?? r.likesWeek),
    likesMonth: toInt(r.likes_month ?? r.likesMonth),
    repostsTotal: toInt(r.reposts_total ?? r.repostsTotal),
    postsByType,
  };
}

function parseGymRow(r: Record<string, unknown>): AdminGymCheckinStatsRow {
  const raw = r.top_gyms ?? r.topGyms;
  let topGyms: { gymName: string; checkinCount: number }[] = [];
  if (Array.isArray(raw)) {
    topGyms = raw
      .map((g) => {
        if (!g || typeof g !== "object") return null;
        const o = g as Record<string, unknown>;
        const gymName = String(o.gym_name ?? o.gymName ?? "").trim();
        if (!gymName) return null;
        return { gymName, checkinCount: toInt(o.checkin_count ?? o.checkinCount) };
      })
      .filter((x): x is { gymName: string; checkinCount: number } => x != null);
  }
  const cp = r.checkins_period ?? r.checkinsPeriod;
  return {
    checkinsToday: toInt(r.checkins_today ?? r.checkinsToday),
    checkinsWeek: toInt(r.checkins_week ?? r.checkinsWeek),
    checkinsMonth: toInt(r.checkins_month ?? r.checkinsMonth),
    checkinsPeriod: cp == null ? null : toInt(cp),
    topGyms,
  };
}

/** Map growth period filter to content-stats window columns (approximate for 7d/30d). */
export function contentCountsForPeriod(
  content: AdminContentStatsRow,
  period: 1 | 7 | 30
): { posts: number; comments: number; likes: number } {
  if (period === 1) {
    return { posts: content.postsToday, comments: content.commentsToday, likes: content.likesToday };
  }
  if (period === 7) {
    return { posts: content.postsWeek, comments: content.commentsWeek, likes: content.likesWeek };
  }
  return { posts: content.postsMonth, comments: content.commentsMonth, likes: content.likesMonth };
}

function parseFriendsRow(r: Record<string, unknown>): AdminFriendsStatsRow {
  return {
    totalFriendships: toInt(r.total_friendships ?? r.totalFriendships),
    pendingRequests: toInt(r.pending_requests ?? r.pendingRequests),
    acceptanceRatePct: Number(r.acceptance_rate_pct ?? r.acceptanceRatePct) || 0,
    avgFriendsPerUser: Number(r.avg_friends_per_user ?? r.avgFriendsPerUser) || 0,
  };
}

const CONTENT_PERIOD_CANDIDATES = ["all", "week", "month", "day", "today"] as const;

function utcDayStart(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function utcDayStartIso(d = new Date()): string {
  return utcDayStart(d).toISOString();
}

function utcDaysAgoIso(days: number): string {
  const x = utcDayStart();
  x.setUTCDate(x.getUTCDate() - days);
  return x.toISOString();
}

async function countTableSince(
  supabase: SupabaseClient,
  table: string,
  sinceIso?: string,
  timestampCol = "created_at"
): Promise<number | null> {
  let q = supabase.from(table).select("*", { count: "exact", head: true });
  if (sinceIso) q = q.gte(timestampCol, sinceIso);
  const { count, error } = await q;
  if (error) return null;
  return count ?? 0;
}

async function fetchContentStatsWithFallback(supabase: SupabaseClient): Promise<{
  row: AdminContentStatsRow | null;
  periodUsed: string | null;
  err: string | null;
  source: "rpc" | "tables" | null;
}> {
  let lastErr: string | null = null;
  for (const p of CONTENT_PERIOD_CANDIDATES) {
    const { data, error } = await supabase.rpc("get_admin_content_stats", { p_period: p });
    if (error) {
      lastErr = error.message;
      continue;
    }
    const fr = rpcFirstRow(data);
    if (fr) return { row: parseContentRow(fr), periodUsed: p, err: null, source: "rpc" };
    lastErr = "empty RPC row";
  }

  const dayStart = utcDayStartIso();
  const weekStart = utcDaysAgoIso(6);
  const monthStart = utcDaysAgoIso(29);

  const [
    postsTotal,
    postsToday,
    postsWeek,
    postsMonth,
    commentsTotal,
    commentsToday,
    commentsWeek,
    commentsMonth,
    likesTotal,
    likesToday,
    likesWeek,
    likesMonth,
  ] = await Promise.all([
    countTableSince(supabase, "posts"),
    countTableSince(supabase, "posts", dayStart),
    countTableSince(supabase, "posts", weekStart),
    countTableSince(supabase, "posts", monthStart),
    countTableSince(supabase, "post_comments"),
    countTableSince(supabase, "post_comments", dayStart),
    countTableSince(supabase, "post_comments", weekStart),
    countTableSince(supabase, "post_comments", monthStart),
    countTableSince(supabase, "post_likes"),
    countTableSince(supabase, "post_likes", dayStart),
    countTableSince(supabase, "post_likes", weekStart),
    countTableSince(supabase, "post_likes", monthStart),
  ]);

  if (
    postsTotal == null &&
    commentsTotal == null &&
    likesTotal == null
  ) {
    return { row: null, periodUsed: null, err: lastErr, source: null };
  }

  return {
    row: {
      postsTotal: postsTotal ?? 0,
      postsToday: postsToday ?? 0,
      postsWeek: postsWeek ?? 0,
      postsMonth: postsMonth ?? 0,
      commentsTotal: commentsTotal ?? 0,
      commentsToday: commentsToday ?? 0,
      commentsWeek: commentsWeek ?? 0,
      commentsMonth: commentsMonth ?? 0,
      likesTotal: likesTotal ?? 0,
      likesToday: likesToday ?? 0,
      likesWeek: likesWeek ?? 0,
      likesMonth: likesMonth ?? 0,
      repostsTotal: 0,
      postsByType: {},
    },
    periodUsed: "tables",
    err: lastErr ? `rpc_failed: ${lastErr}` : null,
    source: "tables",
  };
}

async function fetchGymStatsWithFallback(supabase: SupabaseClient): Promise<{
  row: AdminGymCheckinStatsRow | null;
  err: string | null;
}> {
  const { data, error } = await supabase.rpc("get_admin_gym_checkins_stats");
  if (!error) {
    const fr = rpcFirstRow(data);
    if (fr) return { row: parseGymRow(fr), err: null };
  }

  const dayStart = utcDayStartIso();
  const weekStart = utcDaysAgoIso(6);
  const monthStart = utcDaysAgoIso(29);

  let today = await countTableSince(supabase, "gym_checkins", dayStart, "checked_in_at");
  let week = await countTableSince(supabase, "gym_checkins", weekStart, "checked_in_at");
  let month = await countTableSince(supabase, "gym_checkins", monthStart, "checked_in_at");

  if (today == null && week == null && month == null) {
    today = await countTableSince(supabase, "gym_checkins", dayStart, "created_at");
    week = await countTableSince(supabase, "gym_checkins", weekStart, "created_at");
    month = await countTableSince(supabase, "gym_checkins", monthStart, "created_at");
  }

  if (today == null && week == null && month == null) {
    return { row: null, err: error?.message ?? "empty RPC row" };
  }

  return {
    row: {
      checkinsToday: today ?? 0,
      checkinsWeek: week ?? 0,
      checkinsMonth: month ?? 0,
      checkinsPeriod: null,
      topGyms: [],
    },
    err: error?.message ? `rpc_failed: ${error.message}` : null,
  };
}

async function countTableHead(supabase: SupabaseClient, table: string): Promise<number | null> {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) return null;
  return count ?? 0;
}

export async function fetchGrowthNumericSnapshot(supabase: SupabaseClient): Promise<GrowthNumericSnapshot> {
  const fetchErrors: string[] = [];

  const [contentRes, gymRes, friendsRes, premiumRes, gymRows] = await Promise.all([
    fetchContentStatsWithFallback(supabase),
    fetchGymStatsWithFallback(supabase),
    supabase.rpc("get_admin_friends_stats"),
    supabase.rpc("get_admin_premium_count"),
    countTableHead(supabase, "gym_checkins"),
  ]);

  if (contentRes.err && !contentRes.row) fetchErrors.push(`content_stats: ${contentRes.err}`);
  else if (contentRes.source === "tables" && contentRes.err) {
    fetchErrors.push(`content_stats: ${contentRes.err} (using direct table counts)`);
  }

  const gym = gymRes.row;
  if (gymRes.err && !gym) fetchErrors.push(`gym_checkins_stats: ${gymRes.err}`);
  else if (gymRes.err) fetchErrors.push(`gym_checkins_stats: ${gymRes.err} (using direct table counts)`);

  let friends: AdminFriendsStatsRow | null = null;
  if (friendsRes.error) fetchErrors.push(`friends_stats: ${friendsRes.error.message}`);
  else {
    const fr = rpcFirstRow(friendsRes.data);
    if (fr) friends = parseFriendsRow(fr);
  }

  let premiumSubscribers: number | null = null;
  if (premiumRes.error) fetchErrors.push(`premium_count: ${premiumRes.error.message}`);
  else if (premiumRes.data != null) premiumSubscribers = toInt(premiumRes.data);

  return {
    content: contentRes.row,
    contentPeriodUsed: contentRes.periodUsed,
    gym,
    friends,
    premiumSubscribers,
    gymCheckinsTableRows: gymRows,
    fetchErrors,
  };
}

export function postsByTypeSorted(postsByType: Record<string, number>): { slug: string; label: string; count: number }[] {
  const slugs = new Set([...Object.keys(POST_TYPE_LABELS), ...Object.keys(postsByType)]);
  return [...slugs]
    .map((slug) => ({
      slug,
      label: POST_TYPE_LABELS[slug] ?? slug.replace(/_/g, " "),
      count: postsByType[slug] ?? 0,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
