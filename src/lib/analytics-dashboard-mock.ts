/**
 * Mock analytics payloads for the Growth dashboard.
 * Replace `getAnalyticsDashboardData()` with Supabase RPC / edge responses when ready.
 */

/** `0` in RPC / JSON = all time (same as `"all"` in the app). */
export type TimePeriod = 1 | 7 | 30 | "all";

/** Top cities shown on growth dashboard (SQL + charts). */
export const GROWTH_TOP_CITIES_LIMIT = 10;

/** One bucket for time-series / bar charts */
export interface LabeledCount {
  label: string;
  value: number;
}

export interface PlatformActivitySnapshot {
  dau: number;
  wau: number;
  mau: number;
  /** 0–1 */
  dauMauRatio: number;
  mostActiveCity: string;
  totalWorkouts: number;
}

/**
 * Shape matches what we expect from a future `get_growth_dashboard(p_period_days)` RPC.
 */
export interface GrowthDashboardPayload {
  periodDays: TimePeriod;
  totalUsers: number;
  newSignUps: number;
  /** Users with ≥1 meaningful action in period (workout, routine, post/comment, message, check-in, feed) */
  activeUsers: number;
  workoutsLogged: number;
  newPremiumSubscribers: number;
  newRoutinesCreated: number;
  signUpsOverTime: LabeledCount[];
  workoutsOverTime: LabeledCount[];
  /** New premium in each bucket (same bucket layout as time series) */
  premiumBuckets: LabeledCount[];
  /** New routines per bucket */
  routinesBuckets: LabeledCount[];
  usersByCity: LabeledCount[];
  usersByGender: LabeledCount[];
  usersByAgeGroup: LabeledCount[];
  platformActivity: PlatformActivitySnapshot;
}

export function growthBucketCount(period: TimePeriod): number {
  switch (period) {
    case 1:
      return 8;
    case 7:
      return 7;
    case 30:
    case "all":
      return 12;
    default:
      return 7;
  }
}

/** @deprecated use growthBucketCount */
function bucketCount(period: TimePeriod): number {
  return growthBucketCount(period);
}

function pseudo(i: number, period: TimePeriod, salt: number): number {
  const p = period === "all" ? 30 : period;
  const x = Math.sin(i * 12.9898 + p * 2.718 + salt * 3.141) * 10000;
  return Math.abs(Math.floor(x)) % 97;
}

function makeSeries(
  period: TimePeriod,
  labelsFn: (i: number, n: number) => string,
  base: number,
  variance: number,
  salt: number
): LabeledCount[] {
  const n = bucketCount(period);
  return Array.from({ length: n }, (_, i) => ({
    label: labelsFn(i, n),
    value: Math.max(
      0,
      Math.round(base + (pseudo(i, period, salt) / 97) * variance - variance * 0.35)
    ),
  }));
}

function cityLabels(): string[] {
  return [
    "Riyadh",
    "Jeddah",
    "Dammam",
    "Mecca",
    "Medina",
    "Khobar",
    "Dhahran",
    "Taif",
    "Abha",
    "Tabuk",
  ];
}

function timeBucketLabel(period: TimePeriod, i: number): string {
  if (period === 1) {
    const hrs = ["12a", "3a", "6a", "9a", "12p", "3p", "6p", "9p"];
    return hrs[i] ?? `H${i + 1}`;
  }
  if (period === 7) {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return days[i] ?? `D${i + 1}`;
  }
  if (period === "all") {
    return `B${i + 1}`;
  }
  return `D${i + 1}`;
}

/**
 * Zero-filled payload with the same bucket layout as live/hybrid charts — no fabricated KPIs.
 * Used when Supabase data is unavailable and `NEXT_PUBLIC_GROWTH_USE_MOCK` is not set.
 */
export function createEmptyGrowthDashboardPayload(period: TimePeriod): GrowthDashboardPayload {
  const n = growthBucketCount(period);
  const emptySeries = (): LabeledCount[] =>
    Array.from({ length: n }, (_, i) => ({ label: timeBucketLabel(period, i), value: 0 }));

  const usersByCity: LabeledCount[] = [{ label: "City not specified", value: 0 }];
  const usersByGender: LabeledCount[] = [
    { label: "Male", value: 0 },
    { label: "Female", value: 0 },
    { label: "Other", value: 0 },
    { label: "Prefer not to say", value: 0 },
    { label: "Gender not specified", value: 0 },
  ];
  const usersByAgeGroup: LabeledCount[] = [
    { label: "Under 18", value: 0 },
    { label: "18–24", value: 0 },
    { label: "25–34", value: 0 },
    { label: "35–44", value: 0 },
    { label: "45+", value: 0 },
    { label: "Age / birthdate not specified", value: 0 },
  ];

  return {
    periodDays: period,
    totalUsers: 0,
    newSignUps: 0,
    activeUsers: 0,
    workoutsLogged: 0,
    newPremiumSubscribers: 0,
    newRoutinesCreated: 0,
    signUpsOverTime: emptySeries(),
    workoutsOverTime: emptySeries(),
    premiumBuckets: emptySeries(),
    routinesBuckets: emptySeries(),
    usersByCity,
    usersByGender,
    usersByAgeGroup,
    platformActivity: {
      dau: 0,
      wau: 0,
      mau: 0,
      dauMauRatio: 0,
      mostActiveCity: "—",
      totalWorkouts: 0,
    },
  };
}

