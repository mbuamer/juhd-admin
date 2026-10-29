'use client';
import {useCallback,useState} from 'react';
import {RetentionSection} from '../admin/analytics-dashboard/RetentionSection';
import fixture from '../../../validation/measured-growth/retention-fixture.json';
import {parseMeasuredRetention,type MeasuredRetention} from '@/lib/measured-retention';
import type {DetailPeriod} from '@/lib/measured-details';
export default function Review(){
 const [scenario,setScenario]=useState('Measured');
 const [refresh,setRefresh]=useState(0);
 const [narrow,setNarrow]=useState(false);
 const load=useCallback(async(period:DetailPeriod):Promise<MeasuredRetention|null>=>{
  await new Promise(r=>setTimeout(r,scenario==='Slow'?2500:300));
  if(scenario==='Error')throw new Error('Synthetic failure');
  if(scenario==='Unavailable')return null;
  const d=structuredClone(parseMeasuredRetention(fixture,0)!);d.periodDays=period;
  if(scenario==='Empty'||period===1){d.cohortCount=0;d.summary=[];d.cohorts=[];}
  if(scenario==='No coverage'){
   d.coverage=[];
   for(const c of [...d.summary,...d.cohorts.flatMap(c=>c.milestones)]){c.unobserved+=c.eligible;c.eligible=0;c.returned=0;c.percent=null;}
  }
  return parseMeasuredRetention(d,period);
 },[scenario]);
 return <main className="min-h-screen bg-[#0a0a0b] p-6 text-zinc-100"><p className="mb-4 text-amber-300">LOCAL UI REVIEW · synthetic data · no database connections</p><div className="mb-6 flex flex-wrap gap-3"><label>Scenario <select className="bg-zinc-800 p-2" value={scenario} onChange={e=>setScenario(e.target.value)}>{['Measured','Empty','Unavailable','Error','No coverage','Slow'].map(s=><option key={s}>{s}</option>)}</select></label><button className="rounded bg-zinc-800 px-3" onClick={()=>setRefresh(n=>n+1)}>Refresh fixture</button><button className="rounded bg-zinc-800 px-3" onClick={()=>setNarrow(n=>!n)}>Toggle narrow preview</button></div><div style={{maxWidth:narrow?375:1200}} className="mx-auto"><RetentionSection refreshCount={refresh} load={load}/></div></main>;
}
