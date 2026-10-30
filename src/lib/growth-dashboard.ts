/** Only the versioned measured RPC may supply headline metrics. No legacy fallbacks. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createEmptyGrowthDashboardPayload, type GrowthDashboardPayload, type LabeledCount, type TimePeriod } from "@/lib/analytics-dashboard-mock";
export type GrowthDataSource = "live" | "hybrid" | "mock" | "empty";
export const GROWTH_TEST_USER_EXCLUSION_NOTE = "Excludes role=test and designated QA accounts. Reporting timezone: Asia/Riyadh.";
export interface GrowthDashboardResult {
  payload: GrowthDashboardPayload;
  source: GrowthDataSource;
  fetchNote?: string;
  generatedAt?: string;
  premiumAccounts?: number;
}
export function growthRpcPeriodDays(period: TimePeriod) { return period === "all" ? 0 : period; }
const counters = ["totalUsers", "newSignUps", "activeUsers", "workoutsLogged", "newPremiumSubscribers", "newRoutinesCreated"] as const;
function count(v: unknown): v is number { return typeof v === "number" && Number.isSafeInteger(v) && v >= 0; }
function series(v: unknown): v is LabeledCount[] {
  return Array.isArray(v) && v.every(r => r && typeof r.label === "string" && count(r.value));
}
export function parseGrowthDashboardPayload(raw: unknown, period: TimePeriod): GrowthDashboardPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.contractVersion !== 1 || r.periodDays !== growthRpcPeriodDays(period) || r.timezone !== "Asia/Riyadh") return null;
  const result = createEmptyGrowthDashboardPayload(period);
  result.unavailable = [];
  for (const key of counters) {
    if (r[key] === null) { result[key] = 0; result.unavailable.push(key); }
    else if (count(r[key])) result[key] = r[key];
    else return null;
  }
  for (const key of ["signUpsOverTime", "workoutsOverTime", "premiumBuckets", "routinesBuckets", "usersByCity", "usersByGender", "usersByAgeGroup"] as const) {
    if (!series(r[key])) return null;
    result[key] = r[key];
  }
  const pa = r.platformActivity as Record<string, unknown> | undefined;
  if (!pa) return null;
  for (const key of ["dau", "wau", "mau", "totalWorkouts"] as const) {
    if (pa[key] === null) { result.platformActivity[key] = 0; result.unavailable.push(key); }
    else if (count(pa[key])) result.platformActivity[key] = pa[key];
    else return null;
  }
  result.platformActivity.mostActiveCity = typeof pa.mostActiveCity === "string" ? pa.mostActiveCity : "Unavailable";
  result.platformActivity.dauMauRatio = typeof pa.dauMauRatio === "number" ? pa.dauMauRatio : 0;
  if (pa.dauMauRatio == null) result.unavailable.push("dauMauRatio");
  // Reject inconsistent datasets; never scale/reconcile measured values.
  for (const [key, rows] of [["newSignUps", result.signUpsOverTime], ["workoutsLogged", result.workoutsOverTime], ["newRoutinesCreated", result.routinesBuckets]] as const) {
    if (rows.reduce((n,r) => n+r.value,0) !== result[key]) return null;
  }
  if (result.platformActivity.totalWorkouts !== result.workoutsLogged) return null;
  return result;
}
export async function fetchGrowthDashboard(supabase: SupabaseClient, period: TimePeriod): Promise<GrowthDashboardResult> {
  try {
    const { data, error } = await supabase.rpc("get_admin_growth_measured", { p_period_days: growthRpcPeriodDays(period), p_timezone: "Asia/Riyadh" }).abortSignal(AbortSignal.timeout(20000));
    const payload = error ? null : parseGrowthDashboardPayload(data, period);
    if (payload) return { payload, source: "live", generatedAt: data.generatedAt,
      premiumAccounts: count(data.premiumAccounts) ? data.premiumAccounts : undefined,
      fetchNote: GROWTH_TEST_USER_EXCLUSION_NOTE + " Activity counts reflect observed foreground events only; historical coverage is incomplete. Verified subscription starts unavailable pending ledger validation." };
  } catch { /* Fail closed, with no legacy estimate or direct-table fallback. */ }
  const payload = createEmptyGrowthDashboardPayload(period);
  payload.unavailable = [...counters, "dau", "wau", "mau", "dauMauRatio", "totalWorkouts"];
  for (const key of ["signUpsOverTime", "workoutsOverTime", "premiumBuckets", "routinesBuckets", "usersByCity", "usersByGender", "usersByAgeGroup"] as const) payload[key] = [];
  return { payload, source: "empty", fetchNote: "Unavailable: measured reporting endpoint is missing, failed, or returned invalid data. No estimated fallback is used." };
}
/** One seven-day snapshot supplies all headline totals; use server time at midnight boundaries. */
export function growthHeadlines(result: GrowthDashboardResult) {
  const p = result.payload;
  const available = result.source === "live" && p.periodDays === 7;
  const metric = (key: "totalUsers" | "newSignUps") =>
    available && !p.unavailable?.includes(key) ? p[key] : null;
  const generated = new Date(result.generatedAt ?? "");
  let day: string | undefined;
  if (Number.isFinite(generated.getTime())) {
    const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(generated);
    const part = (name: string) => parts.find(p => p.type === name)?.value;
    day = `${part("year")}-${part("month")}-${part("day")}`;
  }
  const daily = (rows: LabeledCount[]) => available && day ? rows.find(r => r.label === day)?.value ?? null : null;
  return {
    userCount: metric("totalUsers"),
    signupsToday: daily(p.signUpsOverTime),
    signups7d: metric("newSignUps"),
    premiumCount: available ? result.premiumAccounts ?? null : null,
    // Subscription starts are not inferred from current account roles.
    premiumUpgradesToday: null,
    workoutsToday: daily(p.workoutsOverTime),
  };
}
export async function logGrowthDashboardView(supabase: SupabaseClient, meta: { period: TimePeriod; source: GrowthDataSource }) {
  try { await supabase.rpc("log_admin_audit", { p_action: "growth_dashboard_view", p_path: "/admin/analytics-dashboard", p_metadata: meta }); } catch { /* nonblocking */ }
}

