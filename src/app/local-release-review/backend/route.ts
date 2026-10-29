// Synthetic local administrator only. Never forwards production configuration.
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createClient} from '@supabase/supabase-js';
import sharp from 'sharp';
import {randomUUID} from 'node:crypto';
import {releaseOperation} from '@/lib/announcements/release-service';
export const runtime='nodejs';
function allowed(r:Request){
 const host=r.headers.get('host')??'';
 return process.env.NODE_ENV==='development'&&process.env.JUHD_LOCAL_UI_REVIEW==='1'&&['127.0.0.1:3000','localhost:3000'].includes(host)&&r.headers.get('origin')===`http://${host}`;
}
async function client(){
 const root=path.resolve(process.cwd(),'../local-backend');
 const env=Object.fromEntries((await readFile(path.join(root,'.env.local'),'utf8')).split('\n').filter(x=>x.includes('=')).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
 if(env.API_URL!=='http://127.0.0.1:54321')throw new Error('Local boundary rejected');
 const account=JSON.parse(await readFile(path.join(root,'exports/release-admin.json'),'utf8'));
 const c=createClient(env.API_URL,env.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await c.auth.signInWithPassword({email:account.email,password:account.password});if(error||data.user?.id!==account.id)throw new Error('Local administrator unavailable');return{c,id:account.id};
}
export async function POST(r:Request){
 if(!allowed(r))return new Response(null,{status:404});
 const reader=r.body?.getReader();if(!reader)return new Response(null,{status:400});
 try{
  let size=0;const chunks:Uint8Array[]=[];
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>5*1024*1024){await reader.cancel();return new Response(null,{status:413});}chunks.push(value);}
  const bytes=Buffer.concat(chunks);const {c,id}=await client();
  if(r.headers.get('content-type')==='image/jpeg'){
   const processor=sharp(bytes,{limitInputPixels:810000});const meta=await processor.metadata();
   if(meta.format!=='jpeg'||meta.width!==1200||meta.height!==675)return new Response(null,{status:422});
   const normalized=await processor.jpeg({quality:90}).toBuffer();const assetPath=`${id}/${randomUUID()}.jpg`;
   const {error}=await c.storage.from('app-campaigns').upload(assetPath,normalized,{contentType:'image/jpeg',upsert:false});if(error)throw error;
   const signed=await c.storage.from('app-campaigns').createSignedUrl(assetPath,3600);if(signed.error)throw signed.error;
   return Response.json({url:signed.data.signedUrl,path:assetPath,width:1200,height:675,bytes:normalized.length});
  }
  const {action,value}=JSON.parse(bytes.toString());
  if(action==='artwork'){
   if(typeof value!=='string'||! /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/.test(value))return new Response(null,{status:400});
   const result=await c.storage.from('app-campaigns').createSignedUrl(value,3600);if(result.error)throw result.error;return Response.json({url:result.data.signedUrl,path:value,width:1200,height:675,bytes:0});
  }
  return Response.json(await releaseOperation(c,action,value));
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Local Supabase rejected the request'},{status:400});}
}
