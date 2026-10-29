'use client';
import {useEffect,useState} from 'react';
import {createClient} from '@/lib/supabase';
import {fetchMeasuredPush,type MeasuredPush} from '@/lib/measured-push';
export function PushSection({refreshCount}:{refreshCount:number}){
 const [period,setPeriod]=useState(30);const [data,setData]=useState<MeasuredPush|null>(null);const [loading,setLoading]=useState(true);
 useEffect(()=>{let cancelled=false;setLoading(true);void(async()=>{let next=null;try{next=await fetchMeasuredPush(createClient(),period);}catch{}if(!cancelled){setData(next);setLoading(false);}})();return()=>{cancelled=true;};},[period,refreshCount]);
 return <section aria-label="Push reporting" aria-busy={loading}><h2 className="text-xl font-semibold">Push notifications & observed returns</h2>
 <p className="my-3 text-sm text-zinc-400">Counts notifications, not devices. APNs acceptance is not proof of delivery. Opening telemetry requires the updated app; missing events and older apps can undercount opens.</p>
 <label>Send period <select className="ml-3 rounded-lg bg-zinc-800 p-2" value={period} onChange={e=>setPeriod(Number(e.target.value))}>{[1,7,30,365].map(n=><option value={n} key={n}>{n===1?'Today':`Last ${n} days`}</option>)}</select></label>
 {loading?<p className="mt-5" role="status">Loading push reporting…</p>:!data?<p className="mt-5" role="status">Unavailable — push reporting could not be loaded.</p>:!data.firstRecorded?<p className="mt-5">No instrumented sends recorded. Historical push_sent flags are not delivery evidence.</p>:<>
 <div className="my-5 grid gap-3 sm:grid-cols-3">{[
 ['APNs accepted',data.accepted],['Failed only',data.failed],['Skipped only',data.skipped],['Accepted · 24h elapsed',data.mature],['Opened within 24h',data.opened],['Observed open rate',data.openRate===null?'Not mature':`${data.openRate}%`],['Taps while inactive/background',data.returned],['Further tab activity within 30m',data.continued],['Awaiting full 24h',data.accepted-data.mature]
 ].map(([label,value])=><article className="rounded-xl border border-white/10 p-4" key={label}><h3 className="text-sm text-zinc-400">{label}</h3><p className="mt-3 text-2xl">{value}</p></article>)}</div>
 <p className="text-sm text-zinc-400">Open and follow-up counts use only accepted notifications whose full 24-hour window has ended. Duplicate taps count once per notification. A user can open several notifications, and activity can follow more than one open; these are associations, not causal lift. Inbox taps are excluded. Skipped includes disabled preferences or no device tokens. Failed-only excludes notifications with any accepted attempt.</p>
 <p className="mt-3 text-xs text-zinc-500">Saudi calendar periods · role-test and designated QA excluded · retained records only. Tracking began {new Date(data.firstRecorded).toLocaleString('en-GB',{timeZone:'Asia/Riyadh'})}. Sender setup failures before recording and telemetry outages may be missing; validate coverage before interpreting rates.</p>
 </>}
 </section>;
}
