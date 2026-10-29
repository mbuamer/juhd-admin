/**
 * All-time / admin RPC counts for the Growth analytics numeric strip (no chart dependency).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchMeasuredDetails } from "@/lib/measured-details";

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
  postsYear: number;
  commentsTotal: number;
  commentsToday: number;
  commentsWeek: number;
  commentsMonth: number;
  commentsYear: number;
  likesTotal: number;
  likesToday: number;
  likesWeek: number;
  likesMonth: number;
  likesYear: number;
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

export function contentCountsForPeriod(content:AdminContentStatsRow,period:1|7|30|365):{posts:number;comments:number;likes:number} {
 const suffix = period===1 ? "Today" : period===7 ? "Week" : period===30 ? "Month" : "Year";
 return {posts:content[`posts${suffix}`],comments:content[`comments${suffix}`],likes:content[`likes${suffix}`]};
}
export async function fetchGrowthNumericSnapshot(supabase:SupabaseClient):Promise<GrowthNumericSnapshot> {
 const d=await fetchMeasuredDetails(supabase,0);
 if(!d) return {content:null,contentPeriodUsed:null,gym:null,friends:null,premiumSubscribers:null,gymCheckinsTableRows:null,fetchErrors:["measured_details: Unavailable"]};
 const c=d.counts;
 return {
 content:{postsTotal:c.posts.total,postsToday:c.posts.today,postsWeek:c.posts.week,postsMonth:c.posts.month,postsYear:c.posts.year,
 commentsTotal:c.comments.total,commentsToday:c.comments.today,commentsWeek:c.comments.week,commentsMonth:c.comments.month,commentsYear:c.comments.year,
 likesTotal:c.likes.total,likesToday:c.likes.today,likesWeek:c.likes.week,likesMonth:c.likes.month,likesYear:c.likes.year,repostsTotal:c.reposts.total,postsByType:d.postsByType},
 contentPeriodUsed:"Asia/Riyadh calendar windows",
 gym:{checkinsToday:c.checkins.today,checkinsWeek:c.checkins.week,checkinsMonth:c.checkins.month,checkinsPeriod:c.checkins.total,topGyms:d.topGyms},
 friends:{totalFriendships:d.friends.accepted,pendingRequests:d.friends.pending,
 acceptanceRatePct:(d.friends.accepted+d.friends.pending)>0 ? 100*d.friends.accepted/(d.friends.accepted+d.friends.pending) : 0,
 avgFriendsPerUser:d.friends.eligibleUsers>0 ? 2*d.friends.accepted/d.friends.eligibleUsers : 0},
 premiumSubscribers:d.premiumAccounts,gymCheckinsTableRows:c.checkins.total,fetchErrors:[]};
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
