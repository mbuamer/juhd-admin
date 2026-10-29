import type { SupabaseClient } from "@supabase/supabase-js";
import type { DetailPeriod } from "./measured-details";
export interface RetentionCell {
 day:1|7|30; signups:number; waiting:number; unobserved:number; eligible:number; returned:number; percent:number|null;
}
export interface MeasuredRetention {
 contractVersion:1; periodDays:DetailPeriod; timezone:"Asia/Riyadh"; generatedAt:string;
 definition:"exact_calendar_day"; cohortCount:number; summary:RetentionCell[];
 cohorts:{date:string;milestones:RetentionCell[]}[]; coverage:{start:string;end:string}[];
}
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const count=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const date=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
function cell(v:unknown):v is RetentionCell {
 if(!obj(v)||![1,7,30].includes(v.day as number)||![v.signups,v.waiting,v.unobserved,v.eligible,v.returned].every(count))return false;
 const c=v as unknown as RetentionCell;
 return c.waiting+c.unobserved+c.eligible===c.signups&&c.returned<=c.eligible&&
 (c.eligible===0?c.percent===null:typeof c.percent==='number'&&Math.abs(c.percent-Math.round(1000*c.returned/c.eligible)/10)<0.001);
}
function cells(v:unknown):v is RetentionCell[]{return Array.isArray(v)&&v.length===3&&v.every(cell)&&v.every((c,i)=>c.day===[1,7,30][i]);}
export function parseMeasuredRetention(raw:unknown,period:DetailPeriod):MeasuredRetention|null {
 if(!obj(raw)||raw.contractVersion!==1||raw.periodDays!==period||raw.timezone!=='Asia/Riyadh'||raw.definition!=='exact_calendar_day'||typeof raw.generatedAt!=='string'||!Number.isFinite(Date.parse(raw.generatedAt))||!count(raw.cohortCount))return null;
 if(!Array.isArray(raw.cohorts)||!Array.isArray(raw.coverage)||!raw.coverage.every(c=>obj(c)&&date(c.start)&&date(c.end)&&c.end>=c.start))return null;
 if(!raw.cohorts.every(c=>obj(c)&&date(c.date)&&cells(c.milestones)))return null;
 if(raw.cohortCount===0){if(!Array.isArray(raw.summary)||raw.summary.length||raw.cohorts.length)return null;}
 else if(!cells(raw.summary))return null;
 const r=raw as unknown as MeasuredRetention;
 if(new Set(r.cohorts.map(c=>c.date)).size!==r.cohorts.length)return null;
 for(const [i,s] of r.summary.entries()){
  if(s.signups!==r.cohortCount)return null;
  for(const key of ['signups','waiting','unobserved','eligible','returned'] as const)
   if(r.cohorts.reduce((n,c)=>n+c.milestones[i][key],0)!==s[key])return null;
 }
 return r;
}
export type RetentionFailure = 'timeout'|'access'|'backend'|'contract'|'network';
export async function fetchRetentionResult(client:SupabaseClient,period:DetailPeriod):Promise<{data:MeasuredRetention|null;failure:RetentionFailure|null}>{
 try{
  const {data,error}=await client.rpc('get_admin_retention_measured',{p_period_days:period}).abortSignal(AbortSignal.timeout(20000));
  if(error){
   const timeout=error.code==='57014'||/timeout|timed out|aborted/i.test(error.message??'');
   return {data:null,failure:timeout?'timeout':error.code==='42501'||error.code==='PGRST301'?'access':'backend'};
  }
  const parsed=parseMeasuredRetention(data,period);
  return {data:parsed,failure:parsed?null:'contract'};
 }catch(e){return {data:null,failure:e instanceof Error&&['TimeoutError','AbortError'].includes(e.name)?'timeout':'network'};}
}
export async function fetchMeasuredRetention(client:SupabaseClient,period:DetailPeriod):Promise<MeasuredRetention|null>{
 return (await fetchRetentionResult(client,period)).data;
}
