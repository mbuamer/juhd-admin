"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
type Report={id:string;description:string;status:string;created_at:string;user_id:string};
type Reply={id:string;body:string;staff:boolean;image_path:string|null;created_at:string};
export default function SupportInbox(){
 const [ar,setAr]=useState(false),[rows,setRows]=useState<Report[]>([]),[selected,setSelected]=useState<Report|null>(null),[replies,setReplies]=useState<Reply[]>([]),[filter,setFilter]=useState(""),[more,setMore]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(false),[body,setBody]=useState(""),[status,setStatus]=useState("reviewed"),[file,setFile]=useState<File|null>(null),[pending,setPending]=useState<string|null>(null);
 const t=(en:string,arabic:string)=>ar?arabic:en;
 async function load(next=false){setError(false);try{const c=createClient();const r=await c.rpc("support_list",{p_before:next?rows.at(-1)?.created_at:null,p_status:filter||null,p_before_id:next?rows.at(-1)?.id:null});if(r.error)throw r.error;const page=r.data.map((x:Report & {support_needs_info?:boolean})=>({...x,status:x.support_needs_info?"needs_info":x.status}));setRows(old=>next?[...old,...page]:page);setMore(r.data.length===50);}catch{setError(true);}}
 async function open(r:Report){setError(false);setSelected(r);setBody("");setFile(null);setPending(null);setStatus(r.status);setReplies([]);try{const q=await createClient().from("report_replies").select("*").eq("report_id",r.id).order("created_at").order("id");if(q.error)throw q.error;setReplies(q.data);}catch{setError(true);}}
 useEffect(()=>{void load();},[filter]); // server filtering occurs before pagination
 async function send(){if(!selected||busy)return;if(file&&(file.type!=="image/jpeg"||file.size>5*1024*1024)){setError(true);return;}setBusy(true);setError(false);const id=pending??crypto.randomUUID();setPending(id);try{
  const c=createClient();const auth=await c.auth.getUser();if(!auth.data.user)throw Error();let path:string|null=null;
  if(file){if(file.type!=="image/jpeg"||file.size>5*1024*1024)throw Error();path=`${auth.data.user.id}/${selected.id}/${id}.jpg`;await c.storage.from("report-private").upload(path,file,{contentType:"image/jpeg",upsert:false});}
  const result=await c.rpc("support_reply",{p_id:id,p_report:selected.id,p_body:body,p_image:path,p_status:status});if(result.error)throw result.error;
  const updated={...selected,status};await open(updated);await load();
 }catch{setError(true);}finally{setBusy(false);}}
 const statuses=["pending","reviewed","needs_info","resolved"];
 const label=(s:string)=>({pending:t("Received","تم الاستلام"),reviewed:t("Under review","قيد المراجعة"),needs_info:t("Waiting for reply","بانتظار الرد"),resolved:t("Resolved","تم الحل")}[s]??s);
 return <main dir={ar?"rtl":"ltr"} className="p-6 max-w-5xl space-y-5">
  <div className="flex gap-4 items-center"><h1 className="text-2xl font-bold">{t("Support reports","بلاغات الدعم")}</h1><button onClick={()=>setAr(!ar)}>{ar?"English":"العربية"}</button></div>
  <p>{t("Local preview. Replies are visible to the reporter. Push delivery is simulated.","معاينة محلية. تظهر الردود لصاحب البلاغ. إرسال إشعارات الدفع محاكى.")}</p>
  <select aria-label={t("Status","الحالة")} value={filter} onChange={e=>setFilter(e.target.value)} className="text-black p-2"><option value="">{t("All","الكل")}</option>{statuses.map(s=><option key={s} value={s}>{label(s)}</option>)}</select>
  <button onClick={()=>void load()}>{t("Refresh","تحديث")}</button>
  {!selected&&error&&<p role="alert">{t("Couldn’t load reports. Retry.","تعذر تحميل البلاغات. أعد المحاولة.")}</p>}
  {rows.map(r=><button key={r.id} onClick={()=>void open(r)} className="block w-full text-start rounded-xl border p-4"><strong>{label(r.status)} · {r.id.slice(0,8)}</strong><p className="whitespace-pre-wrap line-clamp-2">{r.description}</p></button>)}
  {more&&<button onClick={()=>void load(true)}>{t("Load more","تحميل المزيد")}</button>}
  {selected&&<section role="dialog" aria-modal="true" aria-label={t("Report conversation","محادثة البلاغ")} className="fixed inset-0 z-50 bg-black/80 p-5 overflow-y-auto"><div className="max-w-2xl mx-auto bg-zinc-900 text-white rounded-xl p-6 space-y-5">
   <button onClick={()=>setSelected(null)} disabled={busy}>{t("Close","إغلاق")}</button><h2>{selected.id}</h2><p className="whitespace-pre-wrap">{selected.description}</p>
   {replies.map(r=><article key={r.id} className="border rounded-xl p-4"><strong>{r.staff?t("Support","الدعم"):t("Reporter","صاحب البلاغ")}</strong><p className="whitespace-pre-wrap">{r.body}</p>{r.image_path&&<PrivateImage path={r.image_path}/>}</article>)}
   {error&&<p role="alert" className="text-red-400">{t("Couldn’t confirm the request. Retry; your reply is retained.","تعذر تأكيد الطلب. أعد المحاولة؛ تم الاحتفاظ بردك.")}</p>}
   <label className="block">{t("Reply visible to user","رد يظهر للمستخدم")}<textarea maxLength={4000} value={body} disabled={busy||!!pending} onChange={e=>setBody(e.target.value)} className="block w-full bg-zinc-800 p-3 min-h-32"/></label>
   <label className="block">{t("Screenshot (JPEG, up to 5 MB)","لقطة شاشة (JPEG، حتى 5 ميجابايت)")}<input type="file" accept="image/jpeg" disabled={busy||!!pending} onChange={e=>setFile(e.target.files?.[0]??null)}/></label>
   <select aria-label={t("New status","الحالة الجديدة")} value={status} disabled={busy||!!pending} onChange={e=>setStatus(e.target.value)} className="bg-zinc-800 p-3">{statuses.map(s=><option key={s} value={s}>{label(s)}</option>)}</select>
   <p>{t("A reply or resolution creates an in-app update. No internal notes are sent.","يُنشئ الرد أو الحل تحديثًا داخل التطبيق. لا تُرسل ملاحظات داخلية.")}</p>
   <button onClick={()=>void send()} disabled={busy||(!body.trim()&&!file)} className="bg-red-600 rounded-xl p-3">{busy?t("Sending…","جارٍ الإرسال…"):t("Send reply and update","إرسال الرد والتحديث")}</button>
  </div></section>}
 </main>;
}
function PrivateImage({path}:{path:string}){const [url,setURL]=useState<string>();useEffect(()=>{let active=true;void createClient().storage.from("report-private").createSignedUrl(path,120).then(r=>{if(active)setURL(r.data?.signedUrl);});return()=>{active=false;};},[path]);return url?<a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Report screenshot / لقطة شاشة البلاغ" className="max-h-64 object-contain"/></a>:<p>Image unavailable / الصورة غير متاحة</p>;}
