import type { SupabaseClient } from "@supabase/supabase-js";
import type { LabeledCount } from "@/lib/analytics-dashboard-mock";
export type DetailPeriod = 0 | 1 | 7 | 30 | 365;
export type WindowCounts = {total:number;today:number;week:number;month:number;year:number;selected:number};
export type DetailKind = "posts" | "comments" | "likes" | "reposts" | "checkins" | "bugReports" | "postReports";
export interface MeasuredDetails {
 contractVersion:1; periodDays:DetailPeriod; timezone:"Asia/Riyadh"; generatedAt:string;
 counts:Record<DetailKind,WindowCounts>;
 breakdowns:Record<string,{city:LabeledCount[];gender:LabeledCount[]}>;
 premiumAccounts:number; pendingBugReports:number; pendingPostReports:number;
 topGyms:{gymName:string;checkinCount:number}[];
 topUsersWorkouts:{userId:string;username:string;count:number}[];
 postsByType:Record<string,number>;
 friends:{accepted:number;pending:number;eligibleUsers:number};
 activeHour:LabeledCount[]; activeWeekday:LabeledCount[];
 unavailable:string[];
}
const validCount = (n:unknown):n is number => typeof n === "number" && Number.isSafeInteger(n) && n>=0;
const object = (v:unknown):v is Record<string,unknown> => !!v && typeof v==='object' && !Array.isArray(v);
const rows = (v:unknown) => Array.isArray(v) && v.every(r=>object(r)&&typeof r.label==='string'&&validCount(r.value));
export function parseMeasuredDetails(raw:unknown,period:DetailPeriod):MeasuredDetails|null {
 if(!object(raw)||raw.contractVersion!==1||raw.periodDays!==period||raw.timezone!=="Asia/Riyadh"||typeof raw.generatedAt!=="string") return null;
 if(!object(raw.counts)||!object(raw.breakdowns)||!object(raw.friends)||!object(raw.postsByType)) return null;
 for(const key of ["posts","comments","likes","reposts","checkins","bugReports","postReports"]) {
  const v=raw.counts[key];
  if(!object(v)||!["total","today","week","month","year","selected"].every(k=>validCount(v[k]))) return null;
 }
 for(const key of ["signups","workouts","posts","comments","likes","checkins"]) {
  const b=raw.breakdowns[key]; if(!object(b)||!rows(b.city)||!rows(b.gender)) return null;
 }
 if(![raw.premiumAccounts,raw.pendingBugReports,raw.pendingPostReports,...Object.values(raw.friends),...Object.values(raw.postsByType)].every(validCount)) return null;
 if(!["accepted","pending","eligibleUsers"].every(k=>validCount((raw.friends as Record<string,unknown>)[k]))) return null;
 if(!Array.isArray(raw.topGyms)||!raw.topGyms.every(r=>object(r)&&typeof r.gymName==='string'&&validCount(r.checkinCount))) return null;
 if(!Array.isArray(raw.topUsersWorkouts)||!raw.topUsersWorkouts.every(r=>object(r)&&typeof r.userId==='string'&&typeof r.username==='string'&&validCount(r.count))) return null;
 if(!rows(raw.activeHour)||!rows(raw.activeWeekday)||!Array.isArray(raw.unavailable)||!raw.unavailable.every(v=>typeof v==='string')) return null;
 return raw as unknown as MeasuredDetails;
}
export async function fetchMeasuredDetails(client:SupabaseClient,period:DetailPeriod):Promise<MeasuredDetails|null> {
 try {
  const {data,error}=await client.rpc("get_admin_details_measured",{p_period_days:period,p_timezone:"Asia/Riyadh"}).abortSignal(AbortSignal.timeout(20000));
  return error ? null : parseMeasuredDetails(data,period);
 } catch { return null; }
}
