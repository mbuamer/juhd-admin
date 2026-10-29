import type {SupabaseClient} from '@supabase/supabase-js';
export interface MeasuredPush {
 contractVersion:1;periodDays:number;timezone:'Asia/Riyadh';generatedAt:string;
 accepted:number;failed:number;skipped:number;mature:number;opened:number;returned:number;continued:number;openRate:number|null;firstRecorded:string|null;
}
export function parseMeasuredPush(raw:unknown,period:number):MeasuredPush|null {
 if(!raw||typeof raw!=='object')return null;
 const r=raw as MeasuredPush;
 if(r.contractVersion!==1||r.periodDays!==period||r.timezone!=='Asia/Riyadh'||!Number.isFinite(Date.parse(r.generatedAt)))return null;
 if(!['accepted','failed','skipped','mature','opened','returned','continued'].every(k=>Number.isSafeInteger(r[k as keyof MeasuredPush])&&Number(r[k as keyof MeasuredPush])>=0))return null;
 if(r.mature>r.accepted||r.opened>r.mature||r.returned>r.opened||r.continued>r.opened)return null;
 if(r.mature===0?r.openRate!==null:typeof r.openRate!=='number'||Math.abs(r.openRate-Math.round(1000*r.opened/r.mature)/10)>0.001)return null;
 if(r.firstRecorded!==null&&!Number.isFinite(Date.parse(r.firstRecorded)))return null;
 return r;
}
export async function fetchMeasuredPush(client:SupabaseClient,period:number):Promise<MeasuredPush|null>{
 try{const {data,error}=await client.rpc('get_admin_push_measured',{p_period_days:period}).abortSignal(AbortSignal.timeout(20000));return error?null:parseMeasuredPush(data,period);}catch{return null;}
}
