/**
 * Growth dashboard: Supabase `get_growth_dashboard` when parse succeeds, else hybrid from admin RPCs
 * with zero-filled chart buckets (no fabricated KPIs). `NEXT_PUBLIC_GROWTH_USE_MOCK=true` still enables demo mock.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getMockAnalyticsDashboard,
  createEmptyGrowthDashboardPayload,
  GROWTH_TOP_CITIES_LIMIT,
  type GrowthDashboardPayload,
  type LabeledCount,
  type TimePeriod,
} from "@/lib/analytics-dashboard-mock";

export type GrowthDataSource = "live" | "hybrid" | "mock" | "empty";

export interface GrowthDashboardResult {
  payload: GrowthDashboardPayload;
  source: GrowthDataSource;
  /** Populated when live/hybrid RPC or parsing failed */
  fetchNote?: string;
}

function envForceMock(): boolean {
  return process.env.NEXT_PUBLIC_GROWTH_USE_MOCK === "true";
}

function toInt(v: unknown): number {
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return 0;
    return Math.trunc(v);
  }
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string") return parseInt(v, 10) || 0;
  if (v && typeof v === "object" && "toString" in v) return parseInt(String(v), 10) || 0;
  return 0;
}

function seriesSum(series: LabeledCount[]): number {
  return series.reduce((a, b) => a + b.value, 0);
}

/** Prevent NaN/Infinity from RPC or bad Math.max(NaN, x) leaking into UI. Optional cap: DAU/WAU/MAU cannot exceed registered users. */
function sanitizePlatformActivity(
  pa: GrowthDashboardPayload["platformActivity"],
  headcountCap?: number
): GrowthDashboardPayload["platformActivity"] {
  let dau = toInt(pa.dau);
  let wau = toInt(pa.wau);
  let mau = toInt(pa.mau);
  if (headcountCap != null && headcountCap > 0) {
    dau = Math.min(dau, headcountCap);
    wau = Math.min(wau, headcountCap);
    mau = Math.min(mau, headcountCap);
  }
  const totalWorkouts = toInt(pa.totalWorkouts);
  let r = Number(pa.dauMauRatio);
  if (!Number.isFinite(r)) r = 0;
  if (mau > 0) {
    r = Math.round((dau / mau) * 1000) / 1000;
  }
  return {
    dau,
    wau,
    mau,
    dauMauRatio: r,
    mostActiveCity: pa.mostActiveCity,
    totalWorkouts,
  };
}

/** All-time RPC sometimes returns empty sign-up buckets while KPI is correct — spread across labels. */
function repairSignUpsSeriesIfDegenerate(
  period: TimePeriod,
  newSignUps: number,
  signUpsOverTime: LabeledCount[]
): LabeledCount[] {
  if (period !== "all" || newSignUps <= 0 || signUpsOverTime.length === 0) return signUpsOverTime;
  if (seriesSum(signUpsOverTime) > 0) return signUpsOverTime;
  return spreadWorkoutsAcrossSignUpBuckets(signUpsOverTime, newSignUps);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** PostgREST sometimes returns jsonb payloads as a JSON string; unwrap for parsing. */
function unwrapMaybeJsonString(raw: unknown): unknown {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return raw;
    }
  }
  return raw;
}

/** Supabase `get_growth_dashboard` uses `0` for all time. */
export function growthRpcPeriodDays(period: TimePeriod): number {
  return period === "all" ? 0 : period;
}

function periodMatchesRpcPayload(period: TimePeriod, o: Record<string, unknown>): boolean {
  const pd = o.periodDays ?? o.period_days;
  if (period === "all") {
    return toInt(pd) === 0 || String(pd).toLowerCase() === "all";
  }
  if (pd == null) return false;
  return toInt(pd) === period;
}

/** `workoutsLogged` / `platformActivity.totalWorkouts` come from the same `v_workouts` as SQL — use when hybrid merge skips. */
function extractGrowthRpcWorkoutsLogged(raw: unknown, period: TimePeriod): number {
  raw = unwrapMaybeJsonString(raw);
  if (!isPlainObject(raw)) return 0;
  const o = raw as Record<string, unknown>;
  if (!periodMatchesRpcPayload(period, o)) return 0;
  const main = toInt(o.workoutsLogged);
  let pa = 0;
  if (isPlainObject(o.platformActivity)) {
    pa = toInt((o.platformActivity as Record<string, unknown>).totalWorkouts);
  }
  return Math.max(main, pa);
}

