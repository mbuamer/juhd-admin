"use client";
import {useMemo,useState} from 'react';
import Operations,{type ReviewData} from '../admin/operations/operations-panel';
export default function Review(){
 const [mode,setMode]=useState('alert');
 const data=useMemo<ReviewData>(()=>{const now=new Date().toISOString();return {
 state:{enabled:mode!=='disabled',state:mode==='stale'?'healthy':mode,reason:null,checked_at:mode==='stale'?'2020-01-01T00:00:00Z':now},
 runs:[{id:'1',started_at:now,finished_at:now,status:503,result:null},{id:'2',started_at:now,finished_at:now,status:200,result:{chatDeleted:2,reportDeleted:1,held:3,retry:0,budgetExhausted:true}},{id:'3',started_at:now,finished_at:null,status:null,result:null}],
 emails:[{id:'1',kind:'send_failure',created_at:now,sent_at:mode==='healthy'?now:null,suppressed_at:mode==='disabled'?now:null,review_required:mode==='stale'}]
 };},[mode]);
 return <main><div className="p-6"><p>Synthetic local preview — no database or emails</p><label>Preview state <select value={mode} onChange={e=>setMode(e.target.value)} className="border p-2">{['alert','healthy','disabled','stale'].map(x=><option key={x}>{x}</option>)}</select></label></div><Operations reviewData={data}/></main>;
}
