'use client';
/* Artwork is displayed immediately from a blob or local asset; image optimization is inappropriate here. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react';
import { BANNER_HEIGHT, BANNER_WIDTH, cropRect, validateArtworkFile, type ArtworkError, type BannerAsset } from '@/lib/announcements/artwork';

const labels = {
  en: { upload:'Upload image', replace:'Replace image', remove:'Remove image', spec:'1200 × 675 px · 16:9 · JPG, PNG or WebP · Maximum 5 MB', help:'Use high-resolution artwork. The saved image will be 1200 × 675 px. The preview shows the exact crop.', crop:'Adjust crop', zoom:'Zoom', horizontal:'Horizontal position', vertical:'Vertical position', save:'Crop & upload', cancel:'Cancel', uploading:'Uploading…', saved:'Uploaded locally', shared:'Shared artwork', english:'English artwork', arabic:'Arabic artwork', errors:{type:'Choose a JPG, PNG or WebP image.',size:'Choose a non-empty image no larger than 5 MB.',decode:'This image could not be opened. Try another file.',resolution:'Image is too large to process safely. Choose one under 40 megapixels.',upload:'Upload failed. Your previous image is unchanged. Retry or cancel.'} },
  ar: { upload:'رفع صورة', replace:'استبدال الصورة', remove:'إزالة الصورة', spec:'1200 × 675 بكسل · 16:9 · JPG أو PNG أو WebP · الحد الأقصى 5 ميجابايت', help:'استخدم صورة عالية الدقة. تُحفظ الصورة بحجم 1200 × 675 بكسل، وتعرض المعاينة الاقتصاص الفعلي.', crop:'ضبط الاقتصاص', zoom:'التكبير', horizontal:'الموضع الأفقي', vertical:'الموضع الرأسي', save:'اقتصاص ورفع', cancel:'إلغاء', uploading:'جارٍ الرفع…', saved:'تم الرفع محليًا', shared:'صورة مشتركة', english:'الصورة الإنجليزية', arabic:'الصورة العربية', errors:{type:'اختر صورة بصيغة JPG أو PNG أو WebP.',size:'اختر صورة غير فارغة لا يتجاوز حجمها 5 ميجابايت.',decode:'تعذّر فتح الصورة. جرّب ملفًا آخر.',resolution:'الصورة كبيرة جدًا للمعالجة. اختر صورة أقل من 40 ميجابكسل.',upload:'تعذّر الرفع. لم تتغير الصورة السابقة. أعد المحاولة أو ألغِ العملية.'} }
};
type Props = { language:'en'|'ar'; slot:'shared'|'english'|'arabic'; asset?:BannerAsset; onChange:(asset:BannerAsset|undefined)=>void; upload:(blob:Blob,signal:AbortSignal)=>Promise<BannerAsset> };
export default function BannerArtwork({language,slot,asset,onChange,upload}:Props) {
  const c=labels[language];
  const [source,setSource]=useState<HTMLImageElement|null>(null);
  const [error,setError]=useState<ArtworkError|null>(null);
  const [zoom,setZoom]=useState(1); const [x,setX]=useState(.5); const [y,setY]=useState(.5);
  const [working,setWorking]=useState(false);
  const [preparing,setPreparing]=useState(false);
  const canvas=useRef<HTMLCanvasElement>(null);
  const operation=useRef(0); const abort=useRef<AbortController|null>(null);
  useEffect(()=>()=>{operation.current++;abort.current?.abort();},[]);
  useEffect(()=>{
    const target=canvas.current; if(!source||!target)return;
    const context=target.getContext('2d'); if(!context)return;
    const r=cropRect(source.naturalWidth,source.naturalHeight,zoom,x,y);
    context.fillStyle='#101010';context.fillRect(0,0,BANNER_WIDTH,BANNER_HEIGHT);
    context.drawImage(source,r.x,r.y,r.width,r.height,0,0,BANNER_WIDTH,BANNER_HEIGHT);
  },[source,zoom,x,y]);
  async function choose(file:File) {
    const id=++operation.current;abort.current?.abort();
    const invalid=validateArtworkFile(file);setError(invalid);if(invalid)return;
    setPreparing(true);
    const url=URL.createObjectURL(file);
    try {
      const image=new Image();image.src=url;await image.decode();
      if(id!==operation.current)return;
      if(!image.naturalWidth||!image.naturalHeight)throw new Error('decode');
      if(image.naturalWidth*image.naturalHeight>40_000_000){setError('resolution');return;}
      setZoom(1);setX(.5);setY(.5);setSource(image);
    } catch {if(id===operation.current)setError('decode');}
    finally {URL.revokeObjectURL(url);if(id===operation.current)setPreparing(false);}
  }
  function cancel(){operation.current++;abort.current?.abort();setWorking(false);setPreparing(false);setSource(null);setError(null);}
  async function save(){
    if(!canvas.current||working)return;
    const id=++operation.current; const controller=new AbortController();abort.current=controller;setWorking(true);setError(null);
    try{
      const blob=await new Promise<Blob>((resolve,reject)=>canvas.current!.toBlob(b=>b?resolve(b):reject(new Error('encode')),'image/jpeg',.9));
      if(id!==operation.current)return;
      const saved=await upload(blob,controller.signal);
      if(id===operation.current){onChange(saved);setSource(null);}
    }catch{if(id===operation.current&&!controller.signal.aborted)setError('upload');}
    finally{if(id===operation.current)setWorking(false);}
  }
  return <fieldset className="ba-field" dir={language==='ar'?'rtl':'ltr'}>
    <style>{`.ba-field{border:1px solid #42434a;border-radius:12px;padding:16px;margin:16px 0}.ba-field legend{padding:0 7px;font-weight:700}.ba-field p{font-size:13px;line-height:1.6;color:#b9b9bf}.ba-field img,.ba-field canvas{display:block;width:100%;height:auto;aspect-ratio:16/9;object-fit:contain;border-radius:9px;background:#101010;margin:12px 0}.ba-field input[type=file]{display:block;margin:12px 0;max-width:100%;font-size:13px}.ba-field input::file-selector-button{background:#34353a;color:white;border:1px solid #666;border-radius:8px;padding:9px;margin-inline-end:10px}.ba-field button{background:#34353a;color:white;border:1px solid #666;border-radius:8px;padding:10px 15px;margin-inline-end:8px;margin-top:10px}.ba-field button.ba-save{background:#ff3b30;border-color:#ff3b30}.ba-field button:disabled{opacity:.5;cursor:wait}.ba-field label{display:block;font-size:13px;margin-top:12px}.ba-field input[type=range]{display:block;width:100%;accent-color:#ff3b30;direction:ltr}.ba-field .ba-error{color:#ff9e98}.ba-field h3{font-weight:700;margin:12px 0}`}</style>
    <legend>{c[slot]}</legend><p><bdi dir="ltr">1200 × 675 px · 16:9</bdi> · {language==='ar'?'JPG أو PNG أو WebP · الحد الأقصى 5 ميجابايت':'JPG, PNG or WebP · Maximum 5 MB'}</p><p>{language==='ar'?<>استخدم صورة عالية الدقة. تُحفظ الصورة بحجم <bdi dir="ltr">1200 × 675</bdi> بكسل، وتعرض المعاينة الاقتصاص الفعلي.</>:c.help}</p>
    {asset&&!source&&<><img src={asset.url} alt={c[slot]}/><p>{c.saved} · <bdi dir="ltr">{asset.width} × {asset.height}</bdi></p></>}
    <label>{asset?c.replace:c.upload}<input aria-label={`${c[slot]} — ${c.upload}`} type="file" accept="image/jpeg,image/png,image/webp" disabled={working||preparing} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void choose(f);}}/></label>
    {preparing&&<p role="status">{language==='ar'?'جارٍ تجهيز الصورة…':'Preparing image…'}</p>}
    {source&&<><h3>{c.crop}</h3><canvas ref={canvas} width={BANNER_WIDTH} height={BANNER_HEIGHT} aria-label={c.crop}/><label>{c.zoom}<input aria-label={c.zoom} type="range" min="1" max="3" step=".01" value={zoom} disabled={working} onChange={e=>setZoom(Number(e.target.value))}/></label><label>{c.horizontal}<input aria-label={c.horizontal} type="range" min="0" max="1" step=".01" value={x} disabled={working} onChange={e=>setX(Number(e.target.value))}/></label><label>{c.vertical}<input aria-label={c.vertical} type="range" min="0" max="1" step=".01" value={y} disabled={working} onChange={e=>setY(Number(e.target.value))}/></label><button className="ba-save" disabled={working} onClick={()=>void save()}>{working?c.uploading:c.save}</button><button onClick={cancel}>{c.cancel}</button></>}
    {asset&&!source&&<button onClick={()=>{cancel();onChange(undefined);}}>{c.remove}</button>}
    {error&&<p className="ba-error" role="alert">{c.errors[error]}</p>}
  </fieldset>;
}
