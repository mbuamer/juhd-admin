"use client";
import {useCallback,useEffect,useState} from "react";
import {createClient} from "@/lib/supabase";
type State={enabled:boolean;state:string;reason:string|null;checked_at:string|null};
type Run={id:string;started_at:string;finished_at:string|null;status:number|null;result:{chatDeleted?:number;reportDeleted?:number;retry?:number;held?:number;budgetExhausted?:boolean}|null};
type Email={id:string;kind:string;created_at:string;sent_at:string|null;suppressed_at:string|null;review_required:boolean};
export type ReviewData={state:State;runs:Run[];emails:Email[]};
export default function Operations({reviewData}:{reviewData?:ReviewData}){
 const [state,setState]=useState<State|null>(null),[runs,setRuns]=useState<Run[]>([]),[emails,setEmails]=useState<Email[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const load=useCallback(async()=>{setLoading(true);setError('');try{
  if(reviewData){setState(reviewData.state);setRuns(reviewData.runs);setEmails(reviewData.emails);return;}
  const db=createClient();const [s,r,e]=await Promise.all([db.from('cleanup_monitor_state').select('enabled,state,reason,checked_at').single(),db.from('cleanup_monitor_runs').select('id,started_at,finished_at,status,result').order('started_at',{ascending:false}).limit(20),db.from('cleanup_monitor_emails').select('id,kind,created_at,sent_at,suppressed_at,review_required').order('created_at',{ascending:false}).limit(10)]);
  if(s.error||r.error||e.error)throw Error('Monitoring unavailable. Check backend deployment and admin access.');
  setState(s.data);setRuns(r.data??[]);setEmails(e.data??[]);
 }catch(e){setState(null);setRuns([]);setEmails([]);setError(e instanceof Error?e.message:'Unable to load monitoring');}finally{setLoading(false);}},[reviewData]);
 useEffect(()=>{void load();const timer=setInterval(()=>void load(),60000);return()=>clearInterval(timer);},[load]);
 const time=(v:string|null)=>v?new Date(v).toLocaleString():'Not recorded';
 const stale=state?.enabled&&(!state.checked_at||Date.now()-Date.parse(state.checked_at)>15*60000);
 return <div className="p-6 max-w-6xl space-y-6"><div className="flex justify-between"><h1 className="text-2xl font-bold">Operations</h1><button disabled={loading} onClick={()=>void load()} className="rounded-lg bg-zinc-200 dark:bg-zinc-700 px-4 py-2">{loading?'Loading…':'Refresh'}</button></div>
 {error&&<p role="alert" className="text-red-500">{error}</p>}
 {state&&<section className="rounded-xl bg-white dark:bg-zinc-800 p-5 space-y-2"><h2 className="text-xl font-semibold">Media cleanup</h2><p>{!state.enabled?'Disabled':stale?'Monitoring stale — status unknown':state.state==='alert'?'Needs attention':state.state==='healthy'?'Last check healthy':'Waiting for first successful run'}</p><p className="text-sm text-zinc-500">Last monitor check: {time(state.checked_at)}</p><p className="text-sm">Alerts: mohammedbuamer@gmail.com. Two consecutive failures or 45 minutes without success. This page does not enable cleanup.</p></section>}
 <section><h2 className="text-lg font-semibold mb-3">Recent runs</h2><div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr>{['Started','Result','Chat removed','Report images removed','Held','Retry','Budget reached'].map(x=><th className="p-2" key={x}>{x}</th>)}</tr></thead><tbody>{runs.map(r=><tr key={r.id} className="border-t border-zinc-300 dark:border-zinc-700"><td className="p-2">{time(r.started_at)}</td><td className="p-2">{!r.finished_at?'Pending / unknown':r.status===null?'Transport outcome unknown':`HTTP ${r.status}`}</td><td className="p-2">{r.result?.chatDeleted??'—'}</td><td className="p-2">{r.result?.reportDeleted??'—'}</td><td className="p-2">{r.result?.held??'—'}</td><td className="p-2">{r.result?.retry??'—'}</td><td className="p-2">{r.result?.budgetExhausted===undefined?'—':r.result.budgetExhausted?'Yes':'No'}</td></tr>)}</tbody></table></div>{!loading&&!error&&!runs.length&&<p>No instrumented runs yet.</p>}</section>
 <section><h2 className="text-lg font-semibold mb-3">Alert delivery</h2>{emails.map(e=><p key={e.id}>{time(e.created_at)} · {e.kind==='send_failure'?'Failure alert':'Recovery'} · {e.suppressed_at?'Suppressed while disabled':e.review_required?'Needs manual delivery review':e.sent_at?'Accepted by email provider':'Pending or retrying'}</p>)}{!loading&&!error&&!emails.length&&<p>No alert events yet.</p>}<p className="text-sm text-zinc-500 mt-3">Provider acceptance does not prove inbox delivery. Unknown outcomes are not automatically replayed after the idempotency window.</p></section>
 </div>;
}
