"use client";
import {useEffect,useState} from "react";
import {createClient} from "@/lib/supabase";
import {fetchMeasuredRetention,type MeasuredRetention,type RetentionCell} from "@/lib/measured-retention";
import type {DetailPeriod} from "@/lib/measured-details";
const display=(c:RetentionCell)=>c.percent===null?(c.waiting===c.signups?'Not mature':'Unavailable'):`${c.percent}%`;
async function loadRetention(period:DetailPeriod){return fetchMeasuredRetention(createClient(),period);}
export function RetentionSection({refreshCount,load=loadRetention}:{refreshCount:number;load?:(period:DetailPeriod)=>Promise<MeasuredRetention|null>}){
 const [period,setPeriod]=useState<DetailPeriod>(30);
 const [result,setResult]=useState<{period:DetailPeriod;data:MeasuredRetention|null}|null>(null);
 const [loading,setLoading]=useState(true);
 useEffect(()=>{
  let cancelled=false;
  setLoading(true);
  async function refresh(){
   let data:MeasuredRetention|null=null;
   try{data=await load(period);}catch{/* Configuration and transport failures are unavailable, not a stuck spinner. */}
   if(!cancelled){setResult({period,data});setLoading(false);}
  }
  void refresh();
  return()=>{cancelled=true;};
 },[period,refreshCount,load]);
 const data=result?.period===period?result.data:null;
 return <section aria-label="Retention reporting" aria-busy={loading}>
  <h2 className="text-xl font-semibold">Retention · D1 / D7 / D30</h2>
  <p className="mt-2 text-sm text-zinc-400">Users who returned on exactly the 1st, 7th or 30th Saudi calendar day after signup. The return day must have ended. QA accounts are excluded.</p>
  <label className="my-5 block text-sm">Signup cohorts <select className="ml-3 rounded-lg bg-zinc-800 p-2" value={period} onChange={e=>setPeriod(Number(e.target.value) as DetailPeriod)}>{[[1,'Today'],[7,'Last 7 days'],[30,'Last 30 days'],[365,'Last 365 days'],[0,'All retained signups']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
  {loading?<p role="status">Loading retention…</p>:!data?<p role="status">Unavailable — retention data could not be loaded.</p>:data.cohortCount===0?<p>No eligible signups in this period.</p>:<>
   <div className="grid gap-4 sm:grid-cols-3">{data.summary.map(c=><article key={c.day} className="rounded-xl border border-white/10 bg-white/[0.03] p-5"><h3>D{c.day}</h3><p className="my-3 text-3xl font-semibold">{display(c)}</p><p className="text-sm text-zinc-400">{c.returned} returned / {c.eligible} measured users</p><p className="mt-2 text-xs text-zinc-500">{c.waiting} awaiting full return day · {c.unobserved} excluded: unverified tracking</p></article>)}</div>
   <p className="my-5 text-sm text-zinc-400">Percentages are weighted by eligible users, not averages of cohort percentages. Only audited tracking dates count. Missing coverage is not zero retention. This measures recorded foreground use, not whether a push notification caused a return.</p>
   <div className="max-h-[36rem] overflow-auto"><table className="w-full text-left text-sm"><caption className="pb-3 text-left">Daily signup cohorts · {data.cohortCount} retained accounts</caption><thead><tr>{['Signup date','Users','D1','D7','D30'].map(h=><th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{data.cohorts.map(row=><tr key={row.date} className="border-t border-white/10"><th className="p-3 font-normal">{row.date}</th><td className="p-3">{row.milestones[0].signups}</td>{row.milestones.map(c=><td key={c.day} className="p-3">{display(c)}{c.eligible>0&&<span className="block text-xs text-zinc-500">{c.returned}/{c.eligible}</span>}</td>)}</tr>)}</tbody></table></div>
  </>}
  {!loading&&data&&<p className="mt-5 text-xs text-zinc-500">{data.coverage.length?`${data.coverage.length} audited tracking interval(s).`:'No tracking coverage has been verified yet.'} Deleted accounts and missing telemetry cannot be reconstructed. Updated {new Date(data.generatedAt).toLocaleString('en-GB',{timeZone:'Asia/Riyadh'})} (Saudi time).</p>}
 </section>;
}