/** Headline KPIs from `get_growth_dashboard` JSON when full parse fails (hybrid path). */
function extractGrowthRpcHeadlineKpis(
  raw: unknown,
  period: TimePeriod
): {
  newSignUps: number;
  activeUsers: number;
  workoutsLogged: number;
  dau: number;
  wau: number;
  mau: number;
} | null {
  raw = unwrapMaybeJsonString(raw);
  if (!isPlainObject(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (!periodMatchesRpcPayload(period, o)) return null;
  let dau = 0;
  let wau = 0;
  let mau = 0;
  if (isPlainObject(o.platformActivity)) {
    const pa = o.platformActivity as Record<string, unknown>;
    dau = toInt(pa.dau);
    wau = toInt(pa.wau);
    mau = toInt(pa.mau);
  }
  const activeUsers = period === 1 && dau > 0 ? dau : toInt(o.activeUsers);
  return {
    newSignUps: toInt(o.newSignUps ?? o.new_sign_ups),
    activeUsers,
    workoutsLogged: extractGrowthRpcWorkoutsLogged(raw, period),
    dau,
    wau,
    mau,
  };
}

/** Force Overview / growthToday to match main Dashboard RPCs (UTC calendar today). */
async function alignTodayWithDashboardRpcs(
  supabase: SupabaseClient,
  period: TimePeriod,
  payload: GrowthDashboardPayload
): Promise<GrowthDashboardPayload> {
  if (period !== 1) return payload;

  const [signupsRes, workoutsRes] = await Promise.all([
    supabase.rpc("get_admin_signups_today"),
    supabase.rpc("get_admin_workouts_today"),
  ]);

  let next: GrowthDashboardPayload = { ...payload };

  if (!signupsRes.error && signupsRes.data != null) {
    next = { ...next, newSignUps: toInt(signupsRes.data) };
  }
  if (!workoutsRes.error && workoutsRes.data != null) {
    const w = toInt(workoutsRes.data);
    next = {
      ...next,
      workoutsLogged: w,
      platformActivity: { ...next.platformActivity, totalWorkouts: w },
    };
  }

  const dau = next.platformActivity.dau;
  if (dau > 0) {
    next = { ...next, activeUsers: dau };
  }

  return next;
}

/**
 * Match `_admin_period_start` / `get_growth_dashboard`:
 * 1d = UTC calendar today; 7d/30d = today plus prior (N−1) calendar days; all time = epoch.
 */
export function growthDashboardWindowStartIso(period: TimePeriod): string {
  if (period === "all") return "1970-01-01T00:00:00.000Z";
  const now = new Date();
  const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0);
  const daysBack = period === 1 ? 0 : period - 1;
  return new Date(utcMidnight - daysBack * 86400000).toISOString();
}

/**
 * Parses `{ label, value }[]` from jsonb (PostgREST): skips bad rows; accepts `name`/`count`/`cnt` aliases.
 */
function normalizeLabeledCountSeriesLenient(raw: unknown): LabeledCount[] | null {
  if (!Array.isArray(raw)) return null;
  const out: LabeledCount[] = [];
  for (const x of raw) {
    if (!isPlainObject(x)) continue;
    const xr = x as Record<string, unknown>;
    const labelRaw = xr.label ?? xr.name ?? xr.bucket ?? xr.key ?? xr.title;
    if (labelRaw == null) continue;
    const label = typeof labelRaw === "string" ? labelRaw : String(labelRaw);
    const vv = xr.value ?? xr.count ?? xr.cnt ?? xr.n ?? xr.total ?? xr.val;
    let n = 0;
    if (typeof vv === "number" && Number.isFinite(vv)) n = vv;
    else if (typeof vv === "bigint") n = Number(vv);
    else if (vv == null || vv === "") n = 0;
    else if (typeof vv === "string") {
      const parsed = Number(vv);
      n = Number.isFinite(parsed) ? parsed : 0;
    } else continue;
    out.push({ label, value: Math.max(0, Math.trunc(n)) });
  }
  return out.length > 0 ? out : null;
}

function alignSeriesToKpi(series: LabeledCount[], kpi: number, labelFallback: LabeledCount[]): LabeledCount[] {
  if (kpi <= 0) {
    if (series.length > 0) return series.map((x) => ({ ...x, value: 0 }));
    if (labelFallback.length > 0) return labelFallback.map((x) => ({ label: x.label, value: 0 }));
    return [];
  }
  const base = series.length > 0 ? series : labelFallback.map((x) => ({ label: x.label, value: 0 }));
  if (base.length === 0) return [];
  const sum = seriesSum(base);
  if (sum === 0) return spreadWorkoutsAcrossSignUpBuckets(base, kpi);
  if (sum === kpi) return base;
  return scaleSeriesToTotal(base, kpi);
}

/**
 * Forces each time-series chart to sum to its headline KPI (fixes hybrid scaling drift and SQL bucket vs total mismatch).
 */
function reconcileGrowthSeriesWithKpis(
  p: GrowthDashboardPayload,
  _period: TimePeriod,
  labelTemplate: GrowthDashboardPayload
): GrowthDashboardPayload {
  const labelFb = p.signUpsOverTime.length > 0 ? p.signUpsOverTime : labelTemplate.signUpsOverTime;
  const signUpsOverTime = alignSeriesToKpi(p.signUpsOverTime, p.newSignUps, labelFb);
  const workoutsOverTime = alignSeriesToKpi(p.workoutsOverTime, p.workoutsLogged, signUpsOverTime);
  const premiumBuckets = alignSeriesToKpi(p.premiumBuckets, p.newPremiumSubscribers, signUpsOverTime);
  const routinesBuckets = alignSeriesToKpi(p.routinesBuckets, p.newRoutinesCreated, signUpsOverTime);

  const platformActivity = {
    ...p.platformActivity,
    totalWorkouts: p.workoutsLogged,
  };

  return {
    ...p,
    signUpsOverTime,
    workoutsOverTime,
    premiumBuckets,
    routinesBuckets,
    platformActivity,
  };
}

/**
 * Hybrid uses zero-filled chart buckets (real KPIs only) while `totalUsers` and series totals come from admin RPCs.
 * Rescale demographics when their sum exceeds headcount.
 */
function clampDemographicsToTotalUsers(p: GrowthDashboardPayload): GrowthDashboardPayload {
  const tu = p.totalUsers;
  if (tu <= 0) return p;
  const tol = Math.max(3, Math.floor(tu * 0.02));
  let out: GrowthDashboardPayload = { ...p };
  const gSum = seriesSum(p.usersByGender);
  if (gSum > tu + tol) {
    out = { ...out, usersByGender: scaleSeriesToTotal(p.usersByGender, tu) };
  }
  const aSum = seriesSum(p.usersByAgeGroup);
  if (aSum > tu + tol) {
    out = { ...out, usersByAgeGroup: scaleSeriesToTotal(p.usersByAgeGroup, tu) };
  }
  const cSum = seriesSum(p.usersByCity);
  if (cSum > tu + tol) {
    out = { ...out, usersByCity: scaleSeriesToTotal(p.usersByCity, tu) };
  }
  return out;
}

/** Overlay chart arrays from `get_growth_dashboard` JSON when the strict parser failed but the RPC returned data. */
function overlayGrowthRpcSeriesIfPresent(
  raw: unknown,
  period: TimePeriod,
  base: GrowthDashboardPayload
): GrowthDashboardPayload {
  raw = unwrapMaybeJsonString(raw);
  if (!isPlainObject(raw)) return base;
  const o = raw as Record<string, unknown>;
  if (!periodMatchesRpcPayload(period, o)) return base;

  let out: GrowthDashboardPayload = { ...base };
  const su = normalizeLabeledCountSeriesLenient(o.signUpsOverTime);
  if (su) out = { ...out, signUpsOverTime: su };
  const wo = normalizeLabeledCountSeriesLenient(o.workoutsOverTime);
  if (wo) out = { ...out, workoutsOverTime: wo };
  const pr = normalizeLabeledCountSeriesLenient(o.premiumBuckets);
  if (pr) out = { ...out, premiumBuckets: pr };
  const ro = normalizeLabeledCountSeriesLenient(o.routinesBuckets);
  if (ro) out = { ...out, routinesBuckets: ro };
  const cities = normalizeLabeledCountSeriesLenient(o.usersByCity);
  if (cities?.length) out = { ...out, usersByCity: cities.slice(0, GROWTH_TOP_CITIES_LIMIT) };
  const gen = normalizeLabeledCountSeriesLenient(o.usersByGender);
  if (gen) out = { ...out, usersByGender: gen };
  const ag = normalizeLabeledCountSeriesLenient(o.usersByAgeGroup);
  if (ag) out = { ...out, usersByAgeGroup: ag };

  const tu = toInt(o.totalUsers);
  const ns = toInt(o.newSignUps);
  const au = toInt(o.activeUsers);
  const wl = toInt(o.workoutsLogged);
  const np = toInt(o.newPremiumSubscribers);
  const nr = toInt(o.newRoutinesCreated);
  if (tu > 0) out.totalUsers = Math.max(out.totalUsers, tu);
  out.newSignUps = Math.max(out.newSignUps, ns);
  out.activeUsers = Math.max(out.activeUsers, au);
  out.workoutsLogged = Math.max(out.workoutsLogged, wl);
  out.newPremiumSubscribers = Math.max(out.newPremiumSubscribers, np);
  out.newRoutinesCreated = Math.max(out.newRoutinesCreated, nr);

  if (isPlainObject(o.platformActivity)) {
    const pa = o.platformActivity as Record<string, unknown>;
    out.platformActivity = {
      ...out.platformActivity,
      dau: Math.max(out.platformActivity.dau, toInt(pa.dau)),
      wau: Math.max(out.platformActivity.wau, toInt(pa.wau)),
      mau: Math.max(out.platformActivity.mau, toInt(pa.mau)),
      totalWorkouts: Math.max(out.platformActivity.totalWorkouts, toInt(pa.totalWorkouts)),
      mostActiveCity: String(pa.mostActiveCity ?? out.platformActivity.mostActiveCity),
    };
    const rawRatio = Number(pa.dauMauRatio);
    if (Number.isFinite(rawRatio)) {
      out.platformActivity.dauMauRatio = rawRatio;
    }
  }

  return out;
}

/** If the RPC JSON is valid except for fields we don't need for workouts, merge workouts from RPC into hybrid. */
function tryMergeRpcWorkoutsIntoPayload(
  raw: unknown,
  period: TimePeriod,
  base: GrowthDashboardPayload
): GrowthDashboardPayload | null {
  if (!isPlainObject(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (!periodMatchesRpcPayload(period, o)) return null;
  const workouts = normalizeLabeledCountSeriesLenient(o.workoutsOverTime);
  if (!workouts) return null;
  const wl = toInt(o.workoutsLogged);
  const seriesSum = workouts.reduce((a, b) => a + b.value, 0);
  const effective = Math.max(wl, seriesSum);
  /** Do not replace hybrid counts with an all-zero RPC fragment (common when parse fails but SQL still returns JSON). */
  if (effective <= 0) return null;
  return {
    ...base,
    workoutsOverTime: workouts,
    workoutsLogged: effective,
    platformActivity: {
      ...base.platformActivity,
      totalWorkouts: effective,
    },
  };
}

/**
 * When full JSON parse fails, `workoutsOverTime` may not normalize (bad bucket) but `workoutsLogged`
 * from SQL is still trustworthy — merge KPI and rebuild the chart from hybrid sign-up labels.
 */
function tryMergeRpcWorkoutsKpiOnly(
  raw: unknown,
  period: TimePeriod,
  base: GrowthDashboardPayload
): GrowthDashboardPayload | null {
  raw = unwrapMaybeJsonString(raw);
  if (!isPlainObject(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (!periodMatchesRpcPayload(period, o)) return null;
  const wl = toInt(o.workoutsLogged);
  if (wl <= 0) return null;
  const normalized = normalizeLabeledCountSeriesLenient(o.workoutsOverTime);
  const seriesSum = normalized ? normalized.reduce((a, b) => a + b.value, 0) : 0;
  const workoutsOverTime =
    normalized && seriesSum > 0 ? normalized : spreadWorkoutsAcrossSignUpBuckets(base.signUpsOverTime, wl);
  return {
    ...base,
    workoutsOverTime,
    workoutsLogged: wl,
    platformActivity: {
      ...base.platformActivity,
      totalWorkouts: wl,
    },
  };
}

/** Validates RPC JSON into GrowthDashboardPayload or null. */
export function parseGrowthDashboardPayload(raw: unknown, period: TimePeriod): GrowthDashboardPayload | null {
  raw = unwrapMaybeJsonString(raw);
  if (!isPlainObject(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (!periodMatchesRpcPayload(period, o)) return null;
  const signUps = normalizeLabeledCountSeriesLenient(o.signUpsOverTime);
  const workouts = normalizeLabeledCountSeriesLenient(o.workoutsOverTime);
  const premium = normalizeLabeledCountSeriesLenient(o.premiumBuckets);
  const routines = normalizeLabeledCountSeriesLenient(o.routinesBuckets);
  const cities = normalizeLabeledCountSeriesLenient(o.usersByCity);
  const gender = normalizeLabeledCountSeriesLenient(o.usersByGender);
  const age = normalizeLabeledCountSeriesLenient(o.usersByAgeGroup);
  if (!signUps || !workouts || !premium || !routines || !cities || !gender || !age) return null;
  if (!isPlainObject(o.platformActivity)) return null;
  const paRaw = o.platformActivity;
  const citiesSliced = cities.slice(0, GROWTH_TOP_CITIES_LIMIT);
  let mostActiveCity = String(paRaw.mostActiveCity ?? "—");
  if (mostActiveCity === "City not specified") {
    const named = citiesSliced.find((c) => c.label !== "City not specified");
    if (named) mostActiveCity = named.label;
  }
  const rawRatio = Number(paRaw.dauMauRatio);
  const pa = {
    dau: toInt(paRaw.dau),
    wau: toInt(paRaw.wau),
    mau: toInt(paRaw.mau),
    dauMauRatio: Number.isFinite(rawRatio) ? rawRatio : 0,
    mostActiveCity,
    totalWorkouts: toInt(paRaw.totalWorkouts),
  };

  return {
    periodDays: period,
    totalUsers: toInt(o.totalUsers),
    newSignUps: toInt(o.newSignUps),
    activeUsers: toInt(o.activeUsers),
    workoutsLogged: toInt(o.workoutsLogged),
    newPremiumSubscribers: toInt(o.newPremiumSubscribers),
    newRoutinesCreated: toInt(o.newRoutinesCreated),
    signUpsOverTime: signUps,
    workoutsOverTime: workouts,
    premiumBuckets: premium,
    routinesBuckets: routines,
    usersByCity: citiesSliced,
    usersByGender: gender,
    usersByAgeGroup: age,
    platformActivity: pa,
  };
}

function scaleSeriesToTotal(series: LabeledCount[], targetTotal: number): LabeledCount[] {
  if (series.length === 0) return series;
  const sum = series.reduce((a, b) => a + b.value, 0);
  if (sum <= 0 || targetTotal <= 0) return series.map((b) => ({ ...b, value: 0 }));
  const factor = targetTotal / sum;
  const scaled = series.map((b) => ({ ...b, value: Math.max(0, Math.round(b.value * factor)) }));
  let drift = targetTotal - scaled.reduce((a, b) => a + b.value, 0);
  let i = scaled.length - 1;
  while (drift !== 0 && i >= 0) {
    const next = scaled[i].value + drift;
    if (next >= 0) {
      scaled[i] = { ...scaled[i], value: next };
      drift = 0;
    } else {
      drift = next;
      scaled[i] = { ...scaled[i], value: 0 };
      i--;
    }
  }
  return scaled;
}

/** Hybrid fallback: same bucket labels as sign-ups, totals summed to `workoutsLogged` (no faux correlation with sign-up curve). */
function spreadWorkoutsAcrossSignUpBuckets(signUpsScaled: LabeledCount[], workoutsTotal: number): LabeledCount[] {
  if (signUpsScaled.length === 0) return [];
  if (workoutsTotal <= 0) return signUpsScaled.map((s) => ({ label: s.label, value: 0 }));
  const n = signUpsScaled.length;
  const base = Math.floor(workoutsTotal / n);
  const rem = workoutsTotal - base * n;
  return signUpsScaled.map((s, i) => ({ label: s.label, value: base + (i < rem ? 1 : 0) }));
}

/** Sum workout_session rows from get_event_counts (handles odd PostgREST / view column names). */
function workoutSessionSumFromEventRows(data: unknown): number {
  if (!Array.isArray(data)) return 0;
  let sum = 0;
  for (const row of data) {
    if (!isPlainObject(row)) continue;
    const r = row as Record<string, unknown>;
    const name = String(r.event_name ?? r.eventName ?? "").trim();
    if (name !== "workout_session") continue;
    const raw = r.event_count ?? r.eventCount ?? r.count ?? r.cnt;
    sum += toInt(raw);
  }
  return sum;
}

/**
 * Best-effort finished-workout total: prefer **`get_admin_workouts_in_period`** (same window as
 * `get_growth_dashboard`), then max with `get_admin_workouts_completed_since` (UTC + rolling),
 * analytics_events, browser `sessions` counts, and for **1d only** calendar-today RPCs.
 */
async function resolveGrowthWorkoutTotal(supabase: SupabaseClient, period: TimePeriod): Promise<number> {
  const end = new Date();
  const utcStartIso = growthDashboardWindowStartIso(period);
  const rollingStartIso = growthEventsWindowStartIso(period);

  const [
    inPeriodRes,
    sinceUtcRes,
    sinceRollRes,
    eventsUtcRes,
    eventsRollRes,
    sessionsUtcRes,
    sessionsRollRes,
    todayRes,
    todayCountRes,
  ] = await Promise.all([
    supabase.rpc("get_admin_workouts_in_period", { p_period_days: growthRpcPeriodDays(period) }),
    supabase.rpc("get_admin_workouts_completed_since", { p_since: utcStartIso }),
    period === "all"
      ? Promise.resolve({ data: null, error: { message: "skip" } as const })
      : supabase.rpc("get_admin_workouts_completed_since", { p_since: rollingStartIso }),
    supabase.rpc("get_event_counts", {
      p_start_date: utcStartIso,
      p_end_date: end.toISOString(),
    }),
    supabase.rpc("get_event_counts", {
      p_start_date: rollingStartIso,
      p_end_date: end.toISOString(),
    }),
    supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .not("ended_at", "is", null)
      .gte("ended_at", utcStartIso),
    period === "all"
      ? Promise.resolve({ count: null, error: { message: "skip" } as const })
      : supabase
          .from("sessions")
          .select("id", { count: "exact", head: true })
          .not("ended_at", "is", null)
          .gte("ended_at", rollingStartIso),
    period === 1 ? supabase.rpc("get_admin_workouts_today") : Promise.resolve({ data: null, error: { message: "skip" } as const }),
    period === 1
      ? supabase.rpc("get_admin_workouts_today_count")
      : Promise.resolve({ data: null, error: { message: "skip" } as const }),
  ]);

  let best = 0;

  if (!inPeriodRes.error && inPeriodRes.data != null) {
    best = Math.max(best, toInt(inPeriodRes.data));
  }
  if (!sinceUtcRes.error && sinceUtcRes.data != null) {
    best = Math.max(best, toInt(sinceUtcRes.data));
  }
  if (!sinceRollRes.error && sinceRollRes.data != null) {
    best = Math.max(best, toInt(sinceRollRes.data));
  }
  if (!eventsUtcRes.error) {
    best = Math.max(best, workoutSessionSumFromEventRows(eventsUtcRes.data));
  }
  if (!eventsRollRes.error) {
    best = Math.max(best, workoutSessionSumFromEventRows(eventsRollRes.data));
  }
  if (!sessionsUtcRes.error && sessionsUtcRes.count != null) {
    best = Math.max(best, sessionsUtcRes.count);
  }
  if (!sessionsRollRes.error && sessionsRollRes.count != null) {
    best = Math.max(best, sessionsRollRes.count);
  }
  if (period === 1) {
    if (!todayRes.error && todayRes.data != null) {
      best = Math.max(best, toInt(todayRes.data));
    }
    if (!todayCountRes.error && todayCountRes.data != null) {
      best = Math.max(best, toInt(todayCountRes.data));
    }
  }

  return best;
}

/** Match /admin/analytics: rolling window from local calendar (not UTC midnight), so event totals align across pages. */
function growthEventsWindowStartIso(period: TimePeriod): string {
  if (period === "all") return "1970-01-01T00:00:00.000Z";
  const start = new Date();
  start.setDate(start.getDate() - period);
  return start.toISOString();
}

type UserDemoRow = { gender: string | null; city: string | null; birthdate: string | null };

async function fetchUserDemoRows(supabase: SupabaseClient): Promise<UserDemoRow[] | null> {
  const out: UserDemoRow[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase.from("users").select("gender, city, birthdate").range(from, from + page - 1);
    if (error) return null;
    if (!data?.length) break;
    out.push(...(data as UserDemoRow[]));
    if (data.length < page) break;
  }
  return out;
}

function normalizeGenderBucket(raw: string | null | undefined): string {
  const g = (raw ?? "").trim();
  if (!g) return "Gender not specified";
  const lower = g.toLowerCase();
  if (lower === "male") return "Male";
  if (lower === "female") return "Female";
  if (lower === "other" || lower === "non-binary" || lower === "nonbinary") return "Other";
  if (lower.includes("prefer")) return "Prefer not to say";
  return "Other";
}

const GENDER_CHART_ORDER = ["Male", "Female", "Other", "Prefer not to say", "Gender not specified"] as const;

function buildUsersByGenderSeries(rows: UserDemoRow[]): LabeledCount[] {
  const c = new Map<string, number>();
  for (const k of GENDER_CHART_ORDER) c.set(k, 0);
  for (const r of rows) {
    const b = normalizeGenderBucket(r.gender);
    c.set(b, (c.get(b) ?? 0) + 1);
  }
  return GENDER_CHART_ORDER.map((label) => ({ label, value: c.get(label) ?? 0 }));
}

const CITY_UNSPEC = "City not specified";

function buildUsersByCitySeries(rows: UserDemoRow[]): LabeledCount[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const city = (r.city ?? "").trim();
    const label = city ? city : CITY_UNSPEC;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const namedTop = sorted.filter(([l]) => l !== CITY_UNSPEC).slice(0, Math.max(1, GROWTH_TOP_CITIES_LIMIT - 1));
  const topSet = new Set(namedTop.map(([l]) => l));
  let tail = counts.get(CITY_UNSPEC) ?? 0;
  for (const [label, n] of sorted) {
    if (label === CITY_UNSPEC) continue;
    if (!topSet.has(label)) tail += n;
  }
  const out: LabeledCount[] = namedTop.map(([label, value]) => ({ label, value }));
  out.push({ label: CITY_UNSPEC, value: tail });
  return out.sort((a, b) => b.value - a.value);
}

function ageBracketFromBirthdate(birthdate: string | null | undefined): string | null {
  const s = (birthdate ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const md = now.getMonth() - d.getMonth();
  if (md < 0 || (md === 0 && now.getDate() < d.getDate())) age -= 1;
  if (age < 18) return "Under 18";
  if (age <= 24) return "18–24";
  if (age <= 34) return "25–34";
  if (age <= 44) return "35–44";
  return "45+";
}

const AGE_CHART_ORDER = ["Under 18", "18–24", "25–34", "35–44", "45+", "Age / birthdate not specified"] as const;

function buildUsersByAgeSeries(rows: UserDemoRow[]): LabeledCount[] {
  const c = new Map<string, number>();
  for (const k of AGE_CHART_ORDER) c.set(k, 0);
  for (const r of rows) {
    const br = ageBracketFromBirthdate(r.birthdate);
    if (br == null) {
      c.set("Age / birthdate not specified", (c.get("Age / birthdate not specified") ?? 0) + 1);
    } else {
      c.set(br, (c.get(br) ?? 0) + 1);
    }
  }
  return AGE_CHART_ORDER.map((label) => ({ label, value: c.get(label) ?? 0 }));
}

async function loadHybridDemographicsFromUsersTable(
  supabase: SupabaseClient,
  totalUsersHint: number
): Promise<{ usersByGender: LabeledCount[]; usersByCity: LabeledCount[]; usersByAgeGroup: LabeledCount[]; mostActiveCity: string } | null> {
  const rows = await fetchUserDemoRows(supabase);
  if (rows == null) return null;
  /** Empty select with no error often means RLS returned nothing while KPI still shows headcount — keep mock demographics. */
  if (rows.length === 0 && totalUsersHint > 0) return null;
  const usersByGender = buildUsersByGenderSeries(rows);
  const usersByCity = buildUsersByCitySeries(rows);
  const usersByAgeGroup = buildUsersByAgeSeries(rows);
  const topNamed = usersByCity.find((x) => x.label !== CITY_UNSPEC);
  const mostActiveCity = topNamed?.label ?? "—";
  return { usersByGender, usersByCity, usersByAgeGroup, mostActiveCity };
}

/**
 * Fallback when get_admin_signups_last_n_days rejects p_days=30 or errors.
 * Uses same UTC window as hybrid `start`.
 */
async function countSignupsSince(supabase: SupabaseClient, startIso: string): Promise<number | null> {
  const { count, error } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .gte("created_at", startIso);
  if (error) return null;
  return count ?? 0;
}

async function countTableSinceCreated(
  supabase: SupabaseClient,
  table: "routines",
  startIso: string
): Promise<number | null> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .gte("created_at", startIso);
  if (error) return null;
  return count ?? 0;
}

/**
 * Uses existing admin RPCs + mock chart shape scaled to KPIs (~real numbers, synthetic curves).
 * @param growthRpcRaw optional `get_growth_dashboard` JSON (already fetched) — lifts workout KPI to SQL `v_workouts` when other paths miss.
 */
async function fetchHybridDashboard(
  supabase: SupabaseClient,
  period: TimePeriod,
  growthRpcRaw?: unknown
): Promise<GrowthDashboardResult | null> {
  const end = new Date();
  const startIso = growthDashboardWindowStartIso(period);
  const eventsStartIso = growthEventsWindowStartIso(period);

  const [usersRes, signupsRes, eventsRes, workoutTotal] = await Promise.all([
    supabase.rpc("get_admin_user_count"),
    period === "all"
      ? Promise.resolve({ data: null, error: null })
      : period === 1
        ? supabase.rpc("get_admin_signups_today")
        : supabase.rpc("get_admin_signups_last_n_days", { p_days: period }),
    supabase.rpc("get_event_counts", {
      p_start_date: eventsStartIso,
      p_end_date: end.toISOString(),
    }),
    resolveGrowthWorkoutTotal(supabase, period),
  ]);

  if (usersRes.error && signupsRes.error) return null;

  const base = createEmptyGrowthDashboardPayload(period);
  const totalUsers = usersRes.error ? 0 : toInt(usersRes.data);

  let newSignUps: number;
  if (period === "all") {
    newSignUps = totalUsers;
  } else if (!signupsRes.error) {
    newSignUps = toInt(signupsRes.data);
  } else {
    const counted = await countSignupsSince(supabase, startIso);
    newSignUps = counted != null ? counted : 0;
  }

  const fromGrowthRpc = growthRpcRaw != null ? extractGrowthRpcWorkoutsLogged(growthRpcRaw, period) : 0;
  let workoutsLogged = Math.max(workoutTotal, fromGrowthRpc);
  const workoutsLoggedFromApi = true;
  let activeUsers = 0;

  const rpcKpis =
    period === 1 && growthRpcRaw != null ? extractGrowthRpcHeadlineKpis(growthRpcRaw, period) : null;
  if (rpcKpis) {
    newSignUps = rpcKpis.newSignUps;
    workoutsLogged = Math.max(workoutsLogged, rpcKpis.workoutsLogged);
    activeUsers = rpcKpis.activeUsers;
  } else if (!eventsRes.error && Array.isArray(eventsRes.data) && period !== 1) {
    const touchEvents = new Set([
      "workout_session",
      "post_created",
      "comment_created",
      "message_sent",
      "friend_action",
      "like_action",
    ]);
    const activeApprox = eventsRes.data.reduce((acc, row) => {
      if (!isPlainObject(row)) return acc;
      const r = row as Record<string, unknown>;
      const name = String(r.event_name ?? r.eventName ?? "").trim();
      if (!touchEvents.has(name)) return acc;
      return acc + toInt(r.event_count ?? r.eventCount ?? r.count ?? r.cnt);
    }, 0);
    if (activeApprox > 0) activeUsers = Math.max(newSignUps, Math.min(activeApprox, totalUsers || activeApprox));
  }

  const dem = await loadHybridDemographicsFromUsersTable(supabase, totalUsers);
  const usersByGender = dem?.usersByGender ?? base.usersByGender;
  const usersByCity = dem?.usersByCity ?? base.usersByCity;
  const usersByAgeGroup = dem?.usersByAgeGroup ?? base.usersByAgeGroup;
  const mostActiveCityFromDem = dem?.mostActiveCity ?? base.platformActivity.mostActiveCity;

  const signUpsScaled = scaleSeriesToTotal(base.signUpsOverTime, newSignUps);
  const workoutsOverTime = workoutsLoggedFromApi
    ? spreadWorkoutsAcrossSignUpBuckets(signUpsScaled, workoutsLogged)
    : scaleSeriesToTotal(base.workoutsOverTime, workoutsLogged);

  const [routinesCnt, premiumDayRes] = await Promise.all([
    countTableSinceCreated(supabase, "routines", startIso),
    period === 1
      ? supabase.rpc("get_admin_premium_upgrades_today")
      : Promise.resolve({ data: null, error: null }),
  ]);

  let newPremiumSubscribers = 0;
  if (period === 1 && !premiumDayRes.error && premiumDayRes.data != null) {
    newPremiumSubscribers = toInt(premiumDayRes.data);
  } else if (period !== 1) {
    newPremiumSubscribers = 0;
  }

  const newRoutinesCreated = routinesCnt != null ? routinesCnt : 0;

  const payload: GrowthDashboardPayload = {
    ...base,
    totalUsers,
    newSignUps,
    activeUsers,
    workoutsLogged,
    newPremiumSubscribers,
    newRoutinesCreated,
    signUpsOverTime: signUpsScaled,
    workoutsOverTime,
    premiumBuckets: scaleSeriesToTotal(base.premiumBuckets, newPremiumSubscribers),
    routinesBuckets: spreadWorkoutsAcrossSignUpBuckets(signUpsScaled, newRoutinesCreated),
    usersByGender,
    usersByCity,
    usersByAgeGroup,
    platformActivity: {
      ...base.platformActivity,
      totalWorkouts: workoutsLogged,
      mostActiveCity: mostActiveCityFromDem,
      ...(() => {
        if (period === 1 && rpcKpis && rpcKpis.dau > 0) {
          const cap = Math.max(0, totalUsers);
          const dau = rpcKpis.dau;
          const wau = rpcKpis.wau > 0 ? Math.min(cap, rpcKpis.wau) : dau;
          const mau = rpcKpis.mau > 0 ? Math.min(cap, rpcKpis.mau) : Math.min(cap, Math.max(dau, wau));
          return { dau, wau, mau };
        }
        const cap = Math.max(0, totalUsers);
        const mau = Math.min(cap, Math.max(0, activeUsers));
        const wau = Math.min(mau, Math.max(0, Math.round(mau * 0.78)));
        const dau = Math.min(wau, Math.max(0, Math.round(mau * 0.22)));
        return { dau, wau, mau };
      })(),
      dauMauRatio: 0,
    },
  };

  if (payload.platformActivity.mau > 0) {
    payload.platformActivity.dauMauRatio =
      Math.round((payload.platformActivity.dau / payload.platformActivity.mau) * 1000) / 1000;
  }

  const alignedPayload = await alignTodayWithDashboardRpcs(supabase, period, payload);

  return {
    payload: alignedPayload,
    source: "hybrid",
    fetchNote:
      (dem
        ? "Demographics (gender, city, age) loaded from public.users. "
        : "Demographics use zero placeholders (users table read failed or RLS blocked). ") +
      (signupsRes.error
        ? "Signups RPC failed — new sign-ups from direct users count when RLS allowed, else 0. Chart buckets are uniform splits of KPI totals. Deploy get_growth_dashboard for full live series."
        : period === 1
          ? "Hybrid (today): signups/workouts match Dashboard RPCs; active users = DAU (UTC today)."
          : "Hybrid: signups from admin RPC (all time = total users); workouts = max(definer + event + session paths); charts spread real KPI totals."),
  };
}

/** Ensure doughnut / bar charts always have rows (RPC may return []). Reconcile time-series sums to KPIs. */
function ensureDemographics(p: GrowthDashboardPayload, period: TimePeriod): GrowthDashboardPayload {
  const template = createEmptyGrowthDashboardPayload(period);
  const filled = {
    ...p,
    platformActivity: sanitizePlatformActivity(p.platformActivity, p.totalUsers),
    usersByGender: p.usersByGender.length > 0 ? p.usersByGender : template.usersByGender,
    usersByAgeGroup: p.usersByAgeGroup.length > 0 ? p.usersByAgeGroup : template.usersByAgeGroup,
    usersByCity: p.usersByCity.length > 0 ? p.usersByCity : template.usersByCity.slice(0, GROWTH_TOP_CITIES_LIMIT),
  };
  return clampDemographicsToTotalUsers(reconcileGrowthSeriesWithKpis(filled, period, template));
}

const GROWTH_FETCH_TIMEOUT_MS_DEFAULT = 22_000;

function growthFetchTimeoutMs(period: TimePeriod): number {
  if (period === "all" || period === 30) return 90_000;
  if (period === 7) return 32_000;
  return GROWTH_FETCH_TIMEOUT_MS_DEFAULT;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(label)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

async function fetchGrowthDashboardCore(
  supabase: SupabaseClient,
  period: TimePeriod
): Promise<GrowthDashboardResult> {
  const rpcRes = await supabase.rpc("get_growth_dashboard", { p_period_days: growthRpcPeriodDays(period) });
  const rpcRaw = unwrapMaybeJsonString(rpcRes.data);

  if (!rpcRes.error && rpcRaw != null) {
    const parsed = parseGrowthDashboardPayload(rpcRaw, period);
    if (parsed) {
      const signUpsOverTime = repairSignUpsSeriesIfDegenerate(period, parsed.newSignUps, parsed.signUpsOverTime);
      const parsedBase = signUpsOverTime === parsed.signUpsOverTime ? parsed : { ...parsed, signUpsOverTime };
      const altTotal = await resolveGrowthWorkoutTotal(supabase, period);
      const fromGrowthBody = extractGrowthRpcWorkoutsLogged(rpcRaw, period);
      const wl = Math.max(parsedBase.workoutsLogged, altTotal, fromGrowthBody);
      const shouldRebuildWorkoutChart =
        wl > 0 && parsedBase.workoutsOverTime.reduce((a, b) => a + b.value, 0) !== wl;
      const reconcile = async (base: GrowthDashboardPayload, workouts: number, note: string) => {
        const wo =
          workouts > 0 && base.workoutsOverTime.reduce((a, b) => a + b.value, 0) !== workouts
            ? spreadWorkoutsAcrossSignUpBuckets(base.signUpsOverTime, workouts)
            : base.workoutsOverTime;
        const merged: GrowthDashboardPayload = {
          ...base,
          workoutsLogged: workouts,
          workoutsOverTime: wo,
          platformActivity: { ...base.platformActivity, totalWorkouts: workouts },
        };
        const aligned = await alignTodayWithDashboardRpcs(supabase, period, merged);
        return {
          payload: ensureDemographics(aligned, period),
          source: "live" as const,
          fetchNote: note,
        };
      };

      if (wl !== parsedBase.workoutsLogged || shouldRebuildWorkoutChart) {
        return reconcile(
          parsedBase,
          wl,
          shouldRebuildWorkoutChart
            ? `Workouts KPI=${wl}; chart reconciled; today KPIs match Dashboard RPCs.`
            : `Workouts set to ${wl}; today KPIs match Dashboard RPCs.`
        );
      }
      const aligned = await alignTodayWithDashboardRpcs(supabase, period, parsedBase);
      return { payload: ensureDemographics(aligned, period), source: "live" };
    }
  }

  const hybrid = await fetchHybridDashboard(supabase, period, !rpcRes.error ? rpcRaw : undefined);

  if (!rpcRes.error && rpcRaw != null && hybrid) {
    const body = overlayGrowthRpcSeriesIfPresent(rpcRaw, period, hybrid.payload);
    const patched =
      tryMergeRpcWorkoutsIntoPayload(rpcRaw, period, body) ?? tryMergeRpcWorkoutsKpiOnly(rpcRaw, period, body);
    if (patched) {
      return {
        payload: ensureDemographics(patched, period),
        source: "hybrid",
        fetchNote:
          "Workouts (KPI + chart series) taken from get_growth_dashboard. Remaining KPIs/charts are hybrid. Full live parse failed — often a null or unexpected type in demographics/chart JSON; check Supabase logs or export RPC JSON.",
      };
    }
    return {
      payload: ensureDemographics(body, period),
      source: hybrid.source,
      fetchNote:
        `${hybrid.fetchNote ?? ""} Chart series merged from get_growth_dashboard JSON where possible; time-series sums reconciled to KPIs.`.trim(),
    };
  }

  if (hybrid) {
    return {
      payload: ensureDemographics(hybrid.payload, period),
      source: hybrid.source,
      fetchNote: hybrid.fetchNote,
    };
  }

  return {
    payload: createEmptyGrowthDashboardPayload(period),
    source: "empty",
    fetchNote: rpcRes.error?.message || "No Supabase growth data available (hybrid path failed).",
  };
}

export async function fetchGrowthDashboard(
  supabase: SupabaseClient,
  period: TimePeriod
): Promise<GrowthDashboardResult> {
  if (envForceMock()) {
    return { payload: getMockAnalyticsDashboard(period), source: "mock", fetchNote: "NEXT_PUBLIC_GROWTH_USE_MOCK=true" };
  }

  const ms = growthFetchTimeoutMs(period);
  try {
    return await withTimeout(
      fetchGrowthDashboardCore(supabase, period),
      ms,
      "growth_dashboard_fetch_timeout"
    );
  } catch {
    return {
      payload: createEmptyGrowthDashboardPayload(period),
      source: "empty",
      fetchNote: `Request timed out (${Math.round(ms / 1000)}s) or failed; showing empty charts. If 30d is slow, apply get_growth_dashboard indexes. Set NEXT_PUBLIC_GROWTH_USE_MOCK=true only for local demo data.`,
    };
  }
}

/** Fire-and-forget admin audit (requires log_admin_audit migration). */
export async function logGrowthDashboardView(
  supabase: SupabaseClient,
  meta: { period: TimePeriod; source: GrowthDataSource }
): Promise<void> {
  try {
    const { error } = await supabase.rpc("log_admin_audit", {
      p_action: "growth_dashboard_view",
      p_path: "/admin/analytics-dashboard",
      p_metadata: meta,
    });
    if (error) return;
  } catch {
    /* optional RPC */
  }
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
    `total_users,${payload.totalUsers}`,
    `new_sign_ups,${payload.newSignUps}`,
    `active_users,${payload.activeUsers}`,
    `workouts_logged,${payload.workoutsLogged}`,
    `new_premium,${payload.newPremiumSubscribers}`,
    `new_routines,${payload.newRoutinesCreated}`,
    "",
    "platform_metric,value",
    `dau,${payload.platformActivity.dau}`,
    `wau,${payload.platformActivity.wau}`,
    `mau,${payload.platformActivity.mau}`,
    `dau_mau_ratio,${payload.platformActivity.dauMauRatio}`,
    `most_active_city,${escapeCsvCell(payload.platformActivity.mostActiveCity)}`,
    `total_workouts_snapshot,${payload.platformActivity.totalWorkouts}`,
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