function escapeCsvCell(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function chartSeriesToCsv(title: string, rows: LabeledCount[]): string {
  const lines = [
    escapeCsvCell(title),
    "label,value",
    ...rows.map((r) => `${escapeCsvCell(r.label)},${r.value}`),
  ];
  return lines.join("\n");
}

export function growthDashboardSummaryCsv(payload: GrowthDashboardPayload, source: GrowthDataSource): string {
  const lines = [
    "JUHD Growth dashboard export",
    `generated_utc,${new Date().toISOString()}`,
    `data_source,${source}`,
    `period_days,${payload.periodDays}`,
    "",
    "kpi,value",
    `total_users,${payload.unavailable?.includes("totalUsers") ? "Unavailable" : payload.totalUsers}`,
    `new_sign_ups,${payload.unavailable?.includes("newSignUps") ? "Unavailable" : payload.newSignUps}`,
    `active_users,${payload.unavailable?.includes("activeUsers") ? "Unavailable" : payload.activeUsers}`,
    `workouts_logged,${payload.unavailable?.includes("workoutsLogged") ? "Unavailable" : payload.workoutsLogged}`,
    `new_premium,${payload.unavailable?.includes("newPremiumSubscribers") ? "Unavailable" : payload.newPremiumSubscribers}`,
    `new_routines,${payload.unavailable?.includes("newRoutinesCreated") ? "Unavailable" : payload.newRoutinesCreated}`,
    "",
    "platform_metric,value",
    `dau,${payload.unavailable?.includes("dau") ? "Unavailable" : payload.platformActivity.dau}`,
    `wau,${payload.unavailable?.includes("wau") ? "Unavailable" : payload.platformActivity.wau}`,
    `mau,${payload.unavailable?.includes("mau") ? "Unavailable" : payload.platformActivity.mau}`,
    `dau_mau_ratio,${payload.unavailable?.includes("dauMauRatio") ? "Unavailable" : payload.platformActivity.dauMauRatio}`,
    `most_active_city,${escapeCsvCell(payload.platformActivity.mostActiveCity)}`,
    `total_workouts_snapshot,${payload.unavailable?.includes("totalWorkouts") ? "Unavailable" : payload.platformActivity.totalWorkouts}`,
  ];
  return lines.join("\n");
}

export function growthDashboardFullCsv(payload: GrowthDashboardPayload, source: GrowthDataSource): string {
  const blocks: string[] = [growthDashboardSummaryCsv(payload, source), "", "---", ""];
  const add = (name: string, rows: LabeledCount[]) => {
    blocks.push(chartSeriesToCsv(name, rows), "", "---", "");
  };
  add("sign_ups_over_time", payload.signUpsOverTime);
  add("workouts_over_time", payload.workoutsOverTime);
  add("premium_buckets", payload.premiumBuckets);
  add("routines_buckets", payload.routinesBuckets);
  add("users_by_city", payload.usersByCity);
  add("users_by_gender", payload.usersByGender);
  add("users_by_age_group", payload.usersByAgeGroup);
  return blocks.join("\n");
}