/**
 * TODO: swap for `const { data } = await supabase.rpc('get_growth_dashboard', { p_days: period })`
 */
export function getMockAnalyticsDashboard(period: TimePeriod): GrowthDashboardPayload {
  const n = bucketCount(period);
  const mult = period === 1 ? 0.14 : period === 7 ? 1 : period === "all" ? 6 : 4.25;
  /** `"all"` must not be used in arithmetic (`"all" * n` → NaN); treat like 30d scale for mock curves. */
  const periodScalar = period === "all" ? 30 : period;

  const totalUsers = 12847 + Math.round(periodScalar * 31);
  const newSignUps = Math.round((38 + periodScalar * 6) * mult);
  const activeUsers = Math.round(
    newSignUps * 3.8 + 95 * mult + pseudo(1, period, 2)
  );
  const workoutsLogged = Math.round(activeUsers * 2.6 + 180 * mult);
  const newPremiumSubscribers = Math.round((4 + periodScalar * 0.5) * mult);
  const newRoutinesCreated = Math.round((22 + periodScalar * 3) * mult);

  const labelFor = (i: number): string => {
    if (period === 1) {
      const hrs = ["12a", "3a", "6a", "9a", "12p", "3p", "6p", "9p"];
      return hrs[i] ?? `${i}`;
    }
    if (period === 7) {
      const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      return days[i] ?? `D${i + 1}`;
    }
    if (period === "all") {
      return `B${i + 1}`;
    }
    return `D${i + 1}`;
  };

  const signUpsOverTime = makeSeries(period, labelFor, newSignUps / n, newSignUps * 0.35, 1);
  const workoutsOverTime = makeSeries(
    period,
    labelFor,
    workoutsLogged / n,
    workoutsLogged * 0.25,
    3
  );
  const premiumBuckets = makeSeries(
    period,
    labelFor,
    newPremiumSubscribers / n,
    Math.max(2, newPremiumSubscribers * 0.4),
    5
  );
  const routinesBuckets = makeSeries(
    period,
    labelFor,
    newRoutinesCreated / n,
    newRoutinesCreated * 0.35,
    7
  );

  const namedCities = cityLabels()
    .map((city, i) => ({
      label: city,
      value: Math.round((600 - i * 45 + pseudo(i, period, 11)) * mult * 0.08),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, Math.max(1, GROWTH_TOP_CITIES_LIMIT - 1));

  const cityUnspecified = Math.max(
    80,
    Math.round(totalUsers * (0.06 + (pseudo(8, period, 11) % 40) / 400))
  );
  const usersByCity = [...namedCities, { label: "City not specified", value: cityUnspecified }].sort(
    (a, b) => b.value - a.value
  );

  const genderSpecified = [
    { label: "Male", value: 52 },
    { label: "Female", value: 44 },
    { label: "Other", value: 2 },
    { label: "Prefer not to say", value: 2 },
  ].map((g, i) => ({
    ...g,
    value: Math.max(1, Math.round(g.value * (0.92 + pseudo(i, period, 13) / 400))),
  }));
  const genderUnspecified = Math.max(
    64,
    Math.round(totalUsers * (0.045 + (pseudo(5, period, 13) % 35) / 500))
  );
  const usersByGender = [...genderSpecified, { label: "Gender not specified", value: genderUnspecified }];

  const ageKnown = ["Under 18", "18–24", "25–34", "35–44", "45+"].map((label, i) => ({
    label,
    value: Math.max(12, Math.round((1200 - i * 180 + pseudo(i, period, 17)) * mult * 0.15)),
  }));
  const ageUnspecified = Math.max(
    48,
    Math.round(totalUsers * (0.055 + (pseudo(3, period, 17) % 45) / 500))
  );
  const usersByAgeGroup = [...ageKnown, { label: "Age / birthdate not specified", value: ageUnspecified }];

  const dau = Math.round(activeUsers * 0.22 + 40 * mult);
  const wau = Math.round(activeUsers * 0.78 + 120 * mult);
  const mau = Math.round(activeUsers * 1.05 + 200 * mult);
  const dauMauRatio = mau > 0 ? Math.round((dau / mau) * 1000) / 1000 : 0;

  const platformActivity: PlatformActivitySnapshot = {
    dau,
    wau,
    mau,
    dauMauRatio,
    mostActiveCity: usersByCity.find((c) => c.label !== "City not specified")?.label ?? usersByCity[0]?.label ?? "—",
    totalWorkouts: workoutsLogged,
  };

  return {
    periodDays: period,
    totalUsers,
    newSignUps,
    activeUsers,
    workoutsLogged,
    newPremiumSubscribers,
    newRoutinesCreated,
    signUpsOverTime,
    workoutsOverTime,
    premiumBuckets,
    routinesBuckets,
    usersByCity: usersByCity,
    usersByGender,
    usersByAgeGroup,
    platformActivity,
  };
}
